import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_MS, useToasts } from './useToasts';

describe('useToasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes a toast and auto-dismisses it after TOAST_MS', () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.push('hello'));
    expect(result.current.toasts).toEqual([{ id: 1, text: 'hello' }]);
    act(() => vi.advanceTimersByTime(TOAST_MS - 1));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toasts).toEqual([]);
  });

  it('keeps several toasts in order with increasing ids', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.push('one');
      result.current.push('two');
    });
    expect(result.current.toasts.map((t) => t.id)).toEqual([1, 2]);
  });

  it('dismiss removes a toast early and cancels its timer', () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.push('bye'));
    act(() => result.current.dismiss(1));
    expect(result.current.toasts).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears pending timers on unmount', () => {
    const { result, unmount } = renderHook(() => useToasts());
    act(() => result.current.push('x'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
