import path from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  MenuItem,
  nativeImage,
  screen,
  Tray,
} from 'electron';
import { HOST_IPC_CHANNELS, isControlMode, isHostPort } from '../shared/host';
import { HostServer } from './host-server';
import { HostSettingsStore } from './host-settings';
import { getLoginStartup, setLoginStartup } from './login-startup';
import { MediaController } from './media-controller';

let mainWindow: BrowserWindow | null = null;
let hostServer: HostServer | null = null;
let tray: Tray | null = null;
let keepRunningOnClose = process.platform === 'win32';
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
  ipcMain.handle(HOST_IPC_CHANNELS.selectControlMode, (_event, mode: unknown) => {
    if (!isControlMode(mode) || !hostServer) {
      throw new Error('Invalid control mode selection.');
    }

    return hostServer.selectControlMode(mode);
  });
  ipcMain.handle(HOST_IPC_CHANNELS.setPointerEnabled, (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean' || !hostServer) {
      throw new Error('Invalid phone touchpad setting.');
    }

    return hostServer.setPointerEnabled(enabled);
  });
  ipcMain.handle(HOST_IPC_CHANNELS.setKeyboardEnabled, (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean' || !hostServer) {
      throw new Error('Invalid phone keyboard setting.');
    }

    return hostServer.setKeyboardEnabled(enabled);
  });
  ipcMain.handle(HOST_IPC_CHANNELS.setClipboardEnabled, (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean' || !hostServer) {
      throw new Error('Invalid clipboard sharing setting.');
    }

    return hostServer.setClipboardEnabled(enabled);
  });
  ipcMain.handle(HOST_IPC_CHANNELS.copyUrl, async () => {
    const snapshot = hostServer?.getSnapshot();
    if (snapshot?.status !== 'online') {
      return false;
    }

    await clipboard.writeText(snapshot.url);
    return true;
  });
  ipcMain.handle(HOST_IPC_CHANNELS.copyPairingUrl, async () => {
    const snapshot = hostServer?.getSnapshot();
    if (snapshot?.status !== 'online') {
      return false;
    }

    await clipboard.writeText(snapshot.pairingUrl);
    return true;
  });
  ipcMain.handle(HOST_IPC_CHANNELS.changePort, (_event, port: unknown) => {
    if (!isHostPort(port) || !hostServer) {
      throw new Error('Enter a port between 1024 and 65535.');
    }
    return hostServer.changePort(port);
  });
  ipcMain.handle(HOST_IPC_CHANNELS.resetPairedDevices, () => {
    if (!hostServer) {
      throw new Error('The host is unavailable.');
    }
    return hostServer.resetPairedDevices();
  });
  ipcMain.handle(HOST_IPC_CHANNELS.getLoginStartup, () => getLoginStartup(app));
  ipcMain.handle(HOST_IPC_CHANNELS.setLoginStartup, (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid start at login setting.');
    }
    return setLoginStartup(app, enabled);
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

function getAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.resolve(app.getAppPath(), 'assets/icon.png');
}

function createMainWindow(): void {
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
    ...(process.platform === 'linux' ? { icon: getAppIconPath() } : {}),
    show: false,
    title: 'Electremote',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
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

function showMainWindow(): void {
  if (quitting) {
    return;
  }
  if (!mainWindow) {
    createMainWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  if (process.platform !== 'win32' && process.platform !== 'linux') {
    return;
  }

  const icon = nativeImage.createFromPath(getAppIconPath());
  if (icon.isEmpty()) {
    console.error('Unable to load the Electremote tray icon.');
    return;
  }

  try {
    tray = new Tray(icon.resize({ width: 32, height: 32 }));
  } catch (error) {
    console.error('Unable to create the Electremote tray icon.', error);
    return;
  }

  const menu = new Menu();
  menu.append(new MenuItem({ label: 'Show Electremote', click: showMainWindow }));
  // A Linux desktop may not display the icon even if Electron creates it.
  if (process.platform === 'linux') {
    menu.append(
      new MenuItem({
        label: 'Keep running when the window closes',
        type: 'checkbox',
        click: (item) => {
          keepRunningOnClose = item.checked;
          tray?.setContextMenu(menu);
        },
      }),
    );
  }
  menu.append(new MenuItem({ type: 'separator' }));
  menu.append(new MenuItem({ label: 'Quit Electremote', click: () => app.quit() }));

  tray.setToolTip('Electremote');
  tray.setContextMenu(menu);
  tray.on('click', showMainWindow);
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.antoniormrzz.electremote');
}

if (hasSingleInstanceLock) {
  void app.whenReady().then(() => {
    const mediaController = new MediaController(getPackagedRobotBinaryPath());
    mediaController.initialize();
    const hostSettings = new HostSettingsStore(
      path.join(app.getPath('userData'), 'host-settings.json'),
    );
    const usesWaylandClipboard =
      process.platform === 'linux' &&
      process.env.XDG_SESSION_TYPE === 'wayland' &&
      app.commandLine.getSwitchValue('ozone-platform') !== 'x11';
    hostServer = new HostServer(
      getRemoteAssetsPath(),
      mediaController,
      {
        readText: () => clipboard.readText(),
        writeText: (text) => clipboard.writeText(text),
        canAccess: () => !usesWaylandClipboard || mainWindow?.isFocused() === true,
      },
      hostSettings,
    );
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
    createTray();
    void hostServer.start();

    app.on('activate', showMainWindow);
    app.on('second-instance', showMainWindow);
  });
}

app.on('before-quit', (event) => {
  if (!hostServer) {
    return;
  }

  event.preventDefault();
  if (quitting) {
    return;
  }

  quitting = true;
  void hostServer
    .stop()
    .catch((error: unknown) => console.error('Unable to stop the Electremote host.', error))
    .finally(() => {
      hostServer = null;
      app.quit();
    });
});

app.on('will-quit', () => {
  tray?.destroy();
  tray = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !(tray && keepRunningOnClose)) {
    app.quit();
  }
});
