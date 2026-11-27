import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { isControlRequest, isKeyboardRequest, isPointerRequest } from '@electremote/protocol';
import type {
  ClipboardStatus,
  ControlResult,
  KeyboardRequest,
  KeyboardResult,
  KeyboardStatus,
  PointerRequest,
  PointerStatus,
} from '@electremote/protocol';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type { ControlMode, HostSnapshot, OnlineHostSnapshot } from '../shared/host';
import { createClipboardRouter } from './clipboard-router';
import type { TextClipboard } from './clipboard-router';
import type { HostSettingsStore } from './host-settings';
import type { MediaController } from './media-controller';
import { listNetworkInterfaces, selectPreferredInterface } from './network-interfaces';

const COOKIE_NAME = 'electremote_session';
const HEARTBEAT_INTERVAL_MS = 30_000;
const PERMISSION_RECHECK_INTERVAL_MS = 5_000;
const MAX_POINTER_MESSAGES_PER_SECOND = 60;
const POINTER_HOLD_TIMEOUT_MS = 3_000;
const KEYBOARD_COOLDOWN_MS = 100;

type SnapshotListener = (snapshot: HostSnapshot) => void;

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([cookieName]) => cookieName === name)?.[1];
}

function rejectUpgrade(
  socket: NodeJS.WritableStream,
  status: '403 Forbidden' | '404 Not Found',
): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.end();
}

function hasSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) {
    return false;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export class HostServer {
  private pairingToken = randomBytes(24).toString('base64url');
  private readonly listeners = new Set<SnapshotListener>();
  private readonly socketHealth = new Map<WebSocket, boolean>();
  private interfaces = listNetworkInterfaces();
  private selectedInterface = selectPreferredInterface(this.interfaces);
  private snapshot: HostSnapshot = { status: 'starting' };
  private server: Server | null = null;
  private webSocketServer: WebSocketServer | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private permissionRecheck: ReturnType<typeof setInterval> | null = null;
  private startPromise: Promise<HostSnapshot> | null = null;
  private stopPromise: Promise<void> | null = null;
  private changingPort = false;
  private shuttingDown = false;
  private pointerEnabled = false;
  private keyboardEnabled = false;
  private pointerBlocked = false;
  private keyboardBlocked = false;
  private clipboardEnabled = false;
  private clipboardAccessVersion = 0;
  private nextKeyboardRequestAt = 0;
  private pointerHold: { socket: WebSocket; timeout: ReturnType<typeof setTimeout> } | null = null;

  public constructor(
    private readonly remoteAssetsPath: string,
    private readonly mediaController: MediaController,
    private readonly clipboard: TextClipboard,
    private readonly settings: HostSettingsStore,
  ) {}

  public getSnapshot(): HostSnapshot {
    return this.snapshot;
  }

  public subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public start(): Promise<HostSnapshot> {
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startInternal().catch((error: unknown) => {
      console.error('Unable to start Electremote with the saved host settings.', error);
      return this.publish({
        status: 'error',
        message: 'Could not load or save the local host settings.',
      });
    });
    return this.startPromise;
  }

  public async changePort(port: number): Promise<HostSnapshot> {
    if (this.changingPort || this.shuttingDown) {
      throw new Error('The host is already restarting or quitting.');
    }

    this.changingPort = true;
    try {
      await this.startPromise;
      if (this.shuttingDown || (this.server?.listening && this.settings.port === port)) {
        return this.snapshot;
      }
      this.settings.setPort(port);
      this.publish({ status: 'starting' });
      await this.stopServer();
      return this.shuttingDown ? this.snapshot : await this.start();
    } finally {
      this.changingPort = false;
    }
  }

  public resetPairedDevices(): HostSnapshot {
    this.settings.resetSessions();
    this.pairingToken = randomBytes(24).toString('base64url');
    this.clipboardAccessVersion++;
    this.releasePointerHold(false);
    for (const socket of this.socketHealth.keys()) {
      socket.terminate();
    }
    this.socketHealth.clear();
    return this.publishOnlineSnapshot();
  }

  public refreshInterfaces(): HostSnapshot {
    this.interfaces = listNetworkInterfaces();
    this.selectedInterface = selectPreferredInterface(
      this.interfaces,
      this.settings.preferredAdapter,
    );
    return this.publishOnlineSnapshot();
  }

  public selectInterface(id: string): HostSnapshot {
    const candidate = this.interfaces.find((networkInterface) => networkInterface.id === id);

    if (!candidate) {
      throw new Error('The selected network interface is no longer available.');
    }

    this.settings.setPreferredAdapter(candidate);
    this.selectedInterface = candidate;
    return this.publishOnlineSnapshot();
  }

  public selectControlMode(mode: ControlMode): HostSnapshot {
    this.settings.setControlMode(mode);
    this.mediaController.setControlMode(mode);
    return this.publishOnlineSnapshot();
  }

  public setPointerEnabled(enabled: boolean): HostSnapshot {
    if (enabled && (!this.server?.listening || this.mediaController.refreshStatus() !== 'ready')) {
      this.publishOnlineSnapshot();
      throw new Error('Device control must be ready before enabling the phone touchpad.');
    }

    this.settings.setRemoteAccess('pointer', enabled);
    this.pointerBlocked = false;
    return this.publishOnlineSnapshot();
  }

  public setKeyboardEnabled(enabled: boolean): HostSnapshot {
    if (enabled && (!this.server?.listening || this.mediaController.refreshStatus() !== 'ready')) {
      this.publishOnlineSnapshot();
      throw new Error('Device control must be ready before enabling the phone keyboard.');
    }

    this.settings.setRemoteAccess('keyboard', enabled);
    this.keyboardBlocked = false;
    return this.publishOnlineSnapshot();
  }

  public setClipboardEnabled(enabled: boolean): HostSnapshot {
    if (enabled && !this.server?.listening) {
      throw new Error('Start the host before enabling clipboard sharing.');
    }

    this.settings.setRemoteAccess('clipboard', enabled);
    this.clipboardAccessVersion++;
    return this.publishOnlineSnapshot();
  }

  public refreshControlStatus(): HostSnapshot {
    const status = this.mediaController.refreshStatus();
    return this.snapshot.status === 'online' && this.snapshot.controlStatus !== status
      ? this.publishOnlineSnapshot()
      : this.snapshot;
  }

  public stop(): Promise<void> {
    this.shuttingDown = true;
    return this.stopServer();
  }

  private stopServer(): Promise<void> {
    this.stopPromise ??= this.closeServer().finally(() => {
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  private async closeServer(): Promise<void> {
    await this.startPromise;
    this.pointerEnabled = false;
    this.keyboardEnabled = false;
    this.clipboardEnabled = false;
    this.clipboardAccessVersion++;
    this.nextKeyboardRequestAt = 0;
    this.releasePointerHold(false);
    this.pointerBlocked = false;
    this.keyboardBlocked = false;
    this.stopPermissionRecheck();

    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }

    for (const socket of this.socketHealth.keys()) {
      socket.terminate();
    }
    this.socketHealth.clear();

    this.webSocketServer?.close();
    this.webSocketServer = null;

    const server = this.server;
    this.server = null;
    this.startPromise = null;

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  }

  private async startInternal(): Promise<HostSnapshot> {
    if (!fs.existsSync(path.join(this.remoteAssetsPath, 'index.html'))) {
      return this.publish({
        status: 'error',
        message: 'The remote interface has not been built. Run pnpm build and restart Electremote.',
      });
    }

    const port = this.settings.port;
    this.mediaController.setControlMode(this.settings.controlMode);
    this.interfaces = listNetworkInterfaces();
    const preference = this.settings.preferredAdapter;
    this.selectedInterface = selectPreferredInterface(this.interfaces, preference);
    if (!preference && !this.selectedInterface.localOnly) {
      this.settings.setPreferredAdapter(this.selectedInterface);
    }
    this.pairingToken = randomBytes(24).toString('base64url');
    const app = express();

    app.get('/', (request, response, next) => {
      const requestToken =
        typeof request.query.token === 'string' ? request.query.token : undefined;
      const paired = this.settings.acceptsSession(readCookie(request.headers.cookie, COOKIE_NAME));
      const prefetch = [request.get('Sec-Purpose'), request.get('Purpose')].some((purpose) =>
        purpose?.includes('prefetch'),
      );

      response.set('Cache-Control', 'no-store');
      if (requestToken && !paired && prefetch) {
        response.sendStatus(403);
        return;
      }
      if (
        requestToken &&
        (paired || (request.method === 'GET' && requestToken === this.pairingToken))
      ) {
        if (!paired) {
          let session: ReturnType<HostSettingsStore['createSession']>;
          try {
            session = this.settings.createSession();
          } catch (error) {
            console.error('Unable to save the pairing.', error);
            response.status(500).type('text').send('Electremote could not save this pairing.');
            return;
          }
          if (!session) {
            response
              .status(409)
              .type('text')
              .send('Too many paired devices. Reset them in Electremote.');
            return;
          }
          response.cookie(COOKIE_NAME, session.token, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            expires: new Date(session.expiresAt),
          });
          this.pairingToken = randomBytes(24).toString('base64url');
          this.publishOnlineSnapshot();
        }
        response.set('Referrer-Policy', 'no-referrer');
        response.redirect('/');
        return;
      }

      if (!paired) {
        response
          .status(403)
          .type('text')
          .send('Scan the current QR code in Electremote to pair this browser.');
        return;
      }

      next();
    });

    app.use((request, response, next) => {
      if (!this.settings.acceptsSession(readCookie(request.headers.cookie, COOKIE_NAME))) {
        response.sendStatus(403);
        return;
      }
      next();
    });
    app.use(
      createClipboardRouter(this.clipboard, () =>
        this.clipboardEnabled ? this.clipboardAccessVersion : null,
      ),
    );
    app.get('/favicon.ico', (_request, response) => response.sendStatus(204));
    app.use(express.static(this.remoteAssetsPath, { fallthrough: false }));

    return new Promise<HostSnapshot>((resolve, reject) => {
      const server = app.listen(port ?? 0, '0.0.0.0');
      this.server = server;

      const handleStartupError = (error: Error) => {
        this.server = null;
        const inUse = port !== null && 'code' in error && error.code === 'EADDRINUSE';
        resolve(
          this.publish({
            status: 'error',
            ...(port === null ? {} : { port }),
            message: inUse ? `Port ${port} is already in use. Choose another port.` : error.message,
          }),
        );
      };
      server.once('error', handleStartupError);

      server.once('listening', () => {
        server.removeListener('error', handleStartupError);
        server.on('error', (error) => console.error('Electremote host server error.', error));
        const address = server.address();
        try {
          if (!address || typeof address === 'string') {
            throw new Error('Unable to determine the local port.');
          }
          if (port === null) {
            this.settings.setPort(address.port);
          }
        } catch (error) {
          this.server = null;
          server.close(() => reject(error));
          server.closeAllConnections();
          return;
        }

        this.configureWebSockets(server);
        resolve(this.publishOnlineSnapshot());
      });
    });
  }

  private configureWebSockets(server: Server): void {
    const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 1_024 });
    this.webSocketServer = webSocketServer;

    server.on('upgrade', (request, socket, head) => {
      if (request.url?.split('?', 1)[0] !== '/ws') {
        rejectUpgrade(socket, '404 Not Found');
        return;
      }

      const origin = request.headers.origin;
      const host = request.headers.host;
      const sameOrigin = hasSameOrigin(origin, host);
      const authorized = this.settings.acceptsSession(
        readCookie(request.headers.cookie, COOKIE_NAME),
      );

      if (!sameOrigin || !authorized) {
        rejectUpgrade(socket, '403 Forbidden');
        return;
      }

      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request);
      });
    });

    webSocketServer.on('connection', (socket, request) => {
      const sessionToken = readCookie(request.headers.cookie, COOKIE_NAME);
      this.socketHealth.set(socket, true);
      let pointerWindowStartedAt = performance.now();
      let pointerMessages = 0;

      socket.on('error', (error) => {
        console.error('Remote WebSocket failed:', error.message);
      });
      socket.on('pong', () => this.socketHealth.set(socket, true));
      socket.on('message', (data, isBinary) => {
        if (!this.settings.acceptsSession(sessionToken)) {
          socket.close(1008, 'Pairing expired or revoked.');
          return;
        }
        if (isBinary) {
          socket.close(1008, 'Invalid control message.');
          return;
        }

        let value: unknown;
        try {
          value = JSON.parse(data.toString());
        } catch {
          socket.close(1008, 'Invalid control message.');
          return;
        }

        if (isPointerRequest(value)) {
          if (value.type === 'pointer-hold' && value.action === 'release') {
            if (this.pointerHold?.socket === socket) {
              this.releasePointerHold();
              this.publishOnlineSnapshot();
            }
            return;
          }

          if (!this.pointerEnabled) {
            // Revoking permission takes effect even for gestures already in flight.
            return;
          }

          const now = performance.now();
          if (now - pointerWindowStartedAt >= 1_000) {
            pointerWindowStartedAt = now;
            pointerMessages = 0;
          }
          if (++pointerMessages > MAX_POINTER_MESSAGES_PER_SECOND) {
            if (this.pointerHold?.socket === socket) {
              this.releasePointerHold();
              this.publishOnlineSnapshot();
            }
            socket.close(1008, 'Too many pointer messages.');
            return;
          }

          this.executePointer(socket, value);
          return;
        }

        if (isKeyboardRequest(value)) {
          socket.send(JSON.stringify(this.executeKeyboard(value)));
          return;
        }

        if (!isControlRequest(value)) {
          socket.close(1008, 'Invalid control message.');
          return;
        }

        const execution = this.mediaController.execute(value.command);
        const result: ControlResult = execution.ok
          ? { type: 'control-result', id: value.id, ok: true }
          : {
              type: 'control-result',
              id: value.id,
              ok: false,
              error: execution.error,
            };
        socket.send(JSON.stringify(result));
        this.publishOnlineSnapshot();
      });
      socket.on('close', () => {
        this.socketHealth.delete(socket);
        if (this.pointerHold?.socket === socket) {
          this.releasePointerHold();
        }
        this.publishOnlineSnapshot();
      });
      this.publishOnlineSnapshot();
      this.sendPointerStatus(socket);
      this.sendKeyboardStatus(socket);
      this.sendClipboardStatus(socket);
    });

    this.heartbeat = setInterval(() => {
      for (const [socket, alive] of this.socketHealth) {
        if (!alive) {
          socket.terminate();
          continue;
        }

        this.socketHealth.set(socket, false);
        socket.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeat.unref();
  }

  private executeKeyboard(request: KeyboardRequest): KeyboardResult {
    const result = { type: 'keyboard-result', id: request.id } as const;
    if (!this.keyboardEnabled) {
      return { ...result, ok: false, error: 'disabled' };
    }
    if (this.pointerHold || performance.now() < this.nextKeyboardRequestAt) {
      return { ...result, ok: false, error: 'busy' };
    }

    const error = this.mediaController.executeKeyboard(request);
    this.nextKeyboardRequestAt = performance.now() + KEYBOARD_COOLDOWN_MS;
    if (error === 'execution-failed') {
      this.keyboardBlocked = true;
    }
    if (error === 'permission-required' || error === 'execution-failed') {
      this.publishOnlineSnapshot();
    }
    return error ? { ...result, ok: false, error } : { ...result, ok: true };
  }

  private executePointer(socket: WebSocket, request: PointerRequest): void {
    const hold = this.pointerHold;
    if (hold && hold.socket !== socket) {
      return;
    }

    if (request.type === 'pointer-hold') {
      if (hold) {
        this.refreshControlStatus();
        this.pointerHold?.timeout.refresh();
      } else if (request.action === 'start') {
        if (!this.mediaController.setPointerHold(true)) {
          this.pausePointerAfterFailure();
          return;
        }
        const timeout = setTimeout(() => {
          this.releasePointerHold();
          this.publishOnlineSnapshot();
        }, POINTER_HOLD_TIMEOUT_MS);
        timeout.unref();
        this.pointerHold = { socket, timeout };
        this.sendPointerStatus(socket);
      }
      return;
    }

    if (hold && request.type === 'pointer-click') {
      return;
    }

    if (!this.mediaController.executePointer(request, hold !== null)) {
      this.pausePointerAfterFailure();
    }
  }

  private pausePointerAfterFailure(): void {
    this.pointerBlocked = this.mediaController.getStatus() !== 'permission-required';
    this.publishOnlineSnapshot();
  }

  private releasePointerHold(notify = true): void {
    const hold = this.pointerHold;
    if (!hold) {
      return;
    }

    clearTimeout(hold.timeout);
    this.pointerHold = null;
    if (!this.mediaController.setPointerHold(false)) {
      this.pointerEnabled = false;
      this.pointerBlocked = true;
    }
    if (notify) {
      this.sendPointerStatus(hold.socket);
    }
  }

  private publishOnlineSnapshot(): HostSnapshot {
    if (!this.server?.listening) {
      return this.snapshot;
    }

    const address = this.server.address();
    if (!address || typeof address === 'string') {
      return this.snapshot;
    }

    const remoteAccess = this.settings.remoteAccess;
    let controlStatus = this.mediaController.getStatus();
    this.pointerEnabled = remoteAccess.pointer && !this.pointerBlocked && controlStatus === 'ready';
    if (!this.pointerEnabled && this.pointerHold) {
      this.releasePointerHold(false);
      controlStatus = this.mediaController.getStatus();
    }
    this.keyboardEnabled =
      remoteAccess.keyboard && !this.keyboardBlocked && controlStatus === 'ready';
    this.clipboardEnabled = remoteAccess.clipboard;
    if (controlStatus === 'permission-required') {
      if (!this.permissionRecheck) {
        this.permissionRecheck = setInterval(
          () => this.refreshControlStatus(),
          PERMISSION_RECHECK_INTERVAL_MS,
        );
        this.permissionRecheck.unref();
      }
    } else {
      this.stopPermissionRecheck();
    }

    const url = `http://${this.selectedInterface.address}:${address.port}/`;
    const snapshot: OnlineHostSnapshot = {
      status: 'online',
      interfaces: this.interfaces,
      selectedInterfaceId: this.selectedInterface.id,
      url,
      pairingUrl: `${url}?token=${this.pairingToken}`,
      port: address.port,
      connectionCount: this.socketHealth.size,
      localOnly: this.selectedInterface.localOnly,
      controlMode: this.mediaController.getControlMode(),
      controlStatus,
      pointerEnabled: this.pointerEnabled,
      keyboardEnabled: this.keyboardEnabled,
      clipboardEnabled: this.clipboardEnabled,
      remoteAccess,
    };
    if (
      this.snapshot.status === 'online' &&
      this.snapshot.pointerEnabled !== snapshot.pointerEnabled
    ) {
      for (const socket of this.socketHealth.keys()) {
        this.sendPointerStatus(socket);
      }
    }
    if (
      this.snapshot.status === 'online' &&
      this.snapshot.keyboardEnabled !== snapshot.keyboardEnabled
    ) {
      for (const socket of this.socketHealth.keys()) {
        this.sendKeyboardStatus(socket);
      }
    }
    if (
      this.snapshot.status === 'online' &&
      this.snapshot.clipboardEnabled !== snapshot.clipboardEnabled
    ) {
      for (const socket of this.socketHealth.keys()) {
        this.sendClipboardStatus(socket);
      }
    }
    return this.publish(snapshot);
  }

  private sendPointerStatus(socket: WebSocket): void {
    if (socket.readyState === WebSocket.OPEN) {
      const status: PointerStatus = {
        type: 'pointer-status',
        enabled: this.pointerEnabled,
        holding: this.pointerHold?.socket === socket,
      };
      socket.send(JSON.stringify(status));
    }
  }

  private stopPermissionRecheck(): void {
    if (this.permissionRecheck) {
      clearInterval(this.permissionRecheck);
      this.permissionRecheck = null;
    }
  }

  private sendKeyboardStatus(socket: WebSocket): void {
    if (socket.readyState === WebSocket.OPEN) {
      const status: KeyboardStatus = {
        type: 'keyboard-status',
        enabled: this.keyboardEnabled,
        ...this.mediaController.getKeyboardCapabilities(),
      };
      socket.send(JSON.stringify(status));
    }
  }

  private sendClipboardStatus(socket: WebSocket): void {
    if (socket.readyState === WebSocket.OPEN) {
      const status: ClipboardStatus = { type: 'clipboard-status', enabled: this.clipboardEnabled };
      socket.send(JSON.stringify(status));
    }
  }

  private publish(snapshot: HostSnapshot): HostSnapshot {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
    return snapshot;
  }
}
