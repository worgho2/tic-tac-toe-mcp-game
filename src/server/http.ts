/**
 * The HTTP surface: `/mcp` (Streamable HTTP, a fresh server per request), `/healthz`, and `/`, which serves the
 * built Storybook (the widget's component gallery) when it is present and a small landing page otherwise.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import type { McpServer } from '@modelcontextprotocol/server';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';

/** `storybook-static/` at the repo root: `pnpm build-storybook` output, copied next to `dist/` in the image. */
export const DEFAULT_STORYBOOK_DIR = fileURLToPath(new URL('../../storybook-static/', import.meta.url));

export interface HttpAppOptions {
  /** Directory with a built Storybook; `/` falls back to the landing page when it has no index.html. */
  storybookDir?: string;
}

const LANDING = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tic-Tac-Toe MCP server</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5">
<h1>Tic-Tac-Toe MCP server</h1>
<p>This is an MCP server. Add <code>/mcp</code> on this host as a connector in an MCP Apps client (Claude, ChatGPT, VS Code) and ask it to play tic-tac-toe.</p>
<p><a href="https://github.com/worgho2/tic-tac-toe-mcp-game">Source and instructions on GitHub</a></p>
</body>
</html>
`;

export function createHttpApp(factory: () => McpServer, options: HttpAppOptions = {}): Express {
  const storybookDir = options.storybookDir ?? DEFAULT_STORYBOOK_DIR;

  // Binding to 0.0.0.0 disables the localhost DNS-rebinding guard, which is what we want behind a reverse proxy.
  const app = createMcpExpressApp({ host: '0.0.0.0' });
  app.use(cors());

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).send('ok');
  });

  app.all('/mcp', async (req: Request, res: Response) => {
    const server = factory();
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP error:', error);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });

  // Registered after /mcp and /healthz, so the gallery can never shadow them.
  if (existsSync(join(storybookDir, 'index.html'))) {
    app.use(express.static(storybookDir));
  } else {
    app.get('/', (_req: Request, res: Response) => {
      res.type('html').send(LANDING);
    });
  }

  return app;
}
