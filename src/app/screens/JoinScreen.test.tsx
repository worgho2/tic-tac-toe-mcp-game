import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JoinScreen } from './JoinScreen';

describe('JoinScreen', () => {
  it('shows the online count and submits the trimmed name', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<JoinScreen onlineCount={3} error={null} onSubmit={onSubmit} />);
    expect(screen.getByText('3 players online')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Join Game' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Your name'), '  worgho2  ');
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledWith('worgho2');
  });

  it('uses the singular for one player and shows the server error inline', () => {
    render(<JoinScreen onlineCount={1} error="name required" onSubmit={vi.fn()} />);
    expect(screen.getByText('1 player online')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('name required');
  });
});
