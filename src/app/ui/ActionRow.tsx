import type { ReactNode } from 'react';

/** Every group of buttons: centred, secondary actions first and the primary (or danger) action last. */
export function ActionRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`actions ${className}`.trim()}>{children}</div>;
}
