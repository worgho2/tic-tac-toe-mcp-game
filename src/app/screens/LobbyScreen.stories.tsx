import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  emptyInvites,
  longInvites,
  longPlayers,
  longYou,
  players,
  received,
  meta as screenMeta,
  sent,
  you,
} from '../fixtures/views';
import type { PublicPlayer } from '../lib/tools';
import { LobbyScreen } from './LobbyScreen';

const manyPlayers: PublicPlayer[] = Array.from({ length: 14 }, (_, i) => ({
  id: `m${i}`,
  name: ['bob', 'alice', 'carol', 'dave', 'erin', 'frank', 'grace'][i % 7],
  tag: String(1000 + i * 37).slice(-4),
  status: i % 3 === 0 ? 'busy' : 'idle',
}));

// A fixed 360px wrapper (a phone-width chat column); the screens lay out by their own width (container queries).
const narrow = (Story: () => ReactElement) => (
  <div style={{ width: 360 }}>
    <Story />
  </div>
);

const meta = {
  title: 'Screens/Lobby',
  component: LobbyScreen,
  args: {
    meta: { ...screenMeta, onOpenLink: fn() },
    you,
    players,
    invites: { sent, received },
    onInvite: fn(),
    onAccept: fn(),
    onDecline: fn(),
    onCancel: fn(),
    canPlayModel: false,
    onPlayModel: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof LobbyScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithInvites: Story = {};
export const WithModelButton: Story = { args: { canPlayModel: true } };
export const Empty: Story = { args: { players: [], invites: emptyInvites, meta: { ...screenMeta, onlineCount: 1 } } };
export const ManyPlayers: Story = {
  args: { players: manyPlayers, invites: emptyInvites, meta: { ...screenMeta, onlineCount: 15 } },
};
export const ConfirmModalOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Invite bob#0042' }));
    await expect(canvas.getByRole('dialog')).toBeInTheDocument();
  },
};
export const Narrow: Story = { decorators: [narrow] };
export const NarrowDark: Story = { decorators: [narrow], globals: { theme: 'dark' } };
/** 24-character names (the server's maximum) everywhere a handle shows. */
export const LongNames: Story = {
  args: { you: longYou, players: longPlayers, invites: longInvites, canPlayModel: true },
};
export const LongNamesNarrow: Story = { ...LongNames, decorators: [narrow] };
