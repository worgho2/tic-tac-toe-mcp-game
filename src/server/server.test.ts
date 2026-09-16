import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { Lobby } from './lobby/lobby.js';
import { createServer, RESOURCE_URI } from './server.js';

const MODEL_TOOLS = ['join_game', 'model_move'];
const APP_ONLY_TOOLS = [
  'set_name',
  'get_state',
  'invite',
  'accept_invite',
  'decline_invite',
  'cancel_invite',
  'make_move',
  'leave',
  'close_session',
  'play_vs_model',
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

  it('exposes model_move to the model without opening a widget', async () => {
    const { tools } = await client.listTools();
    const move = tools.find((t) => t.name === 'model_move');
    expect(move).toBeDefined();
    expect(move?._meta?.ui).toBeUndefined();
    expect(move?.description).toMatch(/only call this when the game widget asks/i);
  });

  it('marks every other tool as app-only', async () => {
    const { tools } = await client.listTools();
    for (const name of APP_ONLY_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?._meta?.ui, name).toMatchObject({ visibility: ['app'] });
    }
    for (const name of MODEL_TOOLS) {
      expect(tools.find((t) => t.name === name)?._meta?.ui ?? {}, name).not.toHaveProperty('visibility');
    }
    expect(tools).toHaveLength(APP_ONLY_TOOLS.length + MODEL_TOOLS.length);
  });

  it('plays a round against the model end to end', async () => {
    const joined = (await client.callTool({ name: 'join_game', arguments: {} })).structuredContent as {
      playerId: string;
    };
    const playerId = joined.playerId;
    await client.callTool({ name: 'set_name', arguments: { playerId, name: 'Alice' } });
    const started = (await client.callTool({ name: 'play_vs_model', arguments: { playerId } })).structuredContent as {
      phase: string;
      game: { modelPlayerId: string; opponentName: string; opponentTag: string };
    };
    expect(started.phase).toBe('game');
    expect(started.game).toMatchObject({ opponentName: 'Model', opponentTag: 'AI' });
    await client.callTool({ name: 'make_move', arguments: { playerId, cell: 4 } });
    const moved = (
      await client.callTool({ name: 'model_move', arguments: { playerId: started.game.modelPlayerId, cell: 0 } })
    ).structuredContent as { error: string | null; game: { board: (string | null)[] } };
    expect(moved.error).toBeNull();
    const state = (await client.callTool({ name: 'get_state', arguments: { playerId } })).structuredContent as {
      game: { board: (string | null)[]; yourTurn: boolean };
    };
    expect(state.game.board[0]).toBe('O');
    expect(state.game.yourTurn).toBe(true);
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
