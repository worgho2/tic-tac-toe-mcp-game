import { type HTMLAttributes, type ReactNode, type Ref, useId } from 'react';

export type BoxSurface = 'window' | 'inset';

interface Props extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Text on the striped title bar across the top; also names the region. */
  title?: ReactNode;
  /** `window`: framed panel with corner brackets (screen background). `inset`: plain panel inside a window. */
  surface?: BoxSurface;
  ref?: Ref<HTMLElement>;
}

/** A Kenney "UI Pack - Adventure" panel with an optional title bar. Extra classes are appended for layout hooks. */
export function Box({ title, surface = 'inset', children, className = '', ref, ...rest }: Props) {
  const titleId = useId();
  const classes = ['box', `box--${surface}`, className];
  return (
    <section
      ref={ref}
      className={classes.filter(Boolean).join(' ')}
      aria-labelledby={title ? titleId : undefined}
      {...rest}
    >
      {title && (
        <div className="box__bar">
          <h3 className="box__title" id={titleId}>
            {title}
          </h3>
        </div>
      )}
      {children}
    </section>
  );
}
