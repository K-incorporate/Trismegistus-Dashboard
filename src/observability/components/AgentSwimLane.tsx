import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useObsTheme } from "@/observability/ObservabilityThemeProvider";
import { useChartData } from "@/observability/hooks/useChartData";
import { createChartRenderer } from "@/observability/lib/chartRenderer";
import type { ChartRenderer } from "@/observability/lib/chartRenderer";
import type { ChartConfig, HookEvent, TimeRange } from "@/observability/lib/types";
import { getHexColorForSession, getHexColorForApp } from "@/observability/lib/eventColors";

const CHART_HEIGHT = 80;
const SKIPPED_TYPES = new Set(["refresh", "initial"]);

interface AgentSwimLaneProps {
  agentName: string;
  events: HookEvent[];
  timeRange: TimeRange;
  onClose: () => void;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  content: string;
}

function formatModelName(name: string): string {
  const parts = name.split("-");
  if (parts.length >= 4) return `${parts[1]}-${parts[2]}-${parts[3]}`;
  return name;
}

function formatGap(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function getActiveConfig(container: HTMLElement | null): ChartConfig {
  const style = container ? getComputedStyle(container) : null;
  const get = (v: string) => style?.getPropertyValue(v).trim() || "";
  return {
    maxDataPoints: 60,
    animationDuration: 300,
    barWidth: 3,
    barGap: 1,
    colors: {
      primary: get("--theme-primary") || "#3b82f6",
      glow: get("--theme-primary") || "#3b82f6",
      axis: get("--theme-border-primary") || "#e5e7eb",
      text: get("--theme-text-tertiary") || "#6b7280",
    },
  };
}

export function AgentSwimLane({ agentName, events, timeRange, onClose }: AgentSwimLaneProps) {
  const { containerRef } = useObsTheme();

  const colonIdx = agentName.lastIndexOf(":");
  const appName = colonIdx === -1 ? agentName : agentName.slice(0, colonIdx);
  const sessionId = colonIdx === -1 ? "" : agentName.slice(colonIdx + 1);

  const modelName = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.source_app === appName && e.session_id.slice(0, 8) === sessionId && e.model_name) {
        return e.model_name;
      }
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, agentName]);

  const parentSessionId = useMemo(() => {
    for (const e of events) {
      if (e.source_app === appName && e.session_id.slice(0, 8) === sessionId && e.parent_session_id) {
        return e.parent_session_id;
      }
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, agentName]);

  const tokenRollup = useMemo(() => {
    let input = 0, output = 0, cost = 0, hasCost = false;
    for (const e of events) {
      if (e.source_app !== appName || e.session_id.slice(0, 8) !== sessionId) continue;
      if (!e.tokens) continue;
      input += e.tokens.input_tokens ?? 0;
      output += e.tokens.output_tokens ?? 0;
      if (e.tokens.cost != null) { cost += e.tokens.cost; hasCost = true; }
    }
    const total = input + output;
    return total > 0 ? { total, input, output, cost: hasCost ? cost : null } : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, agentName]);

  const chartData = useChartData({ sourceApp: "", sessionId: "", eventType: "" }, agentName);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);
  const renderLoopRef = useRef<number | null>(null);
  const pulseRafsRef = useRef(new Set<number>());
  const mountedRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const themeObserverRef = useRef<MutationObserver | null>(null);
  const processedIds = useRef(new Set<string>());
  const renderRef = useRef<() => void>(() => {});
  const chartDataRef = useRef(chartData);
  const timeRangeRef = useRef<TimeRange>(timeRange);

  const [chartWidth, setChartWidth] = useState(300);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, content: "" });
  const [hoveredBadge, setHoveredBadge] = useState<"events" | "tools" | "avgTime" | null>(null);

  const render = useCallback(() => {
    if (!rendererRef.current || !mountedRef.current) return;
    const renderer = rendererRef.current;
    const points = chartData.getChartData();
    const maxVal = Math.max(1, ...points.map((p) => p.count));

    renderer.clear();
    renderer.drawBackground();
    renderer.drawAxes();
    renderer.drawTimeLabels(timeRangeRef.current);
    renderer.drawBars(
      points,
      maxVal,
      1,
      (eventTypes, toolEvents) => {
        const top = Object.entries(eventTypes).sort((a, b) => b[1] - a[1])[0];
        if (!top) return "";
        if (toolEvents && Object.keys(toolEvents).length > 0) {
          const topTool = Object.entries(toolEvents).sort((a, b) => b[1] - a[1])[0];
          return topTool ? `\u{1F527} ${topTool[0]}` : top[0];
        }
        return top[0];
      },
      getHexColorForSession,
    );
  }, [chartData]);

  useLayoutEffect(() => {
    renderRef.current = render;
    chartDataRef.current = chartData;
    timeRangeRef.current = timeRange;
  });

  const animateNewEvent = useCallback((x: number, y: number) => {
    if (!rendererRef.current || !mountedRef.current) return;
    const startTime = performance.now();
    const duration = 600;
    let currentId: number;
    const step = (now: number) => {
      pulseRafsRef.current.delete(currentId);
      const progress = Math.min((now - startTime) / duration, 1);
      const opacity = (1 - progress) * 0.6;
      const radius = 5 + progress * 30;
      rendererRef.current?.drawPulseEffect(x, y, radius, opacity);
      if (progress < 1 && mountedRef.current) {
        currentId = requestAnimationFrame(step);
        pulseRafsRef.current.add(currentId);
      }
    };
    currentId = requestAnimationFrame(step);
    pulseRafsRef.current.add(currentId);
  }, []);

  const processNewEvents = useCallback((incoming: HookEvent[]) => {
    for (const event of incoming) {
      if (SKIPPED_TYPES.has(event.hook_event_type)) continue;
      const key = `${event.id ?? ""}-${event.timestamp}`;
      if (processedIds.current.has(key)) continue;
      if (event.source_app !== appName || event.session_id.slice(0, 8) !== sessionId) continue;
      processedIds.current.add(key);
      chartDataRef.current.addEvent(event);
      if (canvasRef.current && chartContainerRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect();
        animateNewEvent(rect.width * 0.9, rect.height * 0.5);
      }
    }
  }, [animateNewEvent, appName, sessionId]);

  useEffect(() => {
    if (events.length === 0) {
      processedIds.current.clear();
      chartDataRef.current.clearData();
      return;
    }
    processNewEvents(events);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  useEffect(() => {
    chartDataRef.current.setTimeRange(timeRange);
  }, [timeRange]);

  useEffect(() => {
    mountedRef.current = true;

    const canvas = canvasRef.current;
    const container = chartContainerRef.current;
    if (!canvas || !container) return;

    const cfg = getActiveConfig(containerRef.current);
    const dims = { width: container.clientWidth || 300, height: CHART_HEIGHT, padding: { top: 7, right: 7, bottom: 20, left: 7 } };
    setChartWidth(dims.width);

    try {
      rendererRef.current = createChartRenderer(canvas, dims, cfg);
      rendererRef.current.setDark(containerRef.current?.classList.contains("theme-dark") ?? false);
    } catch {
      return;
    }

    resizeObserverRef.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !rendererRef.current) return;
      const w = entry.contentRect.width;
      setChartWidth(w);
      rendererRef.current.resize({ width: w, height: CHART_HEIGHT, padding: { top: 7, right: 7, bottom: 20, left: 7 } });
    });
    resizeObserverRef.current.observe(container);

    themeObserverRef.current = new MutationObserver(() => {
      if (!rendererRef.current) return;
      const newCfg = getActiveConfig(containerRef.current);
      rendererRef.current.setConfig(newCfg);
      rendererRef.current.setDark(containerRef.current?.classList.contains("theme-dark") ?? false);
      renderRef.current();
    });
    if (containerRef.current) {
      themeObserverRef.current.observe(containerRef.current, { attributes: true, attributeFilter: ["class", "style"] });
    }

    let lastRenderTime = 0;
    const frameInterval = 1000 / 30;
    const renderLoop = (currentTime: number) => {
      if (!mountedRef.current) return;
      const delta = currentTime - lastRenderTime;
      if (delta >= frameInterval) {
        renderRef.current();
        lastRenderTime = currentTime - (delta % frameInterval);
      }
      renderLoopRef.current = requestAnimationFrame(renderLoop);
    };
    renderLoopRef.current = requestAnimationFrame(renderLoop);

    const pulseRafs = pulseRafsRef.current;
    const capturedChartData = chartData;
    return () => {
      mountedRef.current = false;
      if (renderLoopRef.current) { cancelAnimationFrame(renderLoopRef.current); renderLoopRef.current = null; }
      pulseRafs.forEach((id) => cancelAnimationFrame(id));
      pulseRafs.clear();
      resizeObserverRef.current?.disconnect();
      themeObserverRef.current?.disconnect();
      rendererRef.current = null;
      capturedChartData.cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const points = chartData.getChartData();
    const barCount = 60;
    const chartAreaWidth = rect.width - 14;
    const totalBarWidth = chartAreaWidth / barCount;
    const bucketIdx = Math.floor((x - 7) / totalBarWidth);
    const pt = points[bucketIdx];
    if (pt && pt.count > 0) {
      const topType = pt.eventTypes ? Object.entries(pt.eventTypes).sort((a, b) => b[1] - a[1])[0] : null;
      setTooltip({ visible: true, x, y, content: `${pt.count} events${topType ? ` · ${topType[0]}` : ""}` });
    } else {
      setTooltip((prev) => ({ ...prev, visible: false }));
    }
  }, [chartData]);

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const hasData = chartData.getChartData().some((p) => p.count > 0);

  const appBadgeStyle = { backgroundColor: getHexColorForApp(appName), color: "#fff" };
  const sessionBadgeStyle = { backgroundColor: getHexColorForSession(sessionId), color: "#fff" };

  return (
    <div
      className="w-full flex flex-col gap-1"
      style={{ borderBottom: "1px solid var(--theme-border-primary)" }}
    >
      <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-0.5 flex-wrap">
        <span
          className="text-xs font-semibold px-1.5 py-0.5 rounded"
          style={appBadgeStyle}
        >
          {appName}
        </span>
        <span
          className="text-xs font-mono px-1.5 py-0.5 rounded"
          style={sessionBadgeStyle}
        >
          {sessionId}
        </span>

        {modelName && (
          <span
            className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1"
            style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)" }}
          >
            {"\u{1F9E0}"} {formatModelName(modelName)}
          </span>
        )}

        {parentSessionId && (
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: "var(--theme-bg-tertiary)", border: "1px solid var(--theme-border-secondary)", color: "var(--theme-text-tertiary)" }}
            title={`Child of session ${parentSessionId}`}
          >
            {"↳"} {parentSessionId.slice(0, 8)}
          </span>
        )}

        <span
          className="text-xs px-1.5 py-0.5 rounded cursor-default transition-all"
          style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)" }}
          onMouseEnter={() => setHoveredBadge("events")}
          onMouseLeave={() => setHoveredBadge(null)}
        >
          {"⚡"} {hoveredBadge === "events" ? `${chartData.eventTimingMetrics.count} Events` : chartData.eventTimingMetrics.count}
        </span>

        <span
          className="text-xs px-1.5 py-0.5 rounded cursor-default transition-all"
          style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)" }}
          onMouseEnter={() => setHoveredBadge("tools")}
          onMouseLeave={() => setHoveredBadge(null)}
        >
          {"\u{1F527}"} {hoveredBadge === "tools" ? `${chartData.toolCallCount} Tool Calls` : chartData.toolCallCount}
        </span>

        <span
          className="text-xs px-1.5 py-0.5 rounded cursor-default transition-all"
          style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)" }}
          onMouseEnter={() => setHoveredBadge("avgTime")}
          onMouseLeave={() => setHoveredBadge(null)}
        >
          {"\u{1F550}"} {hoveredBadge === "avgTime" ? `Avg Gap: ${formatGap(chartData.eventTimingMetrics.avgGapMs)}` : formatGap(chartData.eventTimingMetrics.avgGapMs)}
        </span>

        {tokenRollup && (
          <span
            className="text-xs px-1.5 py-0.5 rounded cursor-default"
            style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)" }}
            title={`In: ${tokenRollup.input.toLocaleString()} · Out: ${tokenRollup.output.toLocaleString()}`}
          >
            {"\u{1F4CA}"} {formatTokenCount(tokenRollup.total)}
          </span>
        )}

        {tokenRollup?.cost != null && (
          <span
            className="text-xs px-1.5 py-0.5 rounded cursor-default"
            style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)" }}
          >
            {formatCost(tokenRollup.cost)}
          </span>
        )}

        <button
          className="ml-auto text-xs px-1.5 py-0.5 rounded transition-colors"
          style={{ color: "var(--theme-text-tertiary)" }}
          onClick={onClose}
          aria-label={`Close swim lane for ${agentName}`}
        >
          {"✕"}
        </button>
      </div>

      <div
        ref={chartContainerRef}
        className="relative w-full"
        style={{ height: `${CHART_HEIGHT}px` }}
      >
        <canvas
          ref={canvasRef}
          width={chartWidth}
          height={CHART_HEIGHT}
          className="block w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-label={`Activity chart for ${appName} (session: ${sessionId})`}
        />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs" style={{ color: "var(--theme-text-quaternary)" }}>{"⏳"} Waiting for events...</span>
          </div>
        )}
        {tooltip.visible && (
          <div
            className="absolute text-xs px-2 py-1 rounded pointer-events-none"
            style={{
              left: tooltip.x + 8,
              top: tooltip.y - 28,
              background: "var(--theme-bg-primary)",
              color: "var(--theme-text-primary)",
              border: "1px solid var(--theme-border-primary)",
              boxShadow: "0 2px 8px var(--theme-shadow)",
              whiteSpace: "nowrap",
            }}
          >
            {tooltip.content}
          </div>
        )}
      </div>
    </div>
  );
}
