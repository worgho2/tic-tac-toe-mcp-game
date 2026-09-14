import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { JoinScreen } from './JoinScreen';

const meta = {
  title: 'Screens/Join',
  component: JoinScreen,
  args: { onlineCount: 3, error: null, onSubmit: fn() },
} satisfies Meta<typeof JoinScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const NobodyOnline: Story = { args: { onlineCount: 0 } };
export const OnePlayerOnline: Story = { args: { onlineCount: 1 } };
export const ManyOnline: Story = { args: { onlineCount: 128 } };
export const WithError: Story = { args: { error: 'name required' } };
