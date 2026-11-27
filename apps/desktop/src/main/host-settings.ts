import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isControlMode, isHostPort } from '../shared/host';
import type { ControlMode, RemoteAccess } from '../shared/host';
import type { NetworkInterfacePreference } from './network-interfaces';

const SESSION_LIFETIME_MS = 365 * 24 * 60 * 60 * 1_000;
const MAX_PAIRED_DEVICES = 32;
const DEFAULT_REMOTE_ACCESS: Readonly<RemoteAccess> = {
  pointer: false,
  keyboard: false,
  clipboard: false,
};

interface PairedSession {
  digest: string;
  expiresAt: number;
}

interface HostSettings {
  port: number | null;
  sessions: PairedSession[];
  controlMode?: ControlMode;
  preferredAdapter?: NetworkInterfacePreference;
  remoteAccess?: RemoteAccess;
}

function isRemoteAccess(value: unknown): value is RemoteAccess {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pointer' in value &&
    typeof value.pointer === 'boolean' &&
    'keyboard' in value &&
    typeof value.keyboard === 'boolean' &&
    'clipboard' in value &&
    typeof value.clipboard === 'boolean'
  );
}

function isNetworkInterfacePreference(value: unknown): value is NetworkInterfacePreference {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    'name' in value &&
    typeof value.name === 'string' &&
    value.name.length > 0
  );
}

function isPairedSession(value: unknown): value is PairedSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    'digest' in value &&
    typeof value.digest === 'string' &&
    /^[a-f0-9]{64}$/.test(value.digest) &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'number' &&
    Number.isSafeInteger(value.expiresAt) &&
    value.expiresAt > 0
  );
}

function readSettings(filePath: string): HostSettings {
  let contents: string;
  try {
    contents = readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { port: null, sessions: [] };
    }
    throw error;
  }

  const value: unknown = JSON.parse(contents);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('port' in value) ||
    (value.port !== null && !isHostPort(value.port)) ||
    !('sessions' in value) ||
    !Array.isArray(value.sessions) ||
    value.sessions.length > MAX_PAIRED_DEVICES ||
    !value.sessions.every(isPairedSession)
  ) {
    throw new Error('Invalid Electremote host settings.');
  }

  const result: HostSettings = { port: value.port, sessions: value.sessions };
  if ('controlMode' in value) {
    if (!isControlMode(value.controlMode)) {
      throw new Error('Invalid Electremote control mode setting.');
    }
    result.controlMode = value.controlMode;
  }
  if ('preferredAdapter' in value) {
    if (!isNetworkInterfacePreference(value.preferredAdapter)) {
      throw new Error('Invalid Electremote network adapter setting.');
    }
    result.preferredAdapter = value.preferredAdapter;
  }
  if ('remoteAccess' in value) {
    if (!isRemoteAccess(value.remoteAccess)) {
      throw new Error('Invalid Electremote remote access settings.');
    }
    result.remoteAccess = value.remoteAccess;
  }
  return result;
}

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class HostSettingsStore {
  private current: HostSettings | undefined;

  public constructor(private readonly filePath: string) {}

  public get port(): number | null {
    return this.settings.port;
  }

  public setPort(port: number): void {
    this.save({ ...this.settings, port });
  }

  public get controlMode(): ControlMode {
    return this.settings.controlMode ?? 'keyboard';
  }

  public setControlMode(controlMode: ControlMode): void {
    this.save({ ...this.settings, controlMode });
  }

  public get preferredAdapter(): NetworkInterfacePreference | undefined {
    return this.settings.preferredAdapter;
  }

  public setPreferredAdapter({ id, name }: NetworkInterfacePreference): void {
    this.save({ ...this.settings, preferredAdapter: { id, name } });
  }

  public get remoteAccess(): Readonly<RemoteAccess> {
    return this.settings.remoteAccess ?? DEFAULT_REMOTE_ACCESS;
  }

  public setRemoteAccess(feature: keyof RemoteAccess, enabled: boolean): void {
    this.save({ ...this.settings, remoteAccess: { ...this.remoteAccess, [feature]: enabled } });
  }

  public acceptsSession(token: string | undefined): boolean {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return false;
    }
    const digest = digestToken(token);
    const now = Date.now();
    return this.settings.sessions.some(
      (session) => session.digest === digest && session.expiresAt > now,
    );
  }

  public createSession(): { token: string; expiresAt: number } | null {
    const now = Date.now();
    const sessions = this.settings.sessions.filter((session) => session.expiresAt > now);
    if (sessions.length >= MAX_PAIRED_DEVICES) {
      return null;
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = now + SESSION_LIFETIME_MS;
    this.save({
      ...this.settings,
      sessions: [...sessions, { digest: digestToken(token), expiresAt }],
    });
    return { token, expiresAt };
  }

  public resetSessions(): void {
    this.save({ ...this.settings, sessions: [] });
  }

  private get settings(): HostSettings {
    return (this.current ??= readSettings(this.filePath));
  }

  private save(settings: HostSettings): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${randomBytes(8).toString('hex')}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(settings)}\n`, { flag: 'wx', mode: 0o600 });
    try {
      renameSync(temporaryPath, this.filePath);
    } catch (error) {
      try {
        unlinkSync(temporaryPath);
      } catch (cleanupError) {
        console.error('Unable to remove temporary host settings.', cleanupError);
      }
      throw error;
    }
    this.current = settings;
  }
}
