import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import WebSocket from 'ws';
import {
  CLIPBOARD_REQUEST_HEADER,
  CLIPBOARD_TEXT_PATH,
  MAX_CLIPBOARD_TEXT_BYTES,
} from '../../../libs/protocol/src/clipboard.ts';

const vite = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  server: { middlewareMode: true, ws: false, watch: null },
  ssr: { noExternal: ['@electremote/protocol'] },
});
after(() => vite.close());
const { HostServer } = await vite.ssrLoadModule('/src/main/host-server.ts');
const { HostSettingsStore } = await vite.ssrLoadModule('/src/main/host-settings.ts');

async function createHostFixture(
  t,
  clipboard = { readText: async () => '', writeText: async () => {} },
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'electremote-host-test-'));
  const settingsPath = path.join(directory, 'host-settings.json');
  const hosts = [];
  t.after(async () => {
    await Promise.all(hosts.map((host) => host.stop()));
    await rm(directory, { recursive: true, force: true });
  });
  const mediaController = {
    getStatus: () => 'permission-required',
    getControlMode: () => 'keyboard',
    getKeyboardCapabilities: () => ({ primaryModifier: 'control', textSupport: 'ascii' }),
  };
  return {
    settingsPath,
    open() {
      const host = new HostServer(
        fileURLToPath(new URL('../../remote', import.meta.url)),
        mediaController,
        clipboard,
        new HostSettingsStore(settingsPath),
      );
      hosts.push(host);
      return host;
    },
  };
}

function loopback(remoteUrl) {
  const url = new URL(remoteUrl);
  url.hostname = '127.0.0.1';
  return url;
}

async function pair(snapshot) {
  const session = await fetch(loopback(snapshot.pairingUrl), { redirect: 'manual' });
  assert.equal(session.status, 302);
  assert.equal(session.headers.get('location'), '/');
  const setCookie = session.headers.get('set-cookie');
  assert.match(setCookie, /Expires=.*HttpOnly; SameSite=Lax/);
  return setCookie.split(';', 1)[0];
}

async function setup(t, clipboard) {
  const fixture = await createHostFixture(t, clipboard);
  const host = fixture.open();
  const snapshot = await host.start();
  const cookie = await pair(snapshot);
  const endpoint = new URL(CLIPBOARD_TEXT_PATH, loopback(snapshot.url));
  const headers = { Cookie: cookie, [CLIPBOARD_REQUEST_HEADER]: '1' };
  return {
    host,
    request: (options) => fetch(endpoint, { headers, ...options }),
    write: (body) =>
      fetch(endpoint, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'text/plain' },
        body,
      }),
    cookie,
  };
}

