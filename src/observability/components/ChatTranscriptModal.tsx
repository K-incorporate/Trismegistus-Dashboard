import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useObsTheme } from "@/observability/ObservabilityThemeProvider";
import { ChatTranscript } from "@/observability/components/ChatTranscript";

interface ChatTranscriptModalProps {
  isOpen: boolean;
  chat: Record<string, unknown>[];
  onClose: () => void;
}

const FILTERS = [
  { type: "user",        label: "User",        icon: "👤" },
  { type: "assistant",   label: "Assistant",   icon: "🤖" },
  { type: "system",      label: "System",      icon: "⚙️" },
  { type: "tool_use",    label: "Tool Use",    icon: "🔧" },
  { type: "tool_result", label: "Tool Result", icon: "✅" },
  { type: "Read",        label: "Read",        icon: "📄" },
  { type: "Write",       label: "Write",       icon: "✍️" },
  { type: "Edit",        label: "Edit",        icon: "✏️" },
  { type: "Glob",        label: "Glob",        icon: "🔎" },
] as const;

const TOOL_FILTER_TYPES = new Set(["Read", "Write", "Edit", "Glob"]);

function stripAnsi(s: string): string {
  return s.replace(/\[[0-9;]*m/g, "");
}

function matchesSearch(item: Record<string, unknown>, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();

  const check = (v: unknown): boolean => {
    if (typeof v === "string") return stripAnsi(v).toLowerCase().includes(q);
    if (typeof v === "number") return String(v).includes(q);
    return false;
  };

  if (check(item.content)) return true;
  if (check(item.role)) return true;
  if (check(item.type)) return true;
  if (check(item.uuid)) return true;
  if (check(item.sessionId)) return true;
  if (check(item.toolUseResult)) return true;

  const msg = item.message as Record<string, unknown> | undefined;
  if (msg) {
    if (check(msg.role)) return true;
    const c = msg.content;
    if (typeof c === "string" && check(c)) return true;
    if (Array.isArray(c)) {
      for (const part of c as Record<string, unknown>[]) {
        if (check(part.text)) return true;
        if (check(part.name)) return true;
        if (check(part.content)) return true;
        if (part.input && check(JSON.stringify(part.input))) return true;
      }
    }
  }

  return false;
}

function matchesFilters(item: Record<string, unknown>, activeFilters: readonly string[]): boolean {
  if (activeFilters.length === 0) return true;

  const itemType = String(item.type ?? "");
  const itemRole = String(item.role ?? "");

  for (const f of activeFilters) {
    if (TOOL_FILTER_TYPES.has(f)) {
      const msg = item.message as Record<string, unknown> | undefined;
      if (msg && Array.isArray(msg.content)) {
        const found = (msg.content as Record<string, unknown>[]).some(
          (c) => (c.type === "tool_use" || c.type === "tool_result") && String(c.name ?? "") === f,
        );
        if (found) return true;
      }
      continue;
    }
    if (f === "tool_use" || f === "tool_result") {
      if (itemType === f) return true;
      const msg = item.message as Record<string, unknown> | undefined;
      if (msg && Array.isArray(msg.content)) {
        if ((msg.content as Record<string, unknown>[]).some((c) => c.type === f)) return true;
      }
      continue;
    }
    if (itemType === f || itemRole === f) return true;
  }

  return false;
}

export function ChatTranscriptModal({ isOpen, chat, onClose }: ChatTranscriptModalProps) {
  const { portalRoot } = useObsTheme();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [copyAllLabel, setCopyAllLabel] = useState("📋 Copy All");
  const copyAllTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = copyAllTimer.current;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchQuery("");
      setActiveSearchQuery("");
      setActiveFilters([]);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const filteredChat = useMemo(() => {
    return chat.filter(
      (item) => matchesSearch(item, activeSearchQuery) && matchesFilters(item, activeFilters),
    );
  }, [chat, activeSearchQuery, activeFilters]);

  function executeSearch() {
    setActiveSearchQuery(searchQuery);
  }

  function toggleFilter(type: string) {
    setActiveFilters((prev) =>
      prev.includes(type) ? prev.filter((f) => f !== type) : [...prev, type],
    );
  }

  function clearSearch() {
    setSearchQuery("");
    setActiveSearchQuery("");
    setActiveFilters([]);
  }

  function copyAllMessages() {
    navigator.clipboard.writeText(JSON.stringify(chat, null, 2)).then(() => {
      setCopyAllLabel("✅ Copied!");
      if (copyAllTimer.current) clearTimeout(copyAllTimer.current);
      copyAllTimer.current = setTimeout(() => setCopyAllLabel("📋 Copy All"), 2000);
    });
  }

  if (!isOpen || !portalRoot) return null;

  const hasActiveSearch = activeSearchQuery || activeFilters.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex flex-col overflow-hidden rounded-lg shadow-xl bg-[var(--theme-bg-primary)] w-[85vw] h-[85vh] max-sm:w-full max-sm:h-full max-sm:rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-[var(--theme-border-primary)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-[var(--theme-text-primary)]">
              💬 Chat Transcript
            </h2>
            <button
              className="flex items-center justify-center rounded-lg p-2 min-w-[44px] min-h-[44px] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-secondary)] text-lg"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Search row */}
          <div className="flex gap-2 mb-3">
            <input
              className="flex-1 rounded border border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] text-sm px-3 py-2 placeholder:text-[var(--theme-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]/40"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && executeSearch()}
            />
            <button
              className="px-3 py-2 rounded bg-[var(--theme-primary)] text-white text-sm font-medium hover:opacity-90"
              onClick={executeSearch}
            >
              Search
            </button>
            <button
              className="px-3 py-2 rounded border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] text-sm hover:bg-[var(--theme-bg-secondary)]"
              onClick={copyAllMessages}
            >
              {copyAllLabel}
            </button>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = activeFilters.includes(f.type);
              return (
                <button
                  key={f.type}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? "bg-[var(--theme-primary)] text-white border-[var(--theme-primary)]"
                      : "bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] border-[var(--theme-border-primary)] hover:border-[var(--theme-primary)]/50"
                  }`}
                  onClick={() => toggleFilter(f.type)}
                >
                  {f.icon} {f.label}
                </button>
              );
            })}
            {hasActiveSearch && (
              <button
                className="text-xs px-2.5 py-1 rounded-full border border-red-500/40 text-red-400 hover:bg-red-500/10"
                onClick={clearSearch}
              >
                ✕ Clear All
              </button>
            )}
          </div>

          {hasActiveSearch && (
            <p className="text-xs text-[var(--theme-text-tertiary)] mt-2">
              Showing {filteredChat.length} of {chat.length} messages
            </p>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-6">
          <ChatTranscript chat={filteredChat} />
        </div>
      </div>
    </div>,
    portalRoot,
  );
}
