interface Props {
  stickToBottom: boolean;
  onToggle: () => void;
}

export function StickScrollButton({ stickToBottom, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      title={stickToBottom ? "Disable auto-scroll" : "Enable auto-scroll"}
      aria-label={stickToBottom ? "Disable auto-scroll" : "Enable auto-scroll"}
      className={[
        "fixed bottom-6 right-6 sm:bottom-4 sm:right-4",
        "p-4 sm:p-3 rounded-full shadow-lg hover:shadow-xl",
        "transition-all duration-200 min-w-[44px] min-h-[44px]",
        "flex items-center justify-center border-2",
        "transform hover:scale-110",
        stickToBottom
          ? "bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-primary-light)] text-white border-[var(--theme-primary-dark)] drop-shadow-md"
          : "bg-[var(--theme-bg-primary)] hover:bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] border-[var(--theme-border-primary)] hover:border-[var(--theme-primary)]",
      ].join(" ")}
    >
      <svg
        className="w-6 h-6 sm:w-5 sm:h-5 drop-shadow-sm"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        {stickToBottom ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6v.01"
          />
        )}
      </svg>
    </button>
  );
}
