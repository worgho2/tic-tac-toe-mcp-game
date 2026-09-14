import type { App } from '@modelcontextprotocol/ext-apps';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePollView } from './usePollView';

describe('usePollView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls get_state immediately, then every interval', async () => {
    const view = { phase: 'lobby' };
    const callServerTool = vi.fn().mockResolvedValue({ structuredContent: view });
    const app = { callServerTool } as unknown as App;
    const onView = vi.fn();
    renderHook(() => usePollView(app, 'me', onView, 1000));

    expect(callServerTool).toHaveBeenCalledTimes(1);
    expect(callServerTool).toHaveBeenCalledWith({ name: 'get_state', arguments: { playerId: 'me' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(callServerTool).toHaveBeenCalledTimes(2);
    expect(onView).toHaveBeenLastCalledWith(view);
  });

  it('does nothing without a player id and stops on unmount', async () => {
    const callServerTool = vi.fn().mockResolvedValue({ structuredContent: {} });
    const app = { callServerTool } as unknown as App;
    const { unmount } = renderHook(() => usePollView(app, null, vi.fn(), 1000));
    expect(callServerTool).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
