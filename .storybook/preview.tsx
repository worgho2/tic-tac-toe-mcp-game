import type { Decorator, Preview } from '@storybook/react-vite';
import { useEffect } from 'react';
import '../src/app/styles/tokens.css';
import '../src/app/styles/base.css';
import '../src/app/styles/animations.css';

// Mirrors what hooks/useHostTheme.ts does with the host theme: tokens.css switches on <html data-theme>.
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme as string;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return <Story />;
};

// The widget's #root caps it at 720px (base.css); Storybook renders into its own root, so apply the same cap.
const withWidgetWidth: Decorator = (Story) => (
  <div style={{ maxWidth: 720, margin: '0 auto' }}>
    <Story />
  </div>
);

const preview: Preview = {
  decorators: [withTheme, withWidgetWidth],
  globalTypes: {
    theme: {
      description: 'Host theme',
      toolbar: { title: 'Theme', icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: { layout: 'padded' },
};

export default preview;
