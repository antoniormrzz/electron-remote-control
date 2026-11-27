export type ControlMode = 'keyboard' | 'media-keys';

export function isControlMode(value: unknown): value is ControlMode {
  return value === 'keyboard' || value === 'media-keys';
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
  port: number;
  connectionCount: number;
  localOnly: boolean;
  controlMode: ControlMode;
  controlStatus: 'ready' | 'permission-required' | 'unavailable';
}

export interface ErrorHostSnapshot {
  status: 'error';
  message: string;
}

export type HostSnapshot = StartingHostSnapshot | OnlineHostSnapshot | ErrorHostSnapshot;

export interface ElectremoteApi {
  getHostSnapshot(): Promise<HostSnapshot>;
  onHostSnapshot(callback: (snapshot: HostSnapshot) => void): () => void;
  refreshNetworkInterfaces(): Promise<HostSnapshot>;
  selectNetworkInterface(id: string): Promise<HostSnapshot>;
  selectControlMode(mode: ControlMode): Promise<HostSnapshot>;
  copyHostUrl(): Promise<boolean>;
}

export const HOST_IPC_CHANNELS = {
  copyUrl: 'host:copy-url',
  getSnapshot: 'host:get-snapshot',
  refreshInterfaces: 'host:refresh-interfaces',
  selectInterface: 'host:select-interface',
  selectControlMode: 'host:select-control-mode',
  snapshotChanged: 'host:snapshot-changed',
} as const;
