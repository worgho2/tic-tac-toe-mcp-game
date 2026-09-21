import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpApp } from './http.js';
import { Lobby } from './lobby/lobby.js';
import { createServer } from './server.js';

const factory = () => createServer({ lobby: new Lobby(), readHtml: async () => '<html></html>' });

let server: Server | undefined;
let dir: string | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

async function start(storybookDir: string): Promise<string> {
  const app = createHttpApp(factory, { storybookDir });
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function fakeStorybook(): string {
  dir = mkdtempSync(join(tmpdir(), 'storybook-'));
  writeFileSync(join(dir, 'index.html'), '<html>storybook gallery</html>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
  return dir;
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
};

describe('HTTP app', () => {
  it('serves the built Storybook at / and its assets', async () => {
    const base = await start(fakeStorybook());
    const root = await fetch(`${base}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('storybook gallery');
    expect((await fetch(`${base}/assets/app.js`)).status).toBe(200);
  });

  it('falls back to a landing page pointing to /mcp when there is no Storybook build', async () => {
    const base = await start(join(tmpdir(), 'no-such-storybook'));
    const root = await fetch(`${base}/`);
    expect(root.status).toBe(200);
    expect(root.headers.get('content-type')).toContain('text/html');
    expect(await root.text()).toContain('/mcp');
  });

  it('keeps /healthz and /mcp working next to the gallery', async () => {
    const base = await start(fakeStorybook());
    expect(await (await fetch(`${base}/healthz`)).text()).toBe('ok');
    const mcp = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(initialize),
    });
    expect(mcp.status).toBe(200);
    expect(await mcp.text()).toContain('"serverInfo"');
  });
});
