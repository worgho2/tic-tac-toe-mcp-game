export type IconName = 'check' | 'cross';

const PATHS: Record<IconName, string> = {
  check: 'M2 8.5 6 12.5 14 3.5',
  cross: 'M3 3 13 13M13 3 3 13',
};

/**
 * 16x16 stroke icon in the current text colour. Decorative: the button that holds it carries the aria-label.
 * The pixel font has no check or cross glyphs, so these are drawn.
 */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
    </svg>
  );
}
