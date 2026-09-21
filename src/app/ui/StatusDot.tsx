const LABEL = { idle: 'available', busy: 'in a match' } as const;

/** Green dot for an idle (available) player, yellow for a busy one. The status word is kept for screen readers. */
export function StatusDot({ status }: { status: 'idle' | 'busy' }) {
  return (
    <span className="status" title={LABEL[status]}>
      <span className={`dot dot--${status}`} aria-hidden="true" />
      <span className="sr-only">{status}</span>
    </span>
  );
}
