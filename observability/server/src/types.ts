export interface HumanInTheLoop {
  question: string;
  responseWebSocketUrl: string;
  type: 'question' | 'permission' | 'choice';
  choices?: string[];
  timeout?: number;
  requiresResponse?: boolean;
}

export interface HumanInTheLoopResponse {
  response?: string;
  permission?: boolean;
  choice?: string;
  hookEvent: HookEvent;
  respondedAt: number;
  respondedBy?: string;
}

export interface HumanInTheLoopStatus {
  status: 'pending' | 'responded' | 'timeout' | 'error';
  respondedAt?: number;
  response?: HumanInTheLoopResponse;
}

export interface AgentTokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
  cost?: number;
}

export interface HookEvent {
  id?: number;
  source_app: string;
  session_id: string;
  hook_event_type: string;
  payload: Record<string, unknown>;
  chat?: unknown[];
  summary?: string;
  timestamp?: number;
  model_name?: string;
  // §4.4 multi-agent linking
  agent_id?: string;
  agent_type?: string;
  parent_session_id?: string;
  agent_transcript_path?: string;
  // §4.4 token/cost (server-enriched)
  tokens?: AgentTokenUsage;
  // HITL (dormant)
  humanInTheLoop?: HumanInTheLoop;
  humanInTheLoopStatus?: HumanInTheLoopStatus;
}

export interface FilterOptions {
  source_apps: string[];
  session_ids: string[];
  hook_event_types: string[];
}

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryDark: string;
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgQuaternary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textQuaternary: string;
  borderPrimary: string;
  borderSecondary: string;
  borderTertiary: string;
  accentSuccess: string;
  accentWarning: string;
  accentError: string;
  accentInfo: string;
  shadow: string;
  shadowLg: string;
  hoverBg: string;
  activeBg: string;
  focusRing: string;
}

export interface Theme {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  colors: ThemeColors;
  isPublic: boolean;
  authorId?: string;
  authorName?: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  downloadCount?: number;
  rating?: number;
  ratingCount?: number;
}

export interface ThemeSearchQuery {
  query?: string;
  tags?: string[];
  authorId?: string;
  isPublic?: boolean;
  sortBy?: 'name' | 'created' | 'updated' | 'downloads' | 'rating';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ThemeShare {
  id: string;
  themeId: string;
  shareToken: string;
  expiresAt?: number;
  isPublic: boolean;
  allowedUsers: string[];
  createdAt: number;
  accessCount: number;
}

export interface ThemeRating {
  id: string;
  themeId: string;
  userId: string;
  rating: number;
  comment?: string;
  createdAt: number;
}

export interface ThemeValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  validationErrors?: ThemeValidationError[];
}
