import type { App } from '@modelcontextprotocol/ext-apps';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameVsModelWaiting, gameYourTurn } from '../fixtures/views';
import { buildModelMessage } from '../lib/modelMessage';
import type { GameView } from '../lib/tools';
import { MODEL_STALE_MS, useModelTurn } from './useModelTurn';

function fakeApp(result: { isError?: boolean } = {}) {
  const sendMessage = vi.fn().mockResolvedValue(result);
  return { app: { sendMessage } as unknown as App, sendMessage };
}

describe('useModelTurn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts the message once per board state, not on re-renders with the same board', async () => {
    const { app, sendMessage } = fakeApp();
    const { rerender } = renderHook(({ game }) => useModelTurn(app, game), {
      initialProps: { game: gameVsModelWaiting as GameView | null },
    });
    await act(async () => {});
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      role: 'user',
      content: [{ type: 'text', text: buildModelMessage(gameVsModelWaiting) }],
    });
    rerender({ game: { ...gameVsModelWaiting } });
    await act(async () => {});
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does nothing on your turn, after the round, or against a human', async () => {
    const { app, sendMessage } = fakeApp();
    const { rerender } = renderHook(({ game }) => useModelTurn(app, game), {
      initialProps: { game: gameYourTurn as GameView | null },
    });
    rerender({ game: { ...gameVsModelWaiting, yourTurn: true } });
    rerender({ game: { ...gameVsModelWaiting, over: true } });
    rerender({ game: { ...gameYourTurn, yourTurn: false } });
    rerender({ game: null });
    await act(async () => {});
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('turns stale after MODEL_STALE_MS, resend posts again and resets it', async () => {
    const { app, sendMessage } = fakeApp();
    const { result } = renderHook(() => useModelTurn(app, gameVsModelWaiting));
    await act(async () => {});
    expect(result.current.stale).toBe(false);
    act(() => vi.advanceTimersByTime(MODEL_STALE_MS));
    expect(result.current.stale).toBe(true);
    await act(async () => {
      await result.current.resend();
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(result.current.stale).toBe(false);
    act(() => vi.advanceTimersByTime(MODEL_STALE_MS));
    expect(result.current.stale).toBe(true);
  });

  it('a new board resets stale and posts the new message', async () => {
    const { app, sendMessage } = fakeApp();
    const { result, rerender } = renderHook(({ game }) => useModelTurn(app, game), {
      initialProps: { game: gameVsModelWaiting as GameView | null },
    });
    await act(async () => {});
    act(() => vi.advanceTimersByTime(MODEL_STALE_MS));
    expect(result.current.stale).toBe(true);
    const next: GameView = { ...gameVsModelWaiting, board: ['O', null, null, null, 'X', null, null, null, 'X'] };
    rerender({ game: next });
    await act(async () => {});
    expect(result.current.stale).toBe(false);
    expect(sendMessage).toHaveBeenLastCalledWith({
      role: 'user',
      content: [{ type: 'text', text: buildModelMessage(next) }],
    });
  });

  it('a host rejection marks the turn stale at once', async () => {
    const { app } = fakeApp({ isError: true });
    const { result } = renderHook(() => useModelTurn(app, gameVsModelWaiting));
    await act(async () => {});
    expect(result.current.stale).toBe(true);
  });

  it('clears its timer on unmount', async () => {
    const { app } = fakeApp();
    const { unmount } = renderHook(() => useModelTurn(app, gameVsModelWaiting));
    await act(async () => {});
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
