import type { PlayerView } from '../lib/tools';

interface Props {
  view: PlayerView;
  onInvite: (targetId: string) => void;
}

export function LobbyScreen({ view, onInvite }: Props) {
  return (
    <section>
      <h2>Lobby — you are {view.you.name}</h2>
      {view.players.length === 0 && <p className="muted">Waiting for other players…</p>}
      {view.players.map((player) => (
        <div className="row" key={player.id}>
          <span>
            {player.name} ({player.status})
          </span>
          {player.status === 'idle' && (
            <button type="button" onClick={() => onInvite(player.id)}>
              Invite
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
