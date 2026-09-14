import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/app/**/*.stories.tsx'],
  addons: ['@storybook/addon-a11y'],
  // The builder loads the repo's vite.config.ts. The widget build inlines everything into one HTML file;
  // Storybook needs a normal multi-file build, so drop the single-file plugin and the fixed HTML entry.
  viteFinal: (config) => ({
    ...config,
    plugins: (config.plugins ?? []).filter(
      (plugin) => !(plugin && typeof plugin === 'object' && 'name' in plugin && plugin.name === 'vite:singlefile'),
    ),
    build: { ...config.build, rollupOptions: { ...config.build?.rollupOptions, input: undefined } },
  }),
};

export default config;
