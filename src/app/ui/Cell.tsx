import type { Mark } from '../lib/tools';

interface Props {
  index: number;
  mark: Mark | null;
  disabled: boolean;
  onClick: () => void;
}

export function Cell({ index, mark, disabled, onClick }: Props) {
  const markClass = mark ? ` cell--${mark.toLowerCase()}` : '';
  return (
    <button
      type="button"
      className={`cell${markClass}`}
      aria-label={`Cell ${index + 1}${mark ? `, ${mark}` : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {mark ?? ''}
    </button>
  );
}