test('a clean bookmark and its cookie survive a new host instance', async (t) => {
  const { open, settingsPath } = await createHostFixture(t);
  const first = open();
  const online = await first.start();
  const address = loopback(online.url);
  assert.equal(address.search, '');
  const pairingAddress = loopback(online.pairingUrl);
  assert.equal((await fetch(pairingAddress, { method: 'HEAD' })).status, 403);
  assert.equal((await fetch(pairingAddress, { headers: { Purpose: 'prefetch' } })).status, 403);
  const cookie = await pair(online);
  assert.notEqual(first.getSnapshot().pairingUrl, online.pairingUrl);
  assert.equal((await fetch(pairingAddress, { redirect: 'manual' })).status, 403);
  assert.equal((await fetch(address, { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(address)).status, 403);
  const secondCookie = await pair(first.getSnapshot());
  assert.notEqual(cookie, secondCookie);
  const stored = await readFile(settingsPath, 'utf8');
  assert.equal(JSON.parse(stored).port, online.port);
  assert.ok(!stored.includes(cookie.split('=')[1]));
  await first.stop();

  const restarted = open();
  const newSnapshot = await restarted.start();
  assert.equal(newSnapshot.url, online.url);
  assert.equal((await fetch(address, { headers: { Cookie: cookie } })).status, 200);
  const socketUrl = new URL('/ws', address);
  socketUrl.protocol = 'ws:';
  const socket = new WebSocket(socketUrl, { headers: { Cookie: cookie, Origin: address.origin } });
  await once(socket, 'open');

  const disconnected = once(socket, 'close');
  restarted.resetPairedDevices();
  await disconnected;
  assert.equal((await fetch(address, { headers: { Cookie: cookie } })).status, 403);
  await restarted.stop();
  const afterReset = open();
  assert.equal((await afterReset.start()).url, online.url);
  assert.equal((await fetch(address, { headers: { Cookie: cookie } })).status, 403);
});

test('a port conflict is reported, not silently replaced, and can be retried', async (t) => {
  const { open } = await createHostFixture(t);
  const host = open();
  await host.start();
  const occupied = createTcpServer();
  occupied.listen(0, '0.0.0.0');
  await once(occupied, 'listening');
  try {
    const { port } = occupied.address();
    const conflict = await host.changePort(port);
    assert.deepEqual(conflict, {
      status: 'error',
      port,
      message: `Port ${port} is already in use. Choose another port.`,
    });
    const restarted = open();
    assert.deepEqual(await restarted.start(), conflict);
    await restarted.stop();
    await new Promise((resolve) => occupied.close(resolve));
    const online = await host.changePort(port);
    assert.equal(online.port, port);
    assert.equal(online.status, 'online');
  } finally {
    if (occupied.listening) {
      await new Promise((resolve) => occupied.close(resolve));
    }
  }
});

test('clipboard access requires pairing, explicit requests, and desktop opt-in', async (t) => {
  let reads = 0;
  const { host, request, write, cookie } = await setup(t, {
    readText: async () => {
      reads++;
      return 'desktop';
    },
    writeText: async () => assert.fail('Unexpected write'),
  });
  assert.equal((await request()).status, 403);
  assert.equal((await write('phone')).status, 403);
  host.setClipboardEnabled(true);
  assert.equal((await request({ headers: { Cookie: cookie } })).status, 403);
  assert.equal((await request({ headers: { [CLIPBOARD_REQUEST_HEADER]: '1' } })).status, 403);
  assert.equal(reads, 0);

  const response = await request();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), 'desktop');
  assert.equal(reads, 1);
  host.setClipboardEnabled(false);
  assert.equal((await request()).status, 403);
});

test('multiline UTF-8 round-trips at the byte limit without replacing clipboard on failure', async (t) => {
  let text = '';
  const { host, request, write } = await setup(t, {
    readText: async () => text,
    writeText: async (value) => {
      text = value;
    },
  });
  host.setClipboardEnabled(true);
  assert.equal((await request()).status, 204);

  const sample = '\uFEFF# Notes\r\nCafé, 東京 and 🙂\n\n';
  const expected = sample + 'a'.repeat(MAX_CLIPBOARD_TEXT_BYTES - Buffer.byteLength(sample));
  assert.equal((await write(expected)).status, 204);
  assert.equal(text, expected);
  const response = await request();
  assert.match(response.headers.get('content-type'), /^text\/plain\b/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(expected));

  assert.equal((await write(`${expected}a`)).status, 413);
  assert.equal((await write(Buffer.from([0xff]))).status, 400);
  assert.equal(text, expected);
  text += 'a';
  assert.equal((await request()).status, 413);
});

test(
  'disabling sharing invalidates a read that is still in progress',
  { timeout: 5000 },
  async (t) => {
    const started = Promise.withResolvers();
    const contents = Promise.withResolvers();
    const { host, request } = await setup(t, {
      readText: () => {
        started.resolve();
        return contents.promise;
      },
      writeText: async () => assert.fail('Unexpected write'),
    });
    host.setClipboardEnabled(true);
    const response = request();
    await started.promise;
    host.setClipboardEnabled(false);
    host.setClipboardEnabled(true);
    contents.resolve('stale desktop clipboard');
    assert.equal((await response).status, 403);
  },
);
