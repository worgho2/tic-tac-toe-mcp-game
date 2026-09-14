import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { useCallback, useEffect, useState } from 'react';
import pkg from '../../package.json';
import { useHostTheme } from './hooks/useHostTheme';
import { usePollView } from './hooks/usePollView';
import { useToasts } from './hooks/useToasts';
import { eventText } from './lib/events';
import { callTool, isJoinResult, isPlayerView, type PlayerView, parseTextBlock, type ToolName } from './lib/tools';
import { GameScreen } from './screens/GameScreen';
import { JoinScreen } from './screens/JoinScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { ToastStack } from './ui/Toast';

/** An error that only restates an event delivered in the same reply (the opponent left, so the move failed). */
function redundantError(view: PlayerView): boolean {
  return view.error === 'not in a game' && view.events.some((event) => event.type === 'opponent-left');
}

export function TicTacToeApp() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const [tornDown, setTornDown] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  // Every tool reply is either the join result ({ playerId, view }) or a bare PlayerView.
  const ingest = useCallback(
    (data: unknown) => {
      let next: PlayerView | null = null;
      if (isJoinResult(data)) {
        setPlayerId(data.playerId);
        next = data.view;
      } else if (isPlayerView(data)) {
        next = data;
      }
      if (!next) return;
      setView(next);
      for (const event of next.events) push(eventText(event));
      // The join screen renders its error inline; everywhere else it is a toast.
      if (next.error && next.phase !== 'name' && !redundantError(next)) push(next.error);
    },
    [push],
  );

  const { app, error } = useApp({
    appInfo: { name: 'Tic-Tac-Toe', version: pkg.version },
    capabilities: {},
    onAppCreated: (created) => {
      created.ontoolresult = (result) => ingest(result.structuredContent ?? parseTextBlock(result.content));
      created.onhostcontextchanged = (context) => {
        if (context.theme) setTheme(context.theme);
      };
      created.onteardown = async () => {
        setTornDown(true);
        return {};
      };
      created.onerror = console.error;
    },
  });

  useEffect(() => {
    if (app) setTheme(app.getHostContext()?.theme);
  }, [app]);
  useHostTheme(app, theme);
  usePollView(app, tornDown ? null : playerId, ingest);

  const call = useCallback(
    async (name: ToolName, args: Record<string, unknown>) => {
      if (!app || !playerId) return;
      try {
        ingest(await callTool(app, name, { playerId, ...args }));
      } catch (err) {
        console.error(err);
      }
    },
    [app, playerId, ingest],
  );

  if (error) {
    return (
      <p className="error">
        <strong>Error:</strong> {error.message}
      </p>
    );
  }
  if (!app) return <p className="muted">Connecting…</p>;
  if (!view) return <p className="muted">Loading…</p>;

  return (
    <main>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      {view.phase === 'name' && (
        <JoinScreen onlineCount={view.onlineCount} error={view.error} onSubmit={(name) => call('set_name', { name })} />
      )}
      {view.phase === 'lobby' && (
        <LobbyScreen
          you={view.you}
          onlineCount={view.onlineCount}
          players={view.players}
          invites={view.invites}
          onInvite={(targetId) => call('invite', { targetId })}
          onAccept={(inviteId) => call('accept_invite', { inviteId })}
          onDecline={(inviteId) => call('decline_invite', { inviteId })}
          onCancel={(inviteId) => call('cancel_invite', { inviteId })}
        />
      )}
      {view.phase === 'game' && view.game && (
        <GameScreen
          you={view.you}
          game={view.game}
          onMove={(cell) => call('make_move', { cell })}
          onLeave={() => call('leave', {})}
        />
      )}
    </main>
  );
}
