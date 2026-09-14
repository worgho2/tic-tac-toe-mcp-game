/**
 * Entry point. Serves the MCP server over Streamable HTTP (default) or stdio (`--stdio`).
 */
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import type { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import cors from 'cors';
import type { Request, Response } from 'express';
import { createServer } from './server.js';

const DEFAULT_PORT = 8765;

export async function startStreamableHTTPServer(factory: () => McpServer): Promise<void> {
  const port = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

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

  const httpServer = app.listen(port, (err?: Error) => {
    if (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
    console.log(`Tic-Tac-Toe MCP server listening on http://localhost:${port}/mcp`);
  });

  const shutdown = () => {
    console.log('\nShutting down...');
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export async function startStdioServer(factory: () => McpServer): Promise<void> {
  await factory().connect(new StdioServerTransport());
}

async function main() {
  if (process.argv.includes('--stdio')) {
    await startStdioServer(createServer);
  } else {
    await startStreamableHTTPServer(createServer);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
