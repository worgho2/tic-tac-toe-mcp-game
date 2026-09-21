import type { ReactNode } from 'react';
import { AUTHOR } from '../lib/project';
import { CloseButton } from '../ui/CloseButton';
import { Link } from '../ui/Link';
import { Window } from '../ui/Window';

/** What every screen shows in its footer, plus how to open an external link through the host. */
export interface ScreenMeta {
  /** App version from the build (package.json). */
  version: string;
  onlineCount: number;
  onOpenLink: (url: string) => void;
}

interface Props {
  className?: string;
  title: string;
  /** Left side of the header band: context text, the player's handle, or controls. */
  header: ReactNode;
  /** Extra controls at the right of the header band, before the close button. */
  headerActions?: ReactNode;
  meta: ScreenMeta;
  /** Renders the close button at the right of the header; omitted on the closed screen. */
  close?: { inMatch: boolean; onClose: () => void };
  /** Buttons for the whole screen, in the action row above the footer. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * The frame every screen shares: a Window with the screen's title on the banner, a header with context (left) and
 * actions ending with the close button (right), the content, an optional action row, and a footer with version, players online and author.
 */
export function ScreenFrame({ className, title, header, headerActions, meta, close, actions, children }: Props) {
  return (
    <Window
      className={`screen ${className ?? ''}`.trim()}
      title={title}
      header={header}
      headerAction={
        (headerActions || close) && (
          <>
            {headerActions}
            {close && <CloseButton inMatch={close.inMatch} onClose={close.onClose} />}
          </>
        )
      }
      actions={actions}
      footer={
        <>
          <span>v{meta.version}</span>
          <span>
            {meta.onlineCount} player{meta.onlineCount === 1 ? '' : 's'} online
          </span>
          <span>
            by{' '}
            <Link href={AUTHOR.url} onOpen={meta.onOpenLink}>
              @{AUTHOR.handle}
            </Link>
          </span>
        </>
      }
    >
      {children}
    </Window>
  );
}
