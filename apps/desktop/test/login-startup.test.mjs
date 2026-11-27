import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const vite = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  server: { middlewareMode: true, ws: false, watch: null },
});
after(() => vite.close());
const { getLinuxLoginStartup, setLinuxLoginStartup } = await vite.ssrLoadModule(
  '/src/main/login-startup.ts',
);

async function createConfigHome(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'electremote-autostart-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('Linux login startup is opt-in and removes only its own entry when disabled', async (t) => {
  const configHome = await createConfigHome(t);
  const executable = '/opt/Electremote Builds/Electremote';
  assert.equal(await getLinuxLoginStartup(executable, configHome), 'disabled');
  await setLinuxLoginStartup(true, executable, configHome);
  const autostart = path.join(configHome, 'autostart');
  assert.match(
    await readFile(path.join(autostart, 'com.antoniormrzz.electremote.desktop'), 'utf8'),
    /^Exec="\/opt\/Electremote Builds\/Electremote"$/m,
  );
  assert.equal(await getLinuxLoginStartup(executable, configHome), 'enabled');
  await writeFile(path.join(autostart, 'other.desktop'), 'Leave me alone.');
  await setLinuxLoginStartup(false, executable, configHome);
  await setLinuxLoginStartup(false, executable, configHome);
  assert.equal(await getLinuxLoginStartup(executable, configHome), 'disabled');
  assert.equal(await readFile(path.join(autostart, 'other.desktop'), 'utf8'), 'Leave me alone.');
});

test('Linux login startup respects desktop overrides and quotes executable paths', async (t) => {
  const configHome = await createConfigHome(t);
  const executable = '/opt/My $100% "setup" \\ folder/Electremote';
  await setLinuxLoginStartup(true, executable, configHome);
  const entry = path.join(configHome, 'autostart', 'com.antoniormrzz.electremote.desktop');
  const contents = await readFile(entry, 'utf8');
  assert.ok(
    contents.includes(String.raw`Exec="/opt/My \\$100%% \\"setup\\" \\\\ folder/Electremote"`),
  );
  assert.equal(await getLinuxLoginStartup('/opt/New Location/Electremote', configHome), 'disabled');
  await writeFile(entry, `${contents}Hidden=true\n`);
  assert.equal(await getLinuxLoginStartup(executable, configHome), 'disabled');
});
