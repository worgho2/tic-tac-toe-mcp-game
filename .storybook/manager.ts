import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

// The server serves this build at / (src/server/http.ts), so the gallery is the public face of the MCP host.
addons.setConfig({
  theme: create({
    base: 'light',
    brandTitle: 'Tic-Tac-Toe MCP game · component gallery',
    brandUrl: 'https://github.com/worgho2/tic-tac-toe-mcp-game',
    brandTarget: '_blank',
  }),
});
