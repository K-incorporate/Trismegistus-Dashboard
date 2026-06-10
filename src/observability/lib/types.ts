// Human-in-the-loop types
export interface HumanInTheLoop {
  question: string;
  type: "question" | "permission" | "choice";
  choices?: string[];
  responseWebSocketUrl?: string;
  timeout?: number;
  requiresResponse?: boolean;
}

export interface HumanInTheLoopResponse {
  answer?: string;
  choice?: string;
  approved?: boolean;
}

export interface HumanInTheLoopStatus {
  status: "pending" | "responded" | "timeout" | "error";
  respondedAt?: number;
  response?: HumanInTheLoopResponse;
}

// Token/cost tracking (§4.4)
export interface AgentTokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  total_tokens: number;
  cost?: number;
}

// The main event type (§4.4 fields)
export interface HookEvent {
  id?: number;
  timestamp: number;
  source_app: string;
  session_id: string;
  hook_event_type: string;
  payload: Record<string, unknown>;
  model_name?: string;
  tool_name?: string;
  tool_use_id?: string;
  error?: string;
  is_interrupt?: boolean;
  permission_suggestions?: unknown;
  stop_hook_active?: boolean;
  notification_type?: string;
  custom_instructions?: string;
  source?: string;
  reason?: string;
  summary?: string;
  // §4.4 multi-agent fields
  agent_id?: string;
  agent_type?: string;
  parent_session_id?: string;
  agent_transcript_path?: string;
  tokens?: AgentTokenUsage;
  // HITL
  humanInTheLoop?: HumanInTheLoop;
  humanInTheLoopResponse?: HumanInTheLoopResponse;
  humanInTheLoopStatus?: HumanInTheLoopStatus;
  // Chat transcript (when --add-chat was used)
  chat?: Record<string, unknown>[];
}

export interface FilterOptions {
  source_apps: string[];
  session_ids: string[];
  hook_event_types: string[];
}

// WebSocket message types
export interface WebSocketMessage {
  type: "initial" | "event";
  data: HookEvent | HookEvent[];
}

// Time range for the chart window
export type TimeRange = "1m" | "3m" | "5m" | "10m";

// Chart types
export interface ChartDataPoint {
  timestamp: number;
  count: number;
  agentId?: string;
}

export interface ChartConfig {
  backgroundColor: string;
  gridColor: string;
  textColor: string;
  lineColor: string;
  agentColors: string[];
  width: number;
  height: number;
}

export interface ChartDimensions {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

// Filter state for the UI
export interface ObsFilters {
  sourceApp: string;
  sessionId: string;
  eventType: string;
}

// Generic API response wrapper
export interface ApiResponse<T = unknown> {
  data: T;
  total?: number;
  page?: number;
  limit?: number;
}
