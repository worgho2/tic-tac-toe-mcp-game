import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Two projects: the server suite runs in node, the widget suite in jsdom with Testing Library.
export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'server', environment: 'node', include: ['src/server/**/*.test.ts'] },
      },
      {
        plugins: [react()],
        test: {
          name: 'app',
          environment: 'jsdom',
          include: ['src/app/**/*.test.{ts,tsx}'],
          setupFiles: ['src/app/test-setup.ts'],
          css: false,
        },
      },
    ],
  },
});
