import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resourcesDirectory = path.join(desktopDirectory, 'resources');
const assetsDirectory = path.join(desktopDirectory, 'assets');
const iconPath = path.join(assetsDirectory, 'icon.png');

await Promise.all(
  ['icon.png', 'icon.ico', 'icon.icns'].map((fileName) =>
    fs.access(path.join(assetsDirectory, fileName)),
  ),
);

const remoteBuildDirectory = path.resolve(desktopDirectory, '../remote/dist');
const packagedRemoteDirectory = path.join(resourcesDirectory, 'remote');
await fs.access(path.join(remoteBuildDirectory, 'index.html'));
await fs.rm(packagedRemoteDirectory, { recursive: true, force: true });
await fs.mkdir(packagedRemoteDirectory, { recursive: true });
await fs.cp(remoteBuildDirectory, packagedRemoteDirectory, { recursive: true });

const robotDirectory = path.dirname(require.resolve('robotjs/package.json'));
const robotPrebuild = path.join(
  robotDirectory,
  'prebuilds',
  `${process.platform}-${process.arch}`,
  'node.napi.node',
);
const packagedRobotDirectory = path.join(resourcesDirectory, 'robotjs');
await fs.access(robotPrebuild);
await fs.rm(packagedRobotDirectory, { recursive: true, force: true });
await fs.mkdir(packagedRobotDirectory, { recursive: true });
await fs.copyFile(robotPrebuild, path.join(packagedRobotDirectory, 'node.napi.node'));

await fs.access(iconPath);
await fs.copyFile(iconPath, path.join(resourcesDirectory, 'icon.png'));
