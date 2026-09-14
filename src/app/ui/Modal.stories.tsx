import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Modal } from './Modal';

const meta = {
  title: 'UI/Modal',
  component: Modal,
  args: { onConfirm: fn(), onCancel: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Modal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InviteConfirm: Story = {
  args: { title: 'Invite bob#0042 to a match?', confirmLabel: 'Invite' },
};
export const LeaveConfirm: Story = {
  args: {
    title: 'Leave the match?',
    confirmLabel: 'Leave',
    danger: true,
    children: <p>Your opponent will return to the lobby too.</p>,
  },
};
