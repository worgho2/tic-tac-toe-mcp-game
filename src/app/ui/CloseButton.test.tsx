import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CloseButton } from './CloseButton';

describe('CloseButton', () => {
  it('asks for confirmation and only closes on confirm', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CloseButton inMatch={false} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close session' }));
    const dialog = screen.getByRole('dialog', { name: 'Close this session?' });
    expect(dialog).toHaveTextContent(
      'This widget will stop working. Ask the assistant to open the game again to play.',
    );
    expect(dialog).not.toHaveTextContent('Your opponent will return to the lobby.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close session' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('warns about the opponent while in a match', async () => {
    const user = userEvent.setup();
    render(<CloseButton inMatch onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Close session' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Your opponent will return to the lobby.');
  });
});
