/**
 * Entry point. Serves the MCP server over Streamable HTTP (default) or stdio (`--stdio`).
 */
import type { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createHttpApp } from './http.js';
import { createServer } from './server.js';

const DEFAULT_PORT = 8765;

export async function startStreamableHTTPServer(factory: () => McpServer): Promise<void> {
  const port = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
  const app = createHttpApp(factory);

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
