import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useObsTheme } from "@/observability/ObservabilityThemeProvider";
import { PREDEFINED_THEMES } from "@/observability/lib/themeData";

interface ThemeManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ThemeManager({ isOpen, onClose }: ThemeManagerProps) {
  const { portalRoot, currentTheme, setTheme } = useObsTheme();

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!portalRoot) return null;
  if (!isOpen) return null;

  const themes = Object.values(PREDEFINED_THEMES);
  const count = themes.length;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="w-[75vw] h-[75vh] relative z-10 flex flex-col overflow-hidden rounded-lg shadow-xl bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)]"
        role="dialog"
        aria-modal="true"
        aria-label="Theme Manager"
      >
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--theme-border-primary)]">
          <span className="font-semibold text-[var(--theme-text-primary)]">🎨 Theme Manager</span>
          <button
            className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-hover-bg)] transition-colors"
            onClick={onClose}
            aria-label="Close theme manager"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {themes.map((theme) => {
              const isActive = currentTheme === theme.name;
              return (
                <div
                  key={theme.name}
                  className={`cursor-pointer rounded-lg border-2 p-4 transition-all hover:shadow-md ${
                    isActive
                      ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/10"
                      : "border-[var(--theme-border-primary)] hover:border-[var(--theme-border-secondary)]"
                  }`}
                  onClick={() => {
                    setTheme(theme.name);
                    onClose();
                  }}
                >
                  <div className="h-16 rounded flex overflow-hidden mb-3">
                    <div className="flex-1" style={{ backgroundColor: theme.preview.primary }} />
                    <div className="flex-1" style={{ backgroundColor: theme.preview.secondary }} />
                    <div className="flex-1" style={{ backgroundColor: theme.preview.accent }} />
                  </div>

                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-[var(--theme-text-primary)]">
                      {theme.displayName}
                    </span>
                    {isActive && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 flex items-center gap-1 shrink-0">
                        <span aria-hidden="true">✓</span>
                        Current
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-[var(--theme-text-tertiary)]">{theme.description}</p>
                </div>
              );
            })}
          </div>

          <div className="border-t border-[var(--theme-border-primary)] pt-4 mt-6 flex items-center justify-between">
            <span className="text-sm text-[var(--theme-text-tertiary)]">
              {count} themes available
            </span>
            <button
              className="text-xs px-4 py-2 rounded border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:border-[var(--theme-primary)] transition-colors"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalRoot,
  );
}
