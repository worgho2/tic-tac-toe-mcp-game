import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyInvites, meta, players, received, sent, you } from '../fixtures/views';
import { LobbyScreen } from './LobbyScreen';

type Props = Parameters<typeof LobbyScreen>[0];

function renderLobby(overrides: Partial<Props> = {}) {
  const handlers = {
    onInvite: vi.fn(),
    onAccept: vi.fn(),
    onDecline: vi.fn(),
    onCancel: vi.fn(),
    onPlayModel: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <LobbyScreen
      meta={meta}
      you={you}
      players={players}
      invites={{ sent, received }}
      canPlayModel={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('LobbyScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists players with handles and status, and shows who you are', () => {
    renderLobby();
    expect(screen.getByRole('region', { name: 'Lobby' }).querySelector('.you')).toHaveTextContent(
      'You are worgho2#1234',
    );
    expect(screen.getByText('4 players online')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^bob#0042/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^alice#0007/ })).toHaveTextContent('busy');
  });

  it('search filters by handle substring, case-insensitively', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderLobby();
    const search = screen.getByLabelText('Search players');
    await user.type(search, 'BOB');
    expect(screen.getByRole('button', { name: /^bob#0042/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^alice#0007/ })).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.getByText('No players match')).toBeInTheDocument();
  });

  it('disables Invite for busy players and for players with a pending sent invite', () => {
    renderLobby();
    const [bob, aliceBusy, alicePending] = screen.getAllByRole('button', { name: /^Invite / });
    expect(bob).toBeEnabled();
    expect(aliceBusy).toBeDisabled();
    expect(alicePending).toBeDisabled(); // alice#0099 already has a sent invite
    expect(screen.getByRole('button', { name: /^alice#0099/ })).toBeDisabled();
  });

  it('clicking a card opens a confirmation; confirming invites that player and closes it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const handlers = renderLobby();
    await user.click(screen.getByRole('button', { name: /^bob#0042/ }));
    const dialog = screen.getByRole('dialog', { name: 'Invite bob#0042 to a match?' });
    await user.click(within(dialog).getByRole('button', { name: 'Invite' }));
    expect(handlers.onInvite).toHaveBeenCalledWith('p1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancelling the confirmation invites nobody', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const handlers = renderLobby();
    await user.click(screen.getAllByRole('button', { name: /^Invite / })[0]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(handlers.onInvite).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('received invites offer Accept and Deny, sent invites offer Cancel, both with a countdown', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const handlers = renderLobby();
    expect(screen.getByText('45s')).toBeInTheDocument();
    expect(screen.getByText('12s')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept invite from bob#0042' }));
    expect(handlers.onAccept).toHaveBeenCalledWith('inv-r1');
    await user.click(screen.getByRole('button', { name: 'Decline invite from bob#0042' }));
    expect(handlers.onDecline).toHaveBeenCalledWith('inv-r1');
    await user.click(screen.getByRole('button', { name: 'Cancel invite to alice#0099' }));
    expect(handlers.onCancel).toHaveBeenCalledWith('inv-s1');
  });

  it('shows the empty states', () => {
    renderLobby({ players: [], invites: emptyInvites, meta: { ...meta, onlineCount: 1 } });
    expect(screen.getByText('1 player online')).toBeInTheDocument();
    expect(screen.getByText('No one else is online yet')).toBeInTheDocument();
    expect(screen.getAllByText('No invites')).toHaveLength(2);
  });

  it('offers Play vs model only when the host supports it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderLobby();
    expect(screen.queryByRole('button', { name: 'Play vs model' })).not.toBeInTheDocument();
    cleanup();
    const handlers = renderLobby({ canPlayModel: true });
    await user.click(screen.getByRole('button', { name: 'Play vs model' }));
    expect(handlers.onPlayModel).toHaveBeenCalledTimes(1);
  });
});
