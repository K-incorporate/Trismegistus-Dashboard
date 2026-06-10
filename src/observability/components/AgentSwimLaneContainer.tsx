import { AgentSwimLane } from "@/observability/components/AgentSwimLane";
import type { HookEvent, TimeRange } from "@/observability/lib/types";

interface AgentSwimLaneContainerProps {
  selectedAgents: string[];
  events: HookEvent[];
  timeRange: TimeRange;
  onSelectedAgentsChange: (agents: string[]) => void;
}

export function AgentSwimLaneContainer({ selectedAgents, events, timeRange, onSelectedAgentsChange }: AgentSwimLaneContainerProps) {
  if (selectedAgents.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-2 shrink-0">
      {selectedAgents.map((agent) => (
        <AgentSwimLane
          key={agent}
          agentName={agent}
          events={events}
          timeRange={timeRange}
          onClose={() => onSelectedAgentsChange(selectedAgents.filter((a) => a !== agent))}
        />
      ))}
    </div>
  );
}
