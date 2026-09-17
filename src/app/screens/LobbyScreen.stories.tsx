import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { emptyInvites, players, received, sent, you } from '../fixtures/views';
import type { PublicPlayer } from '../lib/tools';
import { LobbyScreen } from './LobbyScreen';

const manyPlayers: PublicPlayer[] = Array.from({ length: 14 }, (_, i) => ({
  id: `m${i}`,
  name: ['bob', 'alice', 'carol', 'dave', 'erin', 'frank', 'grace'][i % 7],
  tag: String(1000 + i * 37).slice(-4),
  status: i % 3 === 0 ? 'busy' : 'idle',
}));

const meta = {
  title: 'Screens/Lobby',
  component: LobbyScreen,
  args: {
    you,
    onlineCount: 4,
    players,
    invites: { sent, received },
    onInvite: fn(),
    onAccept: fn(),
    onDecline: fn(),
    onCancel: fn(),
    canPlayModel: false,
    onPlayModel: fn(),
  },
} satisfies Meta<typeof LobbyScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithInvites: Story = {};
export const WithModelButton: Story = { args: { canPlayModel: true } };
export const Empty: Story = { args: { players: [], invites: emptyInvites, onlineCount: 1 } };
export const ManyPlayers: Story = { args: { players: manyPlayers, invites: emptyInvites, onlineCount: 15 } };
export const ConfirmModalOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Invite bob#0042' }));
    await expect(canvas.getByRole('dialog')).toBeInTheDocument();
  },
};
export const Narrow: Story = { globals: { viewport: { value: 'mobile1', isRotated: false } } };
export const NarrowDark: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false }, theme: 'dark' },
};
