import { useState, useMemo, useCallback } from "react";
import type { HookEvent } from "../lib/types";

function validateRegex(pattern: string): { valid: boolean; error?: string } {
  if (!pattern || pattern.trim() === "") return { valid: true };
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Invalid regex pattern";
    return { valid: false, error: errorMessage };
  }
}

function getSearchableText(event: HookEvent): string {
  const parts: string[] = [];
  if (event.hook_event_type) parts.push(event.hook_event_type);
  if (event.source_app) parts.push(event.source_app);
  if (event.session_id) parts.push(event.session_id);
  if (event.model_name) parts.push(event.model_name);
  if (event.tool_name) parts.push(event.tool_name);
  const toolInput = event.payload?.tool_input as Record<string, unknown> | undefined;
  const toolCommand = String(toolInput?.command ?? "");
  if (toolCommand) parts.push(toolCommand);
  const toolPath = String(toolInput?.file_path ?? toolInput?.path ?? "");
  if (toolPath) parts.push(toolPath);
  if (event.summary) parts.push(event.summary);
  if (event.humanInTheLoop?.question) parts.push(event.humanInTheLoop.question);
  return parts.join(" ").toLowerCase();
}

function matchesPattern(event: HookEvent, pattern: string): boolean {
  if (!pattern || pattern.trim() === "") return true;
  if (!validateRegex(pattern).valid) return false;
  try {
    return new RegExp(pattern, "i").test(getSearchableText(event));
  } catch {
    return false;
  }
}

function searchEvents(events: HookEvent[], pattern: string): HookEvent[] {
  if (!pattern || pattern.trim() === "") return events;
  return events.filter((e) => matchesPattern(e, pattern));
}

export function useEventSearch() {
  const [searchPattern, setSearchPattern] = useState("");
  const [searchError, setSearchError] = useState("");

  const hasError = useMemo(() => searchError.length > 0, [searchError]);

  const updateSearchPattern = useCallback((pattern: string) => {
    setSearchPattern(pattern);
    if (!pattern || pattern.trim() === "") {
      setSearchError("");
      return;
    }
    const v = validateRegex(pattern);
    setSearchError(v.valid ? "" : (v.error ?? "Invalid regex pattern"));
  }, []);

  const clearSearch = useCallback(() => {
    setSearchPattern("");
    setSearchError("");
  }, []);

  return {
    searchPattern,
    searchError,
    hasError,
    validateRegex,
    matchesPattern,
    searchEvents,
    updateSearchPattern,
    clearSearch,
    getSearchableText,
  };
}
