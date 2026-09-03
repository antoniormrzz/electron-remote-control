import { contextBridge, ipcRenderer } from 'electron';
import { HOST_IPC_CHANNELS } from '../shared/host';
import type { ElectremoteApi, HostSnapshot } from '../shared/host';

const api: ElectremoteApi = {
  getHostSnapshot: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getSnapshot),
  onHostSnapshot: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: HostSnapshot): void =>
      callback(snapshot);
    ipcRenderer.on(HOST_IPC_CHANNELS.snapshotChanged, listener);
    return () => ipcRenderer.removeListener(HOST_IPC_CHANNELS.snapshotChanged, listener);
  },
  refreshNetworkInterfaces: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.refreshInterfaces),
  selectNetworkInterface: (id) => ipcRenderer.invoke(HOST_IPC_CHANNELS.selectInterface, id),
  copyHostUrl: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.copyUrl),
};

contextBridge.exposeInMainWorld('electremote', api);
