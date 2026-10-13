import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const assetsDirectory = path.join(desktopDirectory, 'assets');
const description = 'Control desktop media playback from another device on the same local network.';

const config: ForgeConfig = {
  packagerConfig: {
    appCategoryType: 'public.app-category.music',
    appBundleId: 'com.antoniormrzz.electremote',
    appCopyright: 'Copyright (c) 2020-2026 Antonio Ramirez',
    asar: true,
    extraResource: ['resources/remote', 'resources/robotjs', 'resources/icon.png'],
    icon: path.join(assetsDirectory, 'icon'),
    name: 'Electremote',
    win32metadata: {
      CompanyName: 'Antonio Ramirez',
      FileDescription: 'Electremote desktop media remote control',
      InternalName: 'Electremote',
      OriginalFilename: 'electremote.exe',
      ProductName: 'Electremote',
    },
  },
  makers: [
    new MakerSquirrel(
      {
        authors: 'Antonio Ramirez',
        description,
        name: 'Electremote',
        setupIcon: path.join(assetsDirectory, 'icon.ico'),
      },
      ['win32'],
    ),
    new MakerDMG(
      {
        icon: path.join(assetsDirectory, 'icon.icns'),
        name: 'Electremote',
        overwrite: true,
      },
      ['darwin'],
    ),
    new MakerDeb(
      {
        options: {
          categories: ['AudioVideo', 'Utility'],
          bin: 'Electremote',
          description,
          genericName: 'Media Remote Control',
          homepage: 'https://github.com/antoniormrzz/electron-remote-control',
          icon: path.join(assetsDirectory, 'icon.png'),
          maintainer: 'Antonio Ramirez',
          name: 'electremote',
          productDescription: description,
          productName: 'Electremote',
          section: 'utils',
        },
      },
      ['linux'],
    ),
    new MakerRpm(
      {
        options: {
          categories: ['AudioVideo', 'Utility'],
          bin: 'Electremote',
          description,
          genericName: 'Media Remote Control',
          homepage: 'https://github.com/antoniormrzz/electron-remote-control',
          icon: path.join(assetsDirectory, 'icon.png'),
          license: 'MIT',
          name: 'electremote',
          productDescription: description,
          productName: 'Electremote',
        },
      },
      ['linux'],
    ),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.mts',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.mts',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
  ],
};

export default config;
