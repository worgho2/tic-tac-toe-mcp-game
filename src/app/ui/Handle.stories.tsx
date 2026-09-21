import type { Meta, StoryObj } from '@storybook/react-vite';
import { Handle } from './Handle';

const meta = {
  title: 'UI/Handle',
  component: Handle,
  args: { name: 'worgho2', tag: '1234' },
} satisfies Meta<typeof Handle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
