import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { McpServer, type ReadResourceResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { Lobby } from './lobby/lobby.js';
import {
  handleAcceptInvite,
  handleDeclineInvite,
  handleGetState,
  handleInvite,
  handleJoin,
  handleLeave,
  handleMove,
  handleSetName,
} from './tools/handlers.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { name: string; version: string };

/** Resource URI the host fetches and renders in a sandboxed iframe when `join_game` is called. */
export const RESOURCE_URI = 'ui://tic-tac-toe/mcp-app.html';

// Works both from source (src/server/server.ts via tsx) and compiled (dist/server/server.js).
const DIST_DIR = import.meta.filename.endsWith('.ts')
  ? path.resolve(import.meta.dirname, '../../dist')
  : path.resolve(import.meta.dirname, '..');
const APP_HTML_PATH = path.join(DIST_DIR, 'mcp-app.html');

/**
 * The single shared lobby for the whole process. A fresh `McpServer` is created per HTTP request
 * (stateless Streamable HTTP), so all game state has to live outside of it. Single replica by design.
 */
const sharedLobby = new Lobby();

export interface CreateServerOptions {
  /** Lobby to serve; defaults to the process-wide shared lobby. Injectable for tests. */
  lobby?: Lobby;
  /** Reads the bundled widget HTML; defaults to reading `dist/mcp-app.html`. Injectable for tests. */
  readHtml?: () => Promise<string>;
}

const playerIdSchema = z.string().min(1);

/**
 * Creates an MCP server exposing one model-facing tool (`join_game`, which opens the widget) and a set
 * of app-only tools the widget uses to drive the lobby and the game.
 */
export function createServer(options: CreateServerOptions = {}): McpServer {
  const lobby = options.lobby ?? sharedLobby;
  const readHtml = options.readHtml ?? (() => fs.readFile(APP_HTML_PATH, 'utf-8'));

  const server = new McpServer({ name: pkg.name, version: pkg.version });

  // Model-facing entry point. `_meta.ui.resourceUri` tells the host which resource to render.
  registerAppTool(
    server,
    'join_game',
    {
      title: 'Join Tic-Tac-Toe',
      description: 'Open the tic-tac-toe lobby to find an opponent and play a game inside the chat.',
      inputSchema: z.object({}),
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async () => handleJoin(lobby),
  );

  // App-only tools: callable by the widget, hidden from the model.
  const appOnly = { ui: { resourceUri: RESOURCE_URI, visibility: ['app' as const] } };

  registerAppTool(
    server,
    'set_name',
    {
      title: 'Set Name',
      description: 'Register a display name for the current player.',
      inputSchema: z.object({ playerId: playerIdSchema, name: z.string().min(1).max(24) }),
      _meta: appOnly,
    },
    async (args) => handleSetName(lobby, args),
  );

  registerAppTool(
    server,
    'get_state',
    {
      title: 'Get State',
      description: 'Return the current view for the player (used for polling).',
      inputSchema: z.object({ playerId: playerIdSchema }),
      _meta: appOnly,
    },
    async (args) => handleGetState(lobby, args),
  );

  registerAppTool(
    server,
    'invite',
    {
      title: 'Invite',
      description: 'Invite another player in the lobby to a game.',
      inputSchema: z.object({ playerId: playerIdSchema, targetId: playerIdSchema }),
      _meta: appOnly,
    },
    async (args) => handleInvite(lobby, args),
  );

  registerAppTool(
    server,
    'accept_invite',
    {
      title: 'Accept Invite',
      description: 'Accept a pending invite and start the game.',
      inputSchema: z.object({ playerId: playerIdSchema, inviteId: z.string().min(1) }),
      _meta: appOnly,
    },
    async (args) => handleAcceptInvite(lobby, args),
  );

  registerAppTool(
    server,
    'decline_invite',
    {
      title: 'Decline Invite',
      description: 'Decline a pending invite.',
      inputSchema: z.object({ playerId: playerIdSchema, inviteId: z.string().min(1) }),
      _meta: appOnly,
    },
    async (args) => handleDeclineInvite(lobby, args),
  );

  registerAppTool(
    server,
    'make_move',
    {
      title: 'Make Move',
      description: 'Place your mark on a board cell (0-8, left to right, top to bottom).',
      inputSchema: z.object({ playerId: playerIdSchema, cell: z.number().int().min(0).max(8) }),
      _meta: appOnly,
    },
    async (args) => handleMove(lobby, args),
  );

  registerAppTool(
    server,
    'leave',
    {
      title: 'Leave',
      description: 'Leave the current game and return to the lobby.',
      inputSchema: z.object({ playerId: playerIdSchema }),
      _meta: appOnly,
    },
    async (args) => handleLeave(lobby, args),
  );

  // The widget itself: a single self-contained HTML file bundled by Vite.
  registerAppResource(
    server,
    'Tic-Tac-Toe Game',
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE, description: 'Interactive tic-tac-toe lobby and board.' },
    async (): Promise<ReadResourceResult> => ({
      contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: await readHtml() }],
    }),
  );

  return server;
}
