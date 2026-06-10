import type { HookEvent } from "./types";

export function getAgentKey(e: HookEvent): string {
  if (e.agent_id) return `${e.source_app}:agent:${e.agent_id}`;
  return `${e.source_app}:${e.session_id.slice(0, 8)}`;
}

export function matchesAgentKey(e: HookEvent, key: string): boolean {
  return getAgentKey(e) === key;
}

export function getEventTranscriptPath(e: HookEvent): string | undefined {
  if (e.agent_transcript_path) return e.agent_transcript_path;
  const tp = (e.payload as Record<string, unknown>)?.transcript_path;
  return typeof tp === "string" ? tp : undefined;
}
