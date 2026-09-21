import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { fn, userEvent, within } from 'storybook/test';
import {
  gameDraw,
  gameLongNames,
  gameLost,
  gameOpponentTurn,
  gameVsModelWaiting,
  gameWon,
  gameYourTurn,
  longYou,
  meta as screenMeta,
  you,
} from '../fixtures/views';
import { GameScreen } from './GameScreen';

// A fixed 360px wrapper (a phone-width chat column); the screens lay out by their own width (container queries).
const narrow = (Story: () => ReactElement) => (
  <div style={{ width: 360 }}>
    <Story />
  </div>
);

const meta = {
  title: 'Screens/Game',
  component: GameScreen,
  args: {
    meta: { ...screenMeta, onOpenLink: fn() },
    you,
    game: gameYourTurn,
    onMove: fn(),
    onLeave: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof GameScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const YourTurn: Story = {};
export const OpponentsTurn: Story = { args: { game: gameOpponentTurn } };
export const Win: Story = { args: { game: gameWon } };
export const Loss: Story = { args: { game: gameLost } };
export const Draw: Story = { args: { game: gameDraw } };
export const MidRematch: Story = {
  // Round 2 just started after a 1-1 split: marks swapped, empty board, opponent (now X) to move.
  args: {
    game: { ...gameOpponentTurn, round: 2, board: gameYourTurn.board, yourScore: 1, opponentScore: 1 },
  },
};
export const Dark: Story = { args: { game: gameWon }, globals: { theme: 'dark' } };
export const Narrow: Story = { decorators: [narrow] };
/** 24-character names (the server's maximum) on both plates, with two-digit scores. */
export const LongNames: Story = { args: { you: longYou, game: gameLongNames } };
export const LongNamesNarrow: Story = { ...LongNames, decorators: [narrow] };
export const LeaveModalOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Back to lobby' }));
  },
};
export const VsModelWaiting: Story = {
  args: { game: gameVsModelWaiting, modelTurn: { stale: false, onResend: fn() } },
};
export const VsModelStale: Story = { args: { game: gameVsModelWaiting, modelTurn: { stale: true, onResend: fn() } } };
