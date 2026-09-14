import { type ReactNode, useState } from 'react';
import { formatSeconds, useCountdown } from '../hooks/useCountdown';
import { handle } from '../lib/events';
import { filterPlayers } from '../lib/search';
import type { InviteView, PlayerView, PublicPlayer } from '../lib/tools';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Panel } from '../ui/Panel';
import { Ribbon } from '../ui/Ribbon';

interface Props {
  you: PlayerView['you'];
  onlineCount: number;
  players: PublicPlayer[];
  invites: PlayerView['invites'];
  onInvite: (targetId: string) => void;
  onAccept: (inviteId: string) => void;
  onDecline: (inviteId: string) => void;
  onCancel: (inviteId: string) => void;
}

function Countdown({ expiresIn }: { expiresIn: number }) {
  const remaining = useCountdown(expiresIn);
  return <span className="muted countdown">{formatSeconds(remaining)}</span>;
}

function InviteCard({ invite, children }: { invite: InviteView; children: ReactNode }) {
  return (
    <li className="card">
      <span className="card__handle">{handle(invite.name, invite.tag)}</span>
      <Countdown expiresIn={invite.expiresIn} />
      <span className="card__actions">{children}</span>
    </li>
  );
}

export function LobbyScreen({ you, onlineCount, players, invites, onInvite, onAccept, onDecline, onCancel }: Props) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<PublicPlayer | null>(null);

  // Sent invites carry the target's handle, not its id; handles are unique among registered players.
  const pendingHandles = new Set(invites.sent.map((invite) => handle(invite.name, invite.tag)));
  const canInvite = (player: PublicPlayer) =>
    player.status === 'idle' && !pendingHandles.has(handle(player.name, player.tag));
  const visible = filterPlayers(players, query);
  const yourHandle = you.name && you.tag ? handle(you.name, you.tag) : '…';

  const confirmInvite = () => {
    if (target) onInvite(target.id);
    setTarget(null);
  };

  return (
    <div className="lobby">
      <Panel className="lobby__players">
        <Ribbon>Players</Ribbon>
        <p className="muted">
          You are {yourHandle} · {onlineCount} online
        </p>
        <Input
          className="lobby__search"
          value={query}
          placeholder="Search players"
          aria-label="Search players"
          onChange={(event) => setQuery(event.target.value)}
        />
        {visible.length === 0 && (
          <p className="muted">{players.length === 0 ? 'No one else is online yet' : 'No players match'}</p>
        )}
        <ul className="cards">
          {visible.map((player) => {
            const enabled = canInvite(player);
            return (
              <li className="card" key={player.id}>
                <button type="button" className="card__main" disabled={!enabled} onClick={() => setTarget(player)}>
                  <span className="card__handle">{handle(player.name, player.tag)}</span>
                  <Badge status={player.status} />
                </button>
                <Button
                  disabled={!enabled}
                  onClick={() => setTarget(player)}
                  aria-label={`Invite ${handle(player.name, player.tag)}`}
                >
                  Invite
                </Button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel className="lobby__invites">
        <Ribbon>Invites</Ribbon>
        <h3>Received</h3>
        {invites.received.length === 0 && <p className="muted">No invites</p>}
        <ul className="cards">
          {invites.received.map((invite) => (
            <InviteCard invite={invite} key={invite.inviteId}>
              <Button
                onClick={() => onAccept(invite.inviteId)}
                aria-label={`Accept invite from ${handle(invite.name, invite.tag)}`}
              >
                Accept
              </Button>
              <Button
                variant="danger"
                onClick={() => onDecline(invite.inviteId)}
                aria-label={`Decline invite from ${handle(invite.name, invite.tag)}`}
              >
                Deny
              </Button>
            </InviteCard>
          ))}
        </ul>
        <h3>Sent</h3>
        {invites.sent.length === 0 && <p className="muted">No invites</p>}
        <ul className="cards">
          {invites.sent.map((invite) => (
            <InviteCard invite={invite} key={invite.inviteId}>
              <Button
                variant="secondary"
                onClick={() => onCancel(invite.inviteId)}
                aria-label={`Cancel invite to ${handle(invite.name, invite.tag)}`}
              >
                Cancel
              </Button>
            </InviteCard>
          ))}
        </ul>
      </Panel>

      {target && (
        <Modal
          title={`Invite ${handle(target.name, target.tag)} to a match?`}
          confirmLabel="Invite"
          onConfirm={confirmInvite}
          onCancel={() => setTarget(null)}
        />
      )}
    </div>
  );
}
