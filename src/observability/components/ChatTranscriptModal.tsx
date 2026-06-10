interface Props {
  isOpen: boolean;
  chat: Record<string, unknown>[];
  onClose: () => void;
}

// Full implementation in Phase 5 (Task 5.2). Stub allows EventRow to compile.
export function ChatTranscriptModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg p-6 max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--theme-primary)]">Chat Transcript</h2>
          <button
            onClick={onClose}
            className="text-[var(--theme-text-tertiary)] hover:text-[var(--theme-primary)] text-xl font-bold"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-[var(--theme-text-secondary)] text-sm">Full transcript viewer coming in Phase 5.</p>
      </div>
    </div>
  );
}
