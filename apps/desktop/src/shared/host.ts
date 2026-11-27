export type ControlMode = 'keyboard' | 'media-keys';
export type RemoteAccess = Record<'pointer' | 'keyboard' | 'clipboard', boolean>;

export function isControlMode(value: unknown): value is ControlMode {
  return value === 'keyboard' || value === 'media-keys';
}

export function isHostPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1024 && value <= 65535;
}

export interface NetworkInterfaceCandidate {
  id: string;
  name: string;
  address: string;
  localOnly: boolean;
}

export interface StartingHostSnapshot {
  status: 'starting';
}

export interface OnlineHostSnapshot {
  status: 'online';
  interfaces: readonly NetworkInterfaceCandidate[];
  selectedInterfaceId: string;
  url: string;
  pairingUrl: string;
  port: number;
  connectionCount: number;
  localOnly: boolean;
  controlMode: ControlMode;
  controlStatus: 'ready' | 'permission-required' | 'unavailable';
  pointerEnabled: boolean;
  keyboardEnabled: boolean;
  clipboardEnabled: boolean;
  remoteAccess: Readonly<RemoteAccess>;
}

export interface ErrorHostSnapshot {
  status: 'error';
  message: string;
  port?: number;
}

export type HostSnapshot = StartingHostSnapshot | OnlineHostSnapshot | ErrorHostSnapshot;

export type LoginStartupStatus = 'enabled' | 'disabled' | 'requires-approval' | 'unavailable';

export interface ElectremoteApi {
  getHostSnapshot(): Promise<HostSnapshot>;
  onHostSnapshot(callback: (snapshot: HostSnapshot) => void): () => void;
  refreshNetworkInterfaces(): Promise<HostSnapshot>;
  selectNetworkInterface(id: string): Promise<HostSnapshot>;
  selectControlMode(mode: ControlMode): Promise<HostSnapshot>;
  setPointerEnabled(enabled: boolean): Promise<HostSnapshot>;
  setKeyboardEnabled(enabled: boolean): Promise<HostSnapshot>;
  setClipboardEnabled(enabled: boolean): Promise<HostSnapshot>;
  changePort(port: number): Promise<HostSnapshot>;
  resetPairedDevices(): Promise<HostSnapshot>;
  copyHostUrl(): Promise<boolean>;
  copyPairingUrl(): Promise<boolean>;
  getLoginStartup(): Promise<LoginStartupStatus>;
  setLoginStartup(enabled: boolean): Promise<LoginStartupStatus>;
}

export const HOST_IPC_CHANNELS = {
  copyUrl: 'host:copy-url',
  getSnapshot: 'host:get-snapshot',
  refreshInterfaces: 'host:refresh-interfaces',
  selectInterface: 'host:select-interface',
  selectControlMode: 'host:select-control-mode',
  setPointerEnabled: 'host:set-pointer-enabled',
  setKeyboardEnabled: 'host:set-keyboard-enabled',
  setClipboardEnabled: 'host:set-clipboard-enabled',
  changePort: 'host:change-port',
  resetPairedDevices: 'host:reset-paired-devices',
  copyPairingUrl: 'host:copy-pairing-url',
  getLoginStartup: 'host:get-login-startup',
  setLoginStartup: 'host:set-login-startup',
  snapshotChanged: 'host:snapshot-changed',
} as const;
