import type { LobbyEvent } from './tools';

export function handle(name: string, tag: string): string {
  return `${name}#${tag}`;
}

/** Human copy for each server event; rendered as a transient banner. */
export function eventText(event: LobbyEvent): string {
  switch (event.type) {
    case 'opponent-left':
      return 'Your opponent left the match.';
    case 'invite-declined':
      return `${handle(event.name, event.tag)} declined your invite.`;
    case 'invite-expired':
      return `Your invite to ${handle(event.name, event.tag)} expired.`;
    case 'invite-cancelled':
      return event.reason === 'in-match'
        ? `${handle(event.name, event.tag)} is in another match.`
        : `${handle(event.name, event.tag)} cancelled the invite.`;
  }
}
