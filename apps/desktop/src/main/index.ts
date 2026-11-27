import path from 'node:path';
import { app, BrowserWindow, clipboard, ipcMain, screen } from 'electron';
import { HOST_IPC_CHANNELS } from '../shared/host';
import { HostServer } from './host-server';
import { MediaController } from './media-controller';

let mainWindow: BrowserWindow | null = null;
let hostServer: HostServer | null = null;
let quitting = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

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

function getPackagedRobotBinaryPath(): string | undefined {
  return app.isPackaged ? path.join(process.resourcesPath, 'robotjs', 'node.napi.node') : undefined;
}

function getWindowIconPath(): string | undefined {
  if (process.platform !== 'linux') {
    return undefined;
  }

  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.resolve(app.getAppPath(), 'assets/icon.png');
}

function createMainWindow(): void {
  const icon = getWindowIconPath();
  // Wayland does not provide global cursor or window coordinates.
  const useGlobalPosition = process.platform !== 'linux';
  const { workArea } = useGlobalPosition
    ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    : screen.getPrimaryDisplay();
  const width = Math.min(960, workArea.width);
  const height = Math.min(680, workArea.height);
  const position = useGlobalPosition
    ? {
        x: workArea.x + Math.floor((workArea.width - width) / 2),
        y: workArea.y + Math.floor((workArea.height - height) / 2),
      }
    : {};

  mainWindow = new BrowserWindow({
    width,
    height,
    ...position,
    minWidth: Math.min(720, width),
    minHeight: Math.min(560, height),
    backgroundColor: '#181a17',
    ...(icon ? { icon } : {}),
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

  if (process.platform === 'darwin') {
    mainWindow.on('focus', () => hostServer?.refreshControlStatus());
  }

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

if (process.platform === 'win32') {
  app.setAppUserModelId('com.antoniormrzz.electremote');
}

app.on('second-instance', () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
});

if (hasSingleInstanceLock) {
  void app.whenReady().then(() => {
    const mediaController = new MediaController(getPackagedRobotBinaryPath());
    mediaController.initialize();
    hostServer = new HostServer(getRemoteAssetsPath(), mediaController);
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
}

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
