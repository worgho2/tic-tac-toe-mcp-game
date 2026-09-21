import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/app/**/*.stories.tsx'],
  addons: ['@storybook/addon-a11y', 'storybook-addon-pseudo-states'],
  // The builder loads the repo's vite.config.ts. The widget build inlines everything into one HTML file;
  // Storybook needs a normal multi-file build, so drop the single-file plugin and the fixed HTML entry.
  viteFinal: (config) => {
    const plugins = config.plugins ?? [];
    const filtered = plugins.filter(
      (plugin) => !(plugin && typeof plugin === 'object' && 'name' in plugin && plugin.name === 'vite:singlefile'),
    );
    if (filtered.length === plugins.length) {
      throw new Error('vite:singlefile plugin not found; the Storybook build would inline everything');
    }
    return {
      ...config,
      plugins: filtered,
      build: { ...config.build, rollupOptions: { ...config.build?.rollupOptions, input: undefined } },
    };
  },
};

export default config;
