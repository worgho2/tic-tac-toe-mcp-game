import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { gameDraw, gameLost, gameOpponentTurn, gameWon, gameYourTurn, you } from '../fixtures/views';
import type { GameView } from '../lib/tools';
import { GameScreen } from './GameScreen';

function renderGame(game: GameView, onMove = vi.fn(), onLeave = vi.fn()) {
  const utils = render(<GameScreen you={you} game={game} onMove={onMove} onLeave={onLeave} />);
  return { ...utils, onMove, onLeave };
}

describe('GameScreen', () => {
  it('renders the score header, round and turn line', () => {
    renderGame({ ...gameWon, over: false, result: null, yourTurn: true });
    expect(screen.getByLabelText('Your score')).toHaveTextContent('1');
    expect(screen.getByLabelText('Opponent score')).toHaveTextContent('0');
    expect(screen.getByText(/worgho2#1234/)).toBeInTheDocument();
    expect(screen.getByText(/bob#0042/)).toBeInTheDocument();
    expect(screen.getByText('Round 1 · you are X · Your turn')).toBeInTheDocument();
  });

  it('only empty cells are playable on your turn, and a click reports the index', async () => {
    const user = userEvent.setup();
    const { onMove } = renderGame({ ...gameYourTurn, board: ['X', null, null, null, null, null, null, null, null] });
    expect(screen.getByRole('button', { name: 'Cell 1, X' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cell 5' }));
    expect(onMove).toHaveBeenCalledWith(4);
  });

  it("disables every cell on the opponent's turn and after the round ends", () => {
    const { rerender } = renderGame(gameOpponentTurn);
    expect(screen.getByText("Round 1 · you are O · Opponent's turn")).toBeInTheDocument();
    for (const cell of screen.getAllByRole('button', { name: /^Cell/ })) expect(cell).toBeDisabled();
    rerender(<GameScreen you={you} game={gameWon} onMove={vi.fn()} onLeave={vi.fn()} />);
    for (const cell of screen.getAllByRole('button', { name: /^Cell/ })) expect(cell).toBeDisabled();
    expect(screen.getByText(/Next round starts in a moment/)).toBeInTheDocument();
  });

  it('shows the win, loss and draw overlays and none during play', () => {
    const { rerender } = renderGame(gameWon);
    expect(screen.getByTestId('overlay')).toHaveAttribute('data-outcome', 'win');
    expect(screen.getByText('You win!')).toBeInTheDocument();
    rerender(<GameScreen you={you} game={gameLost} onMove={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByTestId('overlay')).toHaveAttribute('data-outcome', 'loss');
    expect(screen.getByText('🦆')).toBeInTheDocument();
    rerender(<GameScreen you={you} game={gameDraw} onMove={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByText('Draw')).toBeInTheDocument();
    rerender(<GameScreen you={you} game={gameYourTurn} onMove={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument();
  });

  it('Back to lobby asks for confirmation before leaving', async () => {
    const user = userEvent.setup();
    const { onLeave } = renderGame(gameYourTurn);
    await user.click(screen.getByRole('button', { name: 'Back to lobby' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave the match?' });
    expect(dialog).toHaveTextContent('Your opponent will return to the lobby too.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onLeave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Back to lobby' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
