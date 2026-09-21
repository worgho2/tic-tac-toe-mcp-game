import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { meta } from '../fixtures/views';
import { AUTHOR, REPO_URL } from '../lib/project';
import { JoinScreen } from './JoinScreen';

function renderJoin(props: Partial<Parameters<typeof JoinScreen>[0]> & { onlineCount?: number } = {}) {
  const { onlineCount = 3, ...rest } = props;
  const onOpenLink = vi.fn();
  const handlers = { onSubmit: vi.fn(), onClose: vi.fn() };
  render(
    <JoinScreen meta={{ ...meta, version: '1.2.3', onlineCount, onOpenLink }} error={null} {...handlers} {...rest} />,
  );
  return { ...handlers, onOpenLink };
}

describe('JoinScreen', () => {
  it('shows the title, tagline, version and online count', () => {
    renderJoin();
    expect(screen.getByRole('region', { name: 'Tic-Tac-Toe' })).toBeInTheDocument();
    expect(screen.getByText('Multiplayer MCP App game')).toBeInTheDocument();
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
    expect(screen.getByText('3 players online')).toBeInTheDocument();
  });

  it('submits the trimmed name', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderJoin();
    const button = screen.getByRole('button', { name: 'Join Game' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Your name'), '  worgho2  ');
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledWith('worgho2');
  });

  it('uses the singular for one player and shows the server error inline', () => {
    renderJoin({ onlineCount: 1, error: 'name required' });
    expect(screen.getByText('1 player online')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('name required');
  });

  it('routes the repository and author links through onOpenLink', async () => {
    const user = userEvent.setup();
    const { onOpenLink } = renderJoin();
    await user.click(screen.getByRole('link', { name: /on GitHub/ }));
    expect(onOpenLink).toHaveBeenCalledWith(REPO_URL);
    await user.click(screen.getByRole('link', { name: `@${AUTHOR.handle}` }));
    expect(onOpenLink).toHaveBeenCalledWith(AUTHOR.url);
  });

  it('closes the session from the header after confirming', async () => {
    const user = userEvent.setup();
    const { onClose } = renderJoin();
    await user.click(screen.getByRole('button', { name: 'Close session' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
