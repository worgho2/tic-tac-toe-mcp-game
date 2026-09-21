import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusDot } from './StatusDot';

const meta = {
  title: 'UI/StatusDot',
  component: StatusDot,
  args: { status: 'idle' },
} satisfies Meta<typeof StatusDot>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Both: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <StatusDot status="idle" /> available
      <StatusDot status="busy" /> in a match
    </div>
  ),
};
