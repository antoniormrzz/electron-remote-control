import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDirectory = path.resolve(desktopDirectory, '../..');
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (!tag?.startsWith('v')) {
  throw new Error('Provide a release tag such as v0.1.0.');
}

const [rootPackage, desktopPackage] = await Promise.all(
  [path.join(rootDirectory, 'package.json'), path.join(desktopDirectory, 'package.json')].map(
    async (packagePath) => JSON.parse(await fs.readFile(packagePath, 'utf8')),
  ),
);

const expectedTag = `v${rootPackage.version}`;
if (desktopPackage.version !== rootPackage.version) {
  throw new Error(
    `Package versions do not match: root=${rootPackage.version}, desktop=${desktopPackage.version}.`,
  );
}

if (tag !== expectedTag) {
  throw new Error(`Release tag ${tag} does not match package version ${expectedTag}.`);
}

console.info(`Release tag ${tag} matches all package versions.`);
