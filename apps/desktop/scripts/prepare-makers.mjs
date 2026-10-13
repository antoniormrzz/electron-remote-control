import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url);
  const nodeGyp = require.resolve('node-gyp/bin/node-gyp.js');
  const helpers = [
    { packageName: 'macos-alias', binary: 'volume.node' },
    { packageName: 'fs-xattr', binary: 'xattr.node' },
  ];

  for (const helper of helpers) {
    const packageDirectory = path.dirname(require.resolve(`${helper.packageName}/package.json`));
    const binaryPath = path.join(packageDirectory, 'build', 'Release', helper.binary);

    try {
      await fs.access(binaryPath);
      continue;
    } catch {
      // The DMG maker's legacy native helpers do not declare explicit install scripts.
    }

    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [nodeGyp, 'rebuild', '--directory', packageDirectory], {
        stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to build ${helper.packageName} for the DMG maker.`));
        }
      });
    });
  }
}
