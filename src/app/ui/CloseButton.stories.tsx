import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CloseButton } from './CloseButton';

const meta = {
  title: 'UI/CloseButton',
  component: CloseButton,
  args: { inMatch: false, onClose: fn() },
} satisfies Meta<typeof CloseButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const ConfirmOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Close session' }));
    await expect(canvas.getByRole('dialog')).toBeInTheDocument();
  },
};
export const ConfirmOpenInMatch: Story = { ...ConfirmOpen, args: { inMatch: true } };
