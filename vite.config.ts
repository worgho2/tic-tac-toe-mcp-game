import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isDevelopment = process.env.NODE_ENV === 'development';

// The version the widget shows. The release workflow builds the Docker image with the release tag's version as the
// APP_VERSION build arg; everywhere else (local builds, CI, Storybook) it falls back to package.json. Only this string
// reaches the bundle, not package.json itself.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };
const appVersion = process.env.APP_VERSION || pkg.version;

// Bundles mcp-app.html + src/app into a single self-contained HTML file (dist/mcp-app.html)
// that the MCP server serves as the `ui://` resource.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
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
