import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
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

async function setup(t, clipboard) {
  const mediaController = {
    getStatus: () => 'permission-required',
    getControlMode: () => 'keyboard',
  };
  const host = new HostServer(
    fileURLToPath(new URL('../../remote', import.meta.url)),
    mediaController,
    clipboard,
  );
  t.after(() => host.stop());
  const { url } = await host.start();
  const pairingUrl = new URL(url);
  pairingUrl.hostname = '127.0.0.1';
  const session = await fetch(pairingUrl, { redirect: 'manual' });
  assert.equal(session.status, 302);
  const cookie = session.headers.get('set-cookie').split(';', 1)[0];
  const endpoint = new URL(CLIPBOARD_TEXT_PATH, pairingUrl);
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
