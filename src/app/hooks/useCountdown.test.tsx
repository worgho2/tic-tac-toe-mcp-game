import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatSeconds, useCountdown } from './useCountdown';

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down once a second and clamps at zero', () => {
    const { result } = renderHook(() => useCountdown(2500));
    expect(result.current).toBe(2500);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(1500);
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(0);
  });

  it('resyncs when a new value arrives from a poll', () => {
    const { result, rerender } = renderHook(({ ms }) => useCountdown(ms), { initialProps: { ms: 5000 } });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(4000);
    rerender({ ms: 9000 });
    expect(result.current).toBe(9000);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(8000);
  });

  it('stops ticking on unmount', () => {
    const { unmount } = renderHook(() => useCountdown(5000));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('formatSeconds', () => {
  it('rounds up to whole seconds and never goes negative', () => {
    expect(formatSeconds(45_000)).toBe('45s');
    expect(formatSeconds(4400)).toBe('5s');
    expect(formatSeconds(0)).toBe('0s');
    expect(formatSeconds(-5)).toBe('0s');
  });
});
