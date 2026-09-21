import type { HTMLAttributes } from 'react';

/**
 * Red curtain banner from Kenney "UI Pack - Adventure": two end caps over a stretched middle (see base.css).
 * Window titles and the round-end overlay. Extra classes are appended so callers can position it.
 */
export function Banner({ children, className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`banner ${className}`.trim()} {...rest}>
      <div className="banner__text">{children}</div>
    </div>
  );
}
