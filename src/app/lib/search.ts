import { handle } from './events';
import type { PublicPlayer } from './tools';

/** Case-insensitive substring match on the full handle (`name#tag`). A blank query keeps everyone. */
export function filterPlayers(players: PublicPlayer[], query: string): PublicPlayer[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return players;
  return players.filter((player) => handle(player.name, player.tag).toLowerCase().includes(needle));
}
