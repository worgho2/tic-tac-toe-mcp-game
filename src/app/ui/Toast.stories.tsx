import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ToastStack } from './Toast';

const meta = {
  title: 'UI/Toast',
  component: ToastStack,
  args: { onDismiss: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ToastStack>;
export default meta;
type Story = StoryObj<typeof meta>;

export const One: Story = { args: { toasts: [{ id: 1, text: 'bob#0042 declined your invite.' }] } };
export const Several: Story = {
  args: {
    toasts: [
      { id: 1, text: 'bob#0042 declined your invite.' },
      { id: 2, text: 'Your invite to alice#0099 expired.' },
      { id: 3, text: 'Your opponent left the match.' },
    ],
  },
};
