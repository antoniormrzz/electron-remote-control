import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as robot from 'robotjs';
import cors = require('cors');
import express = require('express');
import localIpV4Address = require('local-ipv4-address');

const exapp = express();
exapp.use(cors())
exapp.use(express.static(path.join(__dirname, 'pwa', 'www')));

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

const createWindow = () => {

  exapp.get('/play-pause', (req, res) => {
    robot.keyTap('space');
    res.send('ok');
  });
  exapp.get('/volume-up', (req, res) => {
    robot.keyTap('up');
    res.send('ok');
  });
  exapp.get('/volume-down', (req, res) => {
    robot.keyTap('down');
    res.send('ok');
  });
  exapp.get('/rewind', (req, res) => {
    robot.keyTap('left');
    res.send('ok');
  });
  exapp.get('/fast-forward', (req, res) => {
    robot.keyTap('right');
    res.send('ok');
  });

  exapp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname + '/pwa/www/index.html'));
  });

  const exserver = exapp.listen(0, async () => {
    const ip = (await localIpV4Address()) + ':' + exserver.address().port;
    // Create the browser window.
    const mainWindow = new BrowserWindow({
      height: 600,
      width: 600,
      webPreferences: {
        nodeIntegration: true,
      },
      icon: path.join(__dirname, 'res', 'icon_512x512.png')
    });

    mainWindow.removeMenu();
    // and load the index.html of the app.
    mainWindow.loadFile(path.join(__dirname, '../src/index.html'));



    // Open the DevTools.
    // mainWindow.webContents.openDevTools();

    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('ip', 'http://' + ip)
    })

  });




};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


