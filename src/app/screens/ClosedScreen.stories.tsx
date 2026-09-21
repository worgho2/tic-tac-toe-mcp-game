import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { meta as screenMeta } from '../fixtures/views';
import { ClosedScreen } from './ClosedScreen';

const meta = {
  title: 'Screens/Closed',
  component: ClosedScreen,
  args: { meta: { ...screenMeta, onOpenLink: fn() } },
} satisfies Meta<typeof ClosedScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
