import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IconIcns, IconIco } from '@shockpkg/icon-encoder';
import sharp from 'sharp';

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDirectory = path.join(desktopDirectory, 'assets');
const sourcePath = path.join(assetsDirectory, 'icon.svg');
const source = await fs.readFile(sourcePath);

async function render(size) {
  return sharp(source, { density: 384 })
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const images = new Map(await Promise.all(sizes.map(async (size) => [size, await render(size)])));

await fs.writeFile(path.join(assetsDirectory, 'icon.png'), images.get(1024));

const ico = new IconIco();
for (const size of [256, 128, 64, 48, 32, 16]) {
  await ico.addFromPng(images.get(size), null, true);
}
await fs.writeFile(path.join(assetsDirectory, 'icon.ico'), ico.encode());

const icns = new IconIcns();
icns.toc = true;
const icnsEntries = [
  [16, ['ic04']],
  [32, ['ic05', 'ic11']],
  [64, ['ic12']],
  [128, ['ic07']],
  [256, ['ic08', 'ic13']],
  [512, ['ic09', 'ic14']],
  [1024, ['ic10']],
];

for (const [size, types] of icnsEntries) {
  await icns.addFromPng(images.get(size), types, true);
}
await fs.writeFile(path.join(assetsDirectory, 'icon.icns'), icns.encode());
