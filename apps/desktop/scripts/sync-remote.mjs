import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const remoteBuildDirectory = path.resolve(desktopDirectory, '../remote/dist');
const packagedResourceDirectory = path.join(desktopDirectory, 'resources/remote');

await fs.access(path.join(remoteBuildDirectory, 'index.html'));
await fs.rm(packagedResourceDirectory, { recursive: true, force: true });
await fs.mkdir(path.dirname(packagedResourceDirectory), { recursive: true });
await fs.cp(remoteBuildDirectory, packagedResourceDirectory, { recursive: true });
