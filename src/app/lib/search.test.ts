import { describe, expect, it } from 'vitest';
import { players } from '../fixtures/views';
import { filterPlayers } from './search';

describe('filterPlayers', () => {
  it('keeps everyone for an empty or blank query', () => {
    expect(filterPlayers(players, '')).toEqual(players);
    expect(filterPlayers(players, '   ')).toEqual(players);
  });

  it('matches a substring of the full handle, case-insensitively', () => {
    expect(filterPlayers(players, 'ALICE').map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(filterPlayers(players, 'alice#0099').map((p) => p.id)).toEqual(['p3']);
    expect(filterPlayers(players, '#00').map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterPlayers(players, 'zed')).toEqual([]);
  });
});
