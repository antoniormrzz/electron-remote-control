import path from 'node:path';
import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import { HOST_IPC_CHANNELS } from '../shared/host';
import { HostServer } from './host-server';

let mainWindow: BrowserWindow | null = null;
let hostServer: HostServer | null = null;
let quitting = false;

function broadcastHostSnapshot(): void {
  if (!hostServer) {
    return;
  }

  const snapshot = hostServer.getSnapshot();
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(HOST_IPC_CHANNELS.snapshotChanged, snapshot);
  }
}

function registerHostIpc(): void {
  ipcMain.handle(
    HOST_IPC_CHANNELS.getSnapshot,
    () => hostServer?.getSnapshot() ?? { status: 'starting' },
  );
  ipcMain.handle(
    HOST_IPC_CHANNELS.refreshInterfaces,
    () => hostServer?.refreshInterfaces() ?? { status: 'starting' },
  );
  ipcMain.handle(HOST_IPC_CHANNELS.selectInterface, (_event, id: unknown) => {
    if (typeof id !== 'string' || !hostServer) {
      throw new Error('Invalid network interface selection.');
    }

    return hostServer.selectInterface(id);
  });
  ipcMain.handle(HOST_IPC_CHANNELS.copyUrl, () => {
    const snapshot = hostServer?.getSnapshot();
    if (snapshot?.status !== 'online') {
      return false;
    }

    clipboard.writeText(snapshot.url);
    return true;
  });
}

function getRemoteAssetsPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'remote')
    : path.resolve(app.getAppPath(), '../remote/dist');
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#181a17',
    show: false,
    title: 'Electremote',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

void app.whenReady().then(() => {
  hostServer = new HostServer(getRemoteAssetsPath());
  hostServer.subscribe((snapshot) => {
    broadcastHostSnapshot();
    if (snapshot.status === 'error') {
      console.error(`Host failed to start: ${snapshot.message}`);
    }
    if (!app.isPackaged && snapshot.status === 'online') {
      console.info(`Remote available at ${snapshot.url} (${snapshot.connectionCount} connected)`);
    }
  });
  registerHostIpc();
  createMainWindow();
  void hostServer.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', (event) => {
  if (quitting || !hostServer) {
    return;
  }

  event.preventDefault();
  void hostServer.stop().finally(() => {
    quitting = true;
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
