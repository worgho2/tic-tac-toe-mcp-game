import type { HTMLAttributes } from 'react';

/** A 9-slice Kenney panel. Extra classes are appended so screens can add layout hooks. */
export function Panel({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`panel ${className}`.trim()} {...rest} />;
}
