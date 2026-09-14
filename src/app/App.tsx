import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { useCallback, useEffect, useState } from 'react';
import pkg from '../../package.json';
import { GameBoard } from './components/GameBoard';
import { LobbyScreen } from './components/LobbyScreen';
import { NameScreen } from './components/NameScreen';
import { useHostTheme } from './hooks/useHostTheme';
import { usePollView } from './hooks/usePollView';
import { eventText } from './lib/events';
import { callTool, isJoinResult, isPlayerView, type PlayerView, parseTextBlock, type ToolName } from './lib/tools';

const BANNER_MS = 4000;

interface Banner {
  id: number;
  text: string;
}

export function TicTacToeApp() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const [tornDown, setTornDown] = useState(false);

  const showBanner = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setBanners((current) => [...current, { id, text }]);
    window.setTimeout(() => setBanners((current) => current.filter((banner) => banner.id !== id)), BANNER_MS);
  }, []);

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
      for (const event of next.events) showBanner(eventText(event));
      // The name screen renders its error inline; everywhere else it is a banner.
      if (next.error && next.phase !== 'name') showBanner(next.error);
    },
    [showBanner],
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
      <p className="banner">
        <strong>Error:</strong> {error.message}
      </p>
    );
  }
  if (!app) return <p className="muted">Connecting…</p>;
  if (!view) return <p className="muted">Loading…</p>;

  return (
    <main>
      {banners.map((banner) => (
        <div className="banner" key={banner.id}>
          {banner.text}
        </div>
      ))}
      {view.phase === 'name' && (
        <NameScreen onlineCount={view.onlineCount} error={view.error} onSubmit={(name) => call('set_name', { name })} />
      )}
      {view.phase === 'lobby' && (
        <LobbyScreen
          view={view}
          onInvite={(targetId) => call('invite', { targetId })}
          onAccept={(inviteId) => call('accept_invite', { inviteId })}
          onDecline={(inviteId) => call('decline_invite', { inviteId })}
          onCancel={(inviteId) => call('cancel_invite', { inviteId })}
        />
      )}
      {view.phase === 'game' && view.game && (
        <GameBoard
          you={view.you}
          game={view.game}
          onMove={(cell) => call('make_move', { cell })}
          onLeave={() => call('leave', {})}
        />
      )}
    </main>
  );
}
