import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type { HostSnapshot, OnlineHostSnapshot } from '../shared/host';
import { listNetworkInterfaces, selectPreferredInterface } from './network-interfaces';

const COOKIE_NAME = 'electremote_session';
const HEARTBEAT_INTERVAL_MS = 30_000;

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
  private readonly token = randomBytes(24).toString('base64url');
  private readonly listeners = new Set<SnapshotListener>();
  private readonly socketHealth = new Map<WebSocket, boolean>();
  private interfaces = listNetworkInterfaces();
  private selectedInterface = selectPreferredInterface(this.interfaces);
  private snapshot: HostSnapshot = { status: 'starting' };
  private server: Server | null = null;
  private webSocketServer: WebSocketServer | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private startPromise: Promise<HostSnapshot> | null = null;

  public constructor(private readonly remoteAssetsPath: string) {}

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

    this.startPromise = this.startInternal();
    return this.startPromise;
  }

  public refreshInterfaces(): HostSnapshot {
    this.interfaces = listNetworkInterfaces();
    this.selectedInterface = selectPreferredInterface(this.interfaces, this.selectedInterface.id);
    return this.publishOnlineSnapshot();
  }

  public selectInterface(id: string): HostSnapshot {
    const candidate = this.interfaces.find((networkInterface) => networkInterface.id === id);

    if (!candidate) {
      throw new Error('The selected network interface is no longer available.');
    }

    this.selectedInterface = candidate;
    return this.publishOnlineSnapshot();
  }

  public async stop(): Promise<void> {
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
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  private async startInternal(): Promise<HostSnapshot> {
    if (!fs.existsSync(path.join(this.remoteAssetsPath, 'index.html'))) {
      return this.publish({
        status: 'error',
        message: 'The remote interface has not been built. Run pnpm build and restart Electremote.',
      });
    }

    const app = express();

    app.get('/', (request, response, next) => {
      const requestToken =
        typeof request.query.token === 'string' ? request.query.token : undefined;

      if (requestToken === this.token) {
        response.cookie(COOKIE_NAME, this.token, {
          httpOnly: true,
          sameSite: 'strict',
          path: '/',
        });
        response.redirect('/');
        return;
      }

      if (readCookie(request.headers.cookie, COOKIE_NAME) !== this.token) {
        response.sendStatus(403);
        return;
      }

      next();
    });

    app.use((request, response, next) => {
      if (readCookie(request.headers.cookie, COOKIE_NAME) !== this.token) {
        response.sendStatus(403);
        return;
      }
      next();
    });
    app.get('/favicon.ico', (_request, response) => response.sendStatus(204));
    app.use(express.static(this.remoteAssetsPath, { fallthrough: false }));

    return new Promise<HostSnapshot>((resolve) => {
      const server = app.listen(0, '0.0.0.0');
      this.server = server;

      server.once('error', (error) => {
        this.server = null;
        this.startPromise = null;
        resolve(
          this.publish({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to start the local server.',
          }),
        );
      });

      server.once('listening', () => {
        const address = server.address();

        if (!address || typeof address === 'string') {
          resolve(
            this.publish({ status: 'error', message: 'Unable to determine the local port.' }),
          );
          return;
        }

        this.configureWebSockets(server);
        resolve(this.publishOnlineSnapshot());
      });
    });
  }

  private configureWebSockets(server: Server): void {
    const webSocketServer = new WebSocketServer({ noServer: true });
    this.webSocketServer = webSocketServer;

    server.on('upgrade', (request, socket, head) => {
      const requestUrl = new URL(request.url ?? '/', 'http://localhost');

      if (requestUrl.pathname !== '/ws') {
        rejectUpgrade(socket, '404 Not Found');
        return;
      }

      const origin = request.headers.origin;
      const host = request.headers.host;
      const sameOrigin = hasSameOrigin(origin, host);
      const authorized = readCookie(request.headers.cookie, COOKIE_NAME) === this.token;

      if (!sameOrigin || !authorized) {
        rejectUpgrade(socket, '403 Forbidden');
        return;
      }

      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request);
      });
    });

    webSocketServer.on('connection', (socket) => {
      this.socketHealth.set(socket, true);
      this.publishOnlineSnapshot();

      socket.on('pong', () => this.socketHealth.set(socket, true));
      socket.on('message', () => socket.close(1008, 'Controls are not available yet.'));
      socket.on('close', () => {
        this.socketHealth.delete(socket);
        this.publishOnlineSnapshot();
      });
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

  private publishOnlineSnapshot(): HostSnapshot {
    if (!this.server?.listening) {
      return this.snapshot;
    }

    const address = this.server.address();
    if (!address || typeof address === 'string') {
      return this.snapshot;
    }

    const snapshot: OnlineHostSnapshot = {
      status: 'online',
      interfaces: this.interfaces,
      selectedInterfaceId: this.selectedInterface.id,
      url: `http://${this.selectedInterface.address}:${address.port}/?token=${this.token}`,
      port: address.port,
      connectionCount: this.socketHealth.size,
      localOnly: this.selectedInterface.localOnly,
    };
    return this.publish(snapshot);
  }

  private publish(snapshot: HostSnapshot): HostSnapshot {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
    return snapshot;
  }
}
