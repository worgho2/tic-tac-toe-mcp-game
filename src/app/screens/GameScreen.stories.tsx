import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import {
  gameDraw,
  gameLost,
  gameOpponentTurn,
  gameVsModelWaiting,
  gameWon,
  gameYourTurn,
  you,
} from '../fixtures/views';
import { GameScreen } from './GameScreen';

const meta = {
  title: 'Screens/Game',
  component: GameScreen,
  args: { you, game: gameYourTurn, onMove: fn(), onLeave: fn() },
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
export const VsModelWaiting: Story = {
  args: { game: gameVsModelWaiting, modelTurn: { stale: false, onResend: fn() } },
};
export const VsModelStale: Story = { args: { game: gameVsModelWaiting, modelTurn: { stale: true, onResend: fn() } } };
