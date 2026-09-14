export function Badge({ status }: { status: 'idle' | 'busy' }) {
  return <span className={`badge badge--${status}`}>{status}</span>;
}
