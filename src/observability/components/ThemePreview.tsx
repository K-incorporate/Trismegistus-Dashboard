import { useRef } from "react";
import type { PredefinedTheme } from "@/observability/lib/themeData";

interface ThemePreviewProps {
  theme: PredefinedTheme;
  onApply?: () => void;
}

export function ThemePreview({ theme, onApply }: ThemePreviewProps) {
  const { colors } = theme;
  const applyBtnRef = useRef<HTMLButtonElement | null>(null);

  const paletteKeys: (keyof typeof colors)[] = [
    "primary",
    "bgPrimary",
    "bgSecondary",
    "bgTertiary",
    "textPrimary",
    "textSecondary",
    "accentSuccess",
    "accentError",
  ];

  return (
    <div
      className="rounded-lg border overflow-hidden text-xs"
      style={{ borderColor: colors.borderPrimary || "#e5e7eb" }}
    >
      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{ backgroundColor: colors.bgPrimary || "#ffffff" }}
      >
        <span style={{ color: colors.textPrimary || "#111827", fontWeight: 600 }}>
          {theme.displayName}
        </span>
        <span
          className="w-2 h-2 rounded-full inline-block"
          style={{ backgroundColor: colors.accentSuccess || "#10b981" }}
        />
        <span style={{ color: colors.textSecondary || "#374151" }}>Connected</span>
      </div>

      <div
        className="p-3 flex flex-col gap-2"
        style={{ backgroundColor: colors.bgSecondary || "#f9fafb" }}
      >
        <div
          className="rounded border p-2 flex flex-wrap gap-1 items-center"
          style={{
            backgroundColor: colors.bgPrimary || "#ffffff",
            borderColor: colors.borderPrimary || "#e5e7eb",
          }}
        >
          <span
            className="px-1 py-0.5 rounded"
            style={{ backgroundColor: colors.primary || "#3b82f6", color: colors.bgPrimary || "#fff" }}
          >
            demo-app
          </span>
          <span
            className="px-1 py-0.5 rounded"
            style={{ backgroundColor: colors.bgTertiary || "#f3f4f6", color: colors.textSecondary || "#374151" }}
          >
            abc123
          </span>
          <span style={{ color: colors.textPrimary || "#111827" }}>🔧 PreToolUse</span>
          <span style={{ color: colors.textSecondary || "#374151" }}>Bash</span>
          <span style={{ color: colors.textTertiary || "#6b7280" }}>ls -la</span>
          <span
            className="px-1 py-0.5 rounded"
            style={{ backgroundColor: colors.accentInfo || "#3b82f6", color: "#fff" }}
          >
            summary
          </span>
        </div>

        <div
          className="rounded border p-2 flex flex-wrap gap-2 items-center"
          style={{
            backgroundColor: colors.bgTertiary || "#f3f4f6",
            borderColor: colors.borderSecondary || "#d1d5db",
          }}
        >
          <select
            className="text-xs rounded px-1 py-0.5 border"
            style={{
              backgroundColor: colors.bgPrimary || "#ffffff",
              color: colors.textPrimary || "#111827",
              borderColor: colors.borderPrimary || "#e5e7eb",
            }}
            aria-label="Source filter"
          >
            <option>All Sources</option>
          </select>
          <select
            className="text-xs rounded px-1 py-0.5 border"
            style={{
              backgroundColor: colors.bgPrimary || "#ffffff",
              color: colors.textPrimary || "#111827",
              borderColor: colors.borderPrimary || "#e5e7eb",
            }}
            aria-label="Event type filter"
          >
            <option>All Events</option>
          </select>
          <button
            ref={applyBtnRef}
            className="text-xs px-2 py-0.5 rounded"
            style={{ backgroundColor: colors.primary || "#3b82f6", color: colors.bgPrimary || "#fff" }}
            onMouseEnter={() => {
              if (applyBtnRef.current)
                applyBtnRef.current.style.backgroundColor = colors.primaryHover || "#2563eb";
            }}
            onMouseLeave={() => {
              if (applyBtnRef.current)
                applyBtnRef.current.style.backgroundColor = colors.primary || "#3b82f6";
            }}
          >
            Apply Filters
          </button>
        </div>

        <div className="grid grid-cols-8 gap-0.5">
          {paletteKeys.map((key) => (
            <div
              key={key}
              className="w-full h-8 rounded"
              style={{ backgroundColor: colors[key] || "#888" }}
              title={key}
            />
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: colors.accentSuccess || "#10b981" }} />
            <span style={{ color: colors.textSecondary || "#374151" }}>Success</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: colors.accentWarning || "#f59e0b" }} />
            <span style={{ color: colors.textSecondary || "#374151" }}>Warning</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: colors.accentError || "#ef4444" }} />
            <span style={{ color: colors.textSecondary || "#374151" }}>Error</span>
          </span>
          <span style={{ color: colors.textTertiary || "#6b7280" }}>156 events</span>
        </div>
      </div>

      {onApply !== undefined && (
        <div
          className="px-3 py-2 border-t flex justify-end"
          style={{
            backgroundColor: colors.bgPrimary || "#ffffff",
            borderColor: colors.borderPrimary || "#e5e7eb",
          }}
        >
          <button
            className="text-xs px-3 py-1 rounded font-medium"
            style={{ backgroundColor: colors.primary || "#3b82f6", color: colors.bgPrimary || "#fff" }}
            onClick={onApply}
          >
            Apply Preview
          </button>
        </div>
      )}
    </div>
  );
}
