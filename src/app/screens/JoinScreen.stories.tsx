import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { fn } from 'storybook/test';
import { meta as screenMeta } from '../fixtures/views';
import { JoinScreen } from './JoinScreen';

// A fixed 360px wrapper (a phone-width chat column); the screens lay out by their own width (container queries).
const narrow = (Story: () => ReactElement) => (
  <div style={{ width: 360 }}>
    <Story />
  </div>
);

const meta = {
  title: 'Screens/Join',
  component: JoinScreen,
  args: { meta: { ...screenMeta, onOpenLink: fn() }, error: null, onSubmit: fn(), onClose: fn() },
} satisfies Meta<typeof JoinScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const NobodyOnline: Story = { args: { meta: { ...screenMeta, onlineCount: 0 } } };
export const OnePlayerOnline: Story = { args: { meta: { ...screenMeta, onlineCount: 1 } } };
export const WithError: Story = { args: { error: 'name required' } };
export const Dark: Story = { globals: { theme: 'dark' } };
export const Narrow: Story = { decorators: [narrow] };
