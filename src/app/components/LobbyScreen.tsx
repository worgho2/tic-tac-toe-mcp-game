import { handle } from '../lib/events';
import type { PlayerView } from '../lib/tools';

interface Props {
  view: PlayerView;
  onInvite: (targetId: string) => void;
  onAccept: (inviteId: string) => void;
  onDecline: (inviteId: string) => void;
  onCancel: (inviteId: string) => void;
}

function seconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

export function LobbyScreen({ view, onInvite, onAccept, onDecline, onCancel }: Props) {
  const you = view.you.name && view.you.tag ? handle(view.you.name, view.you.tag) : '…';
  return (
    <section>
      <h2>Lobby — you are {you}</h2>

      <h3>Players ({view.onlineCount} online)</h3>
      {view.players.length === 0 && <p className="muted">Waiting for other players…</p>}
      {view.players.map((player) => (
        <div className="row" key={player.id}>
          <span>
            {handle(player.name, player.tag)} ({player.status})
          </span>
          <button type="button" disabled={player.status !== 'idle'} onClick={() => onInvite(player.id)}>
            Invite
          </button>
        </div>
      ))}

      <h3>Received invites</h3>
      {view.invites.received.length === 0 && <p className="muted">No invites</p>}
      {view.invites.received.map((invite) => (
        <div className="row" key={invite.inviteId}>
          <span>
            {handle(invite.name, invite.tag)} · {seconds(invite.expiresIn)}
          </span>
          <button type="button" onClick={() => onAccept(invite.inviteId)}>
            Accept
          </button>
          <button type="button" className="secondary" onClick={() => onDecline(invite.inviteId)}>
            Deny
          </button>
        </div>
      ))}

      <h3>Sent invites</h3>
      {view.invites.sent.length === 0 && <p className="muted">No invites</p>}
      {view.invites.sent.map((invite) => (
        <div className="row" key={invite.inviteId}>
          <span>
            {handle(invite.name, invite.tag)} · {seconds(invite.expiresIn)}
          </span>
          <button type="button" className="secondary" onClick={() => onCancel(invite.inviteId)}>
            Cancel
          </button>
        </div>
      ))}
    </section>
  );
}
