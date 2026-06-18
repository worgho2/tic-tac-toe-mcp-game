import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isDevelopment = process.env.NODE_ENV === 'development';

// Bundles mcp-app.html + src/app into a single self-contained HTML file (dist/mcp-app.html)
// that the MCP server serves as the `ui://` resource.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    sourcemap: isDevelopment ? 'inline' : undefined,
    cssMinify: !isDevelopment,
    minify: !isDevelopment,
    rollupOptions: {
      input: 'mcp-app.html',
    },
    outDir: 'dist',
    // The server build (tsc) writes into dist/server; do not wipe it.
    emptyOutDir: false,
  },
});
