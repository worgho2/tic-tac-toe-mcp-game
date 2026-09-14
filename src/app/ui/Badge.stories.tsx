import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = { args: { status: 'idle' } };
export const Busy: Story = { args: { status: 'busy' } };
