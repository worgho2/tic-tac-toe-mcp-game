import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastItem } from '../ui/Toast';

export const TOAST_MS = 4000;

/** Transient messages with auto-dismiss. Owns its timers and clears them all on unmount. */
export function useToasts(ttlMs = TOAST_MS) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (text: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, text }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), ttlMs),
      );
    },
    [dismiss, ttlMs],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}
