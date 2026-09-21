import { type HTMLAttributes, type ReactNode, type Ref, useId } from 'react';
import { ActionRow } from './ActionRow';
import { Banner } from './Banner';
import { Box } from './Box';

interface Props extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Text on the banner that overlaps the top edge; also names the region. */
  title?: ReactNode;
  /** Left side of the header band: context text or controls. */
  header?: ReactNode;
  /** Right side of the header band: actions, ending with the close button. */
  headerAction?: ReactNode;
  /** Buttons for the whole window, in an ActionRow under the content. */
  actions?: ReactNode;
  /** Band at the bottom of the container. */
  footer?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/**
 * Screen background: a `window` Box with a banner title, a header band, the content, an action row and a footer
 * band. Slots that are not passed render nothing. Extra classes are appended for layout hooks.
 */
export function Window({ title, header, headerAction, actions, footer, children, className = '', ...rest }: Props) {
  const titleId = useId();
  return (
    <Box
      surface="window"
      className={['window', title ? 'window--titled' : '', className].filter(Boolean).join(' ')}
      aria-labelledby={title ? titleId : undefined}
      {...rest}
    >
      {title && (
        <Banner className="window__banner">
          <h2 className="window__title" id={titleId}>
            {title}
          </h2>
        </Banner>
      )}
      {(header || headerAction) && (
        <header className="window__header">
          <div className="window__header-main">{header}</div>
          {headerAction && <div className="window__header-actions">{headerAction}</div>}
        </header>
      )}
      <div className="window__content">{children}</div>
      {actions && <ActionRow>{actions}</ActionRow>}
      {footer && <footer className="window__footer">{footer}</footer>}
    </Box>
  );
}
