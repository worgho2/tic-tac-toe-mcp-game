import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from './Box';

const meta = {
  title: 'UI/Box',
  component: Box,
  args: { title: 'About', children: <p>An inset panel with a striped title bar.</p> },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360, margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Box>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Inset: Story = {};
export const Untitled: Story = { args: { title: undefined } };
export const WindowSurface: Story = { args: { surface: 'window', title: 'Warning' } };
