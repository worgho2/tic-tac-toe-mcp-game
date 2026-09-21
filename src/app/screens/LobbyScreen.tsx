import { type ReactNode, useState } from 'react';
import { formatSeconds, useCountdown } from '../hooks/useCountdown';
import { handle } from '../lib/events';
import { filterPlayers } from '../lib/search';
import type { InviteView, PlayerView, PublicPlayer } from '../lib/tools';
import { Box } from '../ui/Box';
import { Button } from '../ui/Button';
import { Handle } from '../ui/Handle';
import { Icon } from '../ui/Icon';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { StatusDot } from '../ui/StatusDot';
import { ScreenFrame, type ScreenMeta } from './ScreenFrame';

interface Props {
  meta: ScreenMeta;
  you: PlayerView['you'];
  players: PublicPlayer[];
  invites: PlayerView['invites'];
  onInvite: (targetId: string) => void;
  onAccept: (inviteId: string) => void;
  onDecline: (inviteId: string) => void;
  onCancel: (inviteId: string) => void;
  /** True when the host accepts `ui/message`, which the model opponent needs. */
  canPlayModel: boolean;
  onPlayModel: () => void;
  onClose: () => void;
}

function Countdown({ expiresIn }: { expiresIn: number }) {
  const remaining = useCountdown(expiresIn);
  return <span className="muted countdown">{formatSeconds(remaining)}</span>;
}

function InviteRow({ invite, children }: { invite: InviteView; children: ReactNode }) {
  return (
    <li className="list__row">
      <span className="list__label">
        <Handle name={invite.name} tag={invite.tag} />
      </span>
      <Countdown expiresIn={invite.expiresIn} />
      <span className="list__actions">{children}</span>
    </li>
  );
}

export function LobbyScreen({
  meta,
  you,
  players,
  invites,
  onInvite,
  onAccept,
  onDecline,
  onCancel,
  canPlayModel,
  onPlayModel,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<PublicPlayer | null>(null);

  // Sent invites carry the target's handle, not its id; handles are unique among registered players.
  const pendingHandles = new Set(invites.sent.map((invite) => handle(invite.name, invite.tag)));
  const canInvite = (player: PublicPlayer) =>
    player.status === 'idle' && !pendingHandles.has(handle(player.name, player.tag));
  const visible = filterPlayers(players, query);

  const confirmInvite = () => {
    if (target) onInvite(target.id);
    setTarget(null);
  };

  return (
    <ScreenFrame
      className="lobby"
      title="Lobby"
      header={
        <p className="you">
          <StatusDot status="idle" />
          <span className="sr-only">You are </span>
          {you.name && you.tag ? <Handle name={you.name} tag={you.tag} /> : '…'}
        </p>
      }
      headerActions={canPlayModel && <Button onClick={onPlayModel}>Play vs model</Button>}
      meta={meta}
      close={{ inMatch: false, onClose }}
    >
      <div className="columns">
        <Box title="Players">
          <Input
            className="lobby__search"
            value={query}
            placeholder="Search players"
            aria-label="Search players"
            onChange={(event) => setQuery(event.target.value)}
          />
          {visible.length === 0 && (
            <p className="muted list__empty">
              {players.length === 0 ? 'No one else is online yet' : 'No players match'}
            </p>
          )}
          <ul className="list">
            {visible.map((player) => {
              const enabled = canInvite(player);
              const label = handle(player.name, player.tag);
              return (
                <li className="list__row" key={player.id}>
                  <button type="button" className="list__main" disabled={!enabled} onClick={() => setTarget(player)}>
                    {/* The dot is drawn first (CSS order) but read after the handle, so the name starts with it. */}
                    <span className="list__label">
                      <Handle name={player.name} tag={player.tag} />
                    </span>
                    <StatusDot status={player.status} />
                  </button>
                  <span className="list__actions">
                    <Button disabled={!enabled} onClick={() => setTarget(player)} aria-label={`Invite ${label}`}>
                      Invite
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Box>

        <Box title="Invites">
          <h4>Received</h4>
          {invites.received.length === 0 && <p className="muted list__empty">No invites</p>}
          <ul className="list">
            {invites.received.map((invite) => (
              <InviteRow invite={invite} key={invite.inviteId}>
                <Button
                  variant="danger"
                  className="btn--icon"
                  onClick={() => onDecline(invite.inviteId)}
                  aria-label={`Decline invite from ${handle(invite.name, invite.tag)}`}
                >
                  <Icon name="cross" />
                </Button>
                <Button
                  className="btn--icon"
                  onClick={() => onAccept(invite.inviteId)}
                  aria-label={`Accept invite from ${handle(invite.name, invite.tag)}`}
                >
                  <Icon name="check" />
                </Button>
              </InviteRow>
            ))}
          </ul>
          <h4>Sent</h4>
          {invites.sent.length === 0 && <p className="muted list__empty">No invites</p>}
          <ul className="list">
            {invites.sent.map((invite) => (
              <InviteRow invite={invite} key={invite.inviteId}>
                <Button
                  variant="danger"
                  className="btn--icon"
                  onClick={() => onCancel(invite.inviteId)}
                  aria-label={`Cancel invite to ${handle(invite.name, invite.tag)}`}
                >
                  <Icon name="cross" />
                </Button>
              </InviteRow>
            ))}
          </ul>
        </Box>
      </div>

      {target && (
        <Modal
          title={`Invite ${handle(target.name, target.tag)} to a match?`}
          confirmLabel="Invite"
          onConfirm={confirmInvite}
          onCancel={() => setTarget(null)}
        />
      )}
    </ScreenFrame>
  );
}
