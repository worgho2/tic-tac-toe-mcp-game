import { describe, expect, it } from 'vitest';
import { redundantError } from './App';
import { view } from './fixtures/views';

describe('redundantError', () => {
  it('is true for a "not in a game" error delivered alongside an opponent-left event', () => {
    expect(redundantError(view({ error: 'not in a game', events: [{ type: 'opponent-left' }] }))).toBe(true);
  });

  it('is false for a "not in a game" error with no accompanying event', () => {
    expect(redundantError(view({ error: 'not in a game' }))).toBe(false);
  });

  it('is false for a different error even alongside an opponent-left event', () => {
    expect(redundantError(view({ error: 'not your turn', events: [{ type: 'opponent-left' }] }))).toBe(false);
  });
});
