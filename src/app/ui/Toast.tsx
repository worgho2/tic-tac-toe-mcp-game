export interface ToastItem {
  id: number;
  text: string;
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

/** Top-right stack of transient messages; each one is a button so a click dismisses it early. */
export function ToastStack({ toasts, onDismiss }: Props) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <button type="button" className="toast" key={toast.id} onClick={() => onDismiss(toast.id)}>
          {toast.text}
        </button>
      ))}
    </div>
  );
}
