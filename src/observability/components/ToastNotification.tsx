export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const BORDER_CLASSES: Record<ToastItem["type"], string> = {
  success: "border-[var(--theme-accent-success)] text-[var(--theme-accent-success)]",
  error: "border-[var(--theme-accent-error)] text-[var(--theme-accent-error)]",
  info: "border-[var(--theme-accent-info)] text-[var(--theme-accent-info)]",
};

export function ToastNotification({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-xs font-medium border bg-[var(--theme-bg-primary)] ${BORDER_CLASSES[toast.type]}`}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            className="opacity-60 hover:opacity-100 transition-opacity ml-2"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
