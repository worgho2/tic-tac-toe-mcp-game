import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { useCallback, useEffect, useState } from 'react';
import pkg from '../../package.json';
import { GameBoard } from './components/GameBoard';
import { InviteBanner } from './components/InviteBanner';
import { LobbyScreen } from './components/LobbyScreen';
import { NameScreen } from './components/NameScreen';
import { useHostTheme } from './hooks/useHostTheme';
import { usePollView } from './hooks/usePollView';
import { callTool, isJoinResult, isPlayerView, type PlayerView, parseTextBlock, type ToolName } from './lib/tools';

export function TicTacToeApp() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const [tornDown, setTornDown] = useState(false);

  // Every tool reply is either the join result ({ playerId, view }) or a bare PlayerView.
  const ingest = useCallback((data: unknown) => {
    if (isJoinResult(data)) {
      setPlayerId(data.playerId);
      setView(data.view);
    } else if (isPlayerView(data)) {
      setView(data);
    }
  }, []);

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
      <p className="banner">
        <strong>Error:</strong> {error.message}
      </p>
    );
  }
  if (!app) return <p className="muted">Connecting…</p>;
  if (!view) return <p className="muted">Loading…</p>;

  return (
    <main>
      {view.notice && <div className="banner">{view.notice}</div>}
      {view.error && <div className="banner">{view.error}</div>}
      {view.invite && (
        <InviteBanner
          fromName={view.invite.fromName}
          onAccept={() => call('accept_invite', { inviteId: view.invite?.inviteId })}
          onDecline={() => call('decline_invite', { inviteId: view.invite?.inviteId })}
        />
      )}
      {view.phase === 'name' && <NameScreen onSubmit={(name) => call('set_name', { name })} />}
      {view.phase === 'lobby' && <LobbyScreen view={view} onInvite={(targetId) => call('invite', { targetId })} />}
      {view.phase === 'game' && view.game && (
        <GameBoard game={view.game} onMove={(cell) => call('make_move', { cell })} onLeave={() => call('leave', {})} />
      )}
    </main>
  );
}
