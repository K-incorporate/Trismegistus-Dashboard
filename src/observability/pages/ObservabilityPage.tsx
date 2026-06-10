import { ObservabilityThemeProvider, useObsTheme } from "../ObservabilityThemeProvider";
import { useObservabilityWebSocket } from "../hooks/useObservabilityWebSocket";
import "../styles/observability-themes.css";

function ObservabilityInner() {
  const { containerRef } = useObsTheme();
  const { events, isConnected, error } = useObservabilityWebSocket();
  return (
    <div ref={containerRef} className="obs-root flex h-full min-h-0 flex-col text-text-primary">
      <div className="flex items-center gap-2 p-3">
        <span className={isConnected ? "text-success" : "text-destructive"}>
          {isConnected ? "● live" : "○ event server offline"}
        </span>
        <span className="text-text-secondary">{events.length} events</span>
        {error && <span className="text-destructive">{error}</span>}
      </div>
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
