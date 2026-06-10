import { useCallback, useEffect, useRef, useState } from "react";
import { ObservabilityThemeProvider, useObsTheme } from "@/observability/ObservabilityThemeProvider";
import { useObservabilityWebSocket } from "@/observability/hooks/useObservabilityWebSocket";
import { AgentSwimLaneContainer } from "@/observability/components/AgentSwimLaneContainer";
import { EventTimeline } from "@/observability/components/EventTimeline";
import { FilterPanel } from "@/observability/components/FilterPanel";
import { LivePulseChart } from "@/observability/components/LivePulseChart";
import { StickScrollButton } from "@/observability/components/StickScrollButton";
import { ThemeManager } from "@/observability/components/ThemeManager";
import { ToastNotification } from "@/observability/components/ToastNotification";
import type { ToastItem } from "@/observability/components/ToastNotification";
import { useHITLNotifications } from "@/observability/hooks/useHITLNotifications";
import type { ObsFilters, TimeRange } from "@/observability/lib/types";
import "@/observability/styles/observability-themes.css";

function ObservabilityInner() {
  const { containerRef } = useObsTheme();
  const { events, isConnected, error, clearEvents } = useObservabilityWebSocket();

  const [filters, setFilters] = useState<ObsFilters>({ sourceApp: "", sessionId: "", eventType: "" });
  const [stickToBottom, setStickToBottom] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedAgentLanes, setSelectedAgentLanes] = useState<string[]>([]);
  const [showThemeManager, setShowThemeManager] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [allAppNames, setAllAppNames] = useState<string[]>([]);
  const [uniqueAppNames, setUniqueAppNames] = useState<string[]>([]);
  const [currentTimeRange, setCurrentTimeRange] = useState<TimeRange>("1m");
  const { notifyHITLRequest } = useHITLNotifications();
  const seenAgents = useRef(new Set<string>());
  const toastIdRef = useRef(0);
  const prevConnectedRef = useRef<boolean | null>(null);

  void currentTimeRange;

  const addToast = useCallback((message: string, type: ToastItem["type"] = "info") => {
    const id = String(++toastIdRef.current);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (prevConnectedRef.current === null) {
      prevConnectedRef.current = isConnected;
      return;
    }
    if (!prevConnectedRef.current && isConnected) {
      addToast("Connected to event server", "success");
    } else if (prevConnectedRef.current && !isConnected) {
      addToast("Event server offline — reconnecting…", "error");
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, addToast]);

  useEffect(() => {
    let hasNew = false;
    for (const event of events) {
      if (!seenAgents.current.has(event.source_app)) {
        seenAgents.current.add(event.source_app);
        hasNew = true;
      }
    }
    if (hasNew) setAllAppNames(Array.from(seenAgents.current));
  }, [events]);

  useEffect(() => {
    for (const event of events) {
      if (event.humanInTheLoop) {
        notifyHITLRequest(event);
      }
    }
  }, [events, notifyHITLRequest]);

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentLanes((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  }, []);

  return (
    <div ref={containerRef} className="obs-root flex h-full min-h-0 flex-col relative">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)]">
        <span
          className="text-xs font-medium"
          style={{ color: isConnected ? "var(--theme-accent-success)" : "var(--theme-accent-error)" }}
        >
          {isConnected ? "● live" : "○ offline"}
        </span>
        <span className="text-xs text-[var(--theme-text-secondary)]">{events.length} events</span>
        {error && (
          <span className="text-xs" style={{ color: "var(--theme-accent-error)" }}>
            {error}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              showFilters
                ? "border-[var(--theme-primary)] bg-[var(--theme-primary)] text-[var(--theme-bg-primary)]"
                : "border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:border-[var(--theme-primary)]"
            }`}
            onClick={() => setShowFilters((v) => !v)}
          >
            Filters
          </button>
          <button
            className="text-xs px-2 py-1 rounded border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:border-[var(--theme-primary)] transition-colors"
            onClick={() => setShowThemeManager(true)}
          >
            🎨 Theme
          </button>
          <button
            className="text-xs px-2 py-1 rounded border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:border-[var(--theme-primary)] transition-colors"
            onClick={clearEvents}
          >
            Clear
          </button>
        </div>
      </div>

      <LivePulseChart
        events={events}
        filters={filters}
        onUpdateUniqueApps={setUniqueAppNames}
        onUpdateAllApps={setAllAppNames}
        onUpdateTimeRange={setCurrentTimeRange}
      />

      {selectedAgentLanes.length > 0 && (
        <AgentSwimLaneContainer
          selectedAgents={selectedAgentLanes}
          events={events}
          timeRange={currentTimeRange}
          onSelectedAgentsChange={setSelectedAgentLanes}
        />
      )}

      {showFilters && <FilterPanel filters={filters} onFiltersChange={setFilters} />}

      <EventTimeline
        events={events}
        filters={filters}
        stickToBottom={stickToBottom}
        onStickToBottomChange={setStickToBottom}
        uniqueAppNames={uniqueAppNames}
        allAppNames={allAppNames}
        onSelectAgent={handleSelectAgent}
      />

      <StickScrollButton stickToBottom={stickToBottom} onToggle={() => setStickToBottom((v) => !v)} />
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
      <ThemeManager isOpen={showThemeManager} onClose={() => setShowThemeManager(false)} />
    </div>
  );
}

export default function ObservabilityPage() {
  return (
    <ObservabilityThemeProvider>
      <ObservabilityInner />
    </ObservabilityThemeProvider>
  );
}
