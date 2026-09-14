import type { ReactNode } from 'react';

/** Red title ribbon: left cap, repeating middle and right cap come from three Kenney tiles (see base.css). */
export function Ribbon({ children }: { children: ReactNode }) {
  return (
    <div className="ribbon">
      <span className="ribbon__text">{children}</span>
    </div>
  );
}
