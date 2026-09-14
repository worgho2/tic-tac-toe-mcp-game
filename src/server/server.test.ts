import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { Lobby } from './lobby/lobby.js';
import { createServer, RESOURCE_URI } from './server.js';

const APP_ONLY_TOOLS = [
  'set_name',
  'get_state',
  'invite',
  'accept_invite',
  'decline_invite',
  'cancel_invite',
  'make_move',
  'leave',
];
const FIXTURE_HTML = '<!DOCTYPE html><html><body>fixture</body></html>';

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer({ lobby: new Lobby(), readHtml: async () => FIXTURE_HTML });
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

describe('MCP server contract', () => {
  let client: Client;

  beforeEach(async () => {
    client = await connect();
  });

  it('exposes join_game to the model, linked to the widget resource', async () => {
    const { tools } = await client.listTools();
    const join = tools.find((t) => t.name === 'join_game');
    expect(join).toBeDefined();
    expect(join?._meta?.ui).toMatchObject({ resourceUri: RESOURCE_URI });
    expect(join?._meta?.ui).not.toHaveProperty('visibility');
  });

  it('marks every other tool as app-only', async () => {
    const { tools } = await client.listTools();
    for (const name of APP_ONLY_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?._meta?.ui, name).toMatchObject({ visibility: ['app'] });
    }
    expect(tools).toHaveLength(APP_ONLY_TOOLS.length + 1);
  });

  it('serves the widget as an MCP App HTML resource', async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain(RESOURCE_URI);

    const { contents } = await client.readResource({ uri: RESOURCE_URI });
    expect(contents).toHaveLength(1);
    expect(contents[0]).toMatchObject({ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: FIXTURE_HTML });
    expect(RESOURCE_MIME_TYPE).toBe('text/html;profile=mcp-app');
  });

  it('join_game returns a player id and a view in structuredContent', async () => {
    const result = await client.callTool({ name: 'join_game', arguments: {} });
    const structured = result.structuredContent as {
      playerId: string;
      view: {
        phase: string;
        onlineCount: number;
        invites: { sent: unknown[]; received: unknown[] };
        events: unknown[];
      };
    };
    expect(structured.playerId).toEqual(expect.any(String));
    expect(structured.view.phase).toBe('name');
    expect(structured.view.onlineCount).toBe(0);
    expect(structured.view.invites).toEqual({ sent: [], received: [] });
    expect(structured.view.events).toEqual([]);
  });

  it('validates app-only tool input', async () => {
    const result = await client.callTool({ name: 'make_move', arguments: { playerId: 'p1', cell: 42 } });
    expect(result.isError).toBe(true);
  });

  it('rejects player ids that do not look like generated ids', async () => {
    const result = await client.callTool({ name: 'get_state', arguments: { playerId: 'x'.repeat(33) } });
    expect(result.isError).toBe(true);
    const upper = await client.callTool({ name: 'get_state', arguments: { playerId: 'ABC-123' } });
    expect(upper.isError).toBe(true);
  });
});
