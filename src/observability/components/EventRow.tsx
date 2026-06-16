import { useState, useMemo, useEffect, useRef } from "react";
import type { HookEvent, HumanInTheLoopResponse } from "@/observability/lib/types";
import { OBS_SERVER_BASE } from "@/observability/lib/config";
import { getEmojiForEventType, getEmojiForToolName } from "@/observability/lib/eventEmojis";
import { useObsMediaQuery } from "@/observability/hooks/useObsMediaQuery";
import { ChatTranscriptModal } from "@/observability/components/ChatTranscriptModal";

interface Props {
  event: HookEvent;
  gradientClass: string;
  colorClass: string;
  appColorClass: string;
  appHexColor: string;
  onSelectAgent?: (id: string) => void;
}

const TOOL_EVENT_TYPES = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
]);

function formatModelName(name: string): string {
  return name.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function getToolInfo(event: HookEvent): { tool: string; detail?: string } | null {
  const payload = event.payload;
  if (event.hook_event_type === "UserPromptSubmit" && payload.prompt) {
    const p = String(payload.prompt);
    return {
      tool: "Prompt:",
      detail: `"${p.slice(0, 100)}${p.length > 100 ? "..." : ""}"`,
    };
  }
  if (event.hook_event_type === "PreCompact") {
    const trigger = String(payload.trigger ?? "unknown");
    return {
      tool: "Compaction:",
      detail: trigger === "manual" ? "Manual compaction" : "Auto-compaction (full context)",
    };
  }
  if (event.hook_event_type === "SessionStart") {
    const source = String(payload.source ?? "unknown");
    const labels: Record<string, string> = {
      startup: "New session",
      resume: "Resuming session",
      clear: "Fresh session",
    };
    return { tool: "Session:", detail: labels[source] ?? source };
  }
  if (payload.tool_name) {
    const input = payload.tool_input as Record<string, unknown> | undefined;
    const info: { tool: string; detail?: string } = { tool: String(payload.tool_name) };
    if (input) {
      if (input.command)
        info.detail =
          String(input.command).slice(0, 50) + (String(input.command).length > 50 ? "..." : "");
      else if (input.file_path)
        info.detail = String(input.file_path).split("/").pop();
      else if (input.pattern) info.detail = String(input.pattern);
      else if (input.url)
        info.detail =
          String(input.url).slice(0, 60) + (String(input.url).length > 60 ? "..." : "");
      else if (input.query)
        info.detail = `"${String(input.query).slice(0, 50)}${String(input.query).length > 50 ? "..." : ""}"`;
    }
    return info;
  }
  return null;
}

const HITL_EMOJI: Record<string, string> = {
  question: "❓",
  permission: "🔐",
  choice: "🎯",
};

const HITL_LABEL: Record<string, string> = {
  question: "Agent Question",
  permission: "Permission Request",
  choice: "Choice Required",
};

export function EventRow({
  event,
  gradientClass,
  colorClass,
  appColorClass,
  appHexColor,
  onSelectAgent,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [copyLabel, setCopyLabel] = useState("📋 Copy");
  const [responseText, setResponseText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmittedResponse, setHasSubmittedResponse] = useState(false);
  const [localResponse, setLocalResponse] = useState<HumanInTheLoopResponse | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  const { isMobile } = useObsMediaQuery();

  const sessionIdShort = useMemo(() => event.session_id.slice(0, 8), [event.session_id]);

  const hookEmoji = useMemo(() => {
    const base = getEmojiForEventType(event.hook_event_type);
    if (TOOL_EVENT_TYPES.has(event.hook_event_type) && event.payload?.tool_name) {
      return base + getEmojiForToolName(String(event.payload.tool_name));
    }
    return base;
  }, [event.hook_event_type, event.payload]);

  const borderColorClass = useMemo(
    () => colorClass.replace("bg-", "border-"),
    [colorClass],
  );

  const appBgStyle = useMemo(
    () => ({ backgroundColor: appHexColor + "33" }),
    [appHexColor],
  );

  const appBorderStyle = useMemo(
    () => ({ borderColor: appHexColor }),
    [appHexColor],
  );

  const formattedPayload = useMemo(
    () => JSON.stringify(event.payload, null, 2),
    [event.payload],
  );

  const toolName = useMemo<string | null>(() => {
    if (TOOL_EVENT_TYPES.has(event.hook_event_type) && event.payload?.tool_name) {
      return String(event.payload.tool_name);
    }
    return null;
  }, [event.hook_event_type, event.payload]);

  const toolInfo = useMemo(() => getToolInfo(event), [event]);

  const formattedTime = useMemo(() => {
    const d = new Date(event.timestamp * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }, [event.timestamp]);

  const hitl = event.humanInTheLoop;
  const hitlPending = event.humanInTheLoopStatus?.status === "pending";
  const showHitl = !!hitl && (hitlPending || hasSubmittedResponse);

  const hitlTypeEmoji = hitl ? (HITL_EMOJI[hitl.type] ?? "❓") : "";
  const hitlTypeLabel = hitl ? (HITL_LABEL[hitl.type] ?? hitl.type) : "";
  const permissionType = event.payload?.permission_type as string | null | undefined;

  const submitAnswer = async () => {
    if (!responseText.trim() || !event.id) return;
    const response: HumanInTheLoopResponse = { answer: responseText.trim() };
    const savedText = responseText;
    setLocalResponse(response);
    setHasSubmittedResponse(true);
    setResponseText("");
    setIsSubmitting(true);
    try {
      const res = await fetch(`${OBS_SERVER_BASE}/events/${event.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLocalResponse(null);
      setHasSubmittedResponse(false);
      setResponseText(savedText);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitApproval = async (approved: boolean) => {
    if (!event.id) return;
    const response: HumanInTheLoopResponse = { approved };
    setLocalResponse(response);
    setHasSubmittedResponse(true);
    setIsSubmitting(true);
    try {
      const res = await fetch(`${OBS_SERVER_BASE}/events/${event.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLocalResponse(null);
      setHasSubmittedResponse(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitChoice = async (choice: string) => {
    if (!event.id) return;
    const response: HumanInTheLoopResponse = { choice };
    setLocalResponse(response);
    setHasSubmittedResponse(true);
    setIsSubmitting(true);
    try {
      const res = await fetch(`${OBS_SERVER_BASE}/events/${event.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLocalResponse(null);
      setHasSubmittedResponse(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(formattedPayload).then(() => {
      setCopyLabel("✅ Copied!");
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopyLabel("📋 Copy"), 2000);
    });
  };

  const toggleExpanded = () => setIsExpanded((v) => !v);

  // HITL block
  if (showHitl && hitl) {
    const responded = hasSubmittedResponse || event.humanInTheLoopStatus?.status === "responded";
    const borderColor = responded ? "border-green-500" : "border-yellow-400";
    const gradBg = responded
      ? "from-green-950/30 to-transparent"
      : "from-yellow-950/30 to-transparent";
    const displayResponse = localResponse ?? event.humanInTheLoopResponse;

    return (
      <div
        className={`relative rounded-lg border ${borderColor} bg-gradient-to-r ${gradBg} p-3 mb-2`}
      >
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-lg">{hitlTypeEmoji}</span>
          <span className="font-semibold text-sm text-[var(--theme-text-primary)]">
            {hitlTypeLabel}
          </span>
          {permissionType && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)]">
              {permissionType}
            </span>
          )}
          {hitlPending && !hasSubmittedResponse ? (
            <span className="text-xs text-yellow-400 ml-auto">⏱️ Waiting...</span>
          ) : responded ? (
            <span className="text-xs text-green-400 ml-auto">✅ Responded</span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
          <span
            className={`px-1.5 py-0.5 rounded border font-medium ${appColorClass}`}
            style={{ ...appBgStyle, ...appBorderStyle }}
          >
            {event.source_app}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded border font-mono ${borderColorClass} text-[var(--theme-text-secondary)]`}
          >
            {sessionIdShort}
          </span>
          <span className="text-[var(--theme-text-tertiary)] ml-auto">{formattedTime}</span>
        </div>

        <div className="mb-3 p-2 rounded bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] text-sm text-[var(--theme-text-primary)]">
          {hitl.question}
        </div>

        {responded && displayResponse && (
          <div className="mb-3 p-2 rounded bg-green-950/40 border border-green-700/50 text-sm">
            {displayResponse.answer !== undefined && (
              <p className="text-green-300">
                <span className="font-medium">Answer:</span> {displayResponse.answer}
              </p>
            )}
            {displayResponse.approved !== undefined && (
              <p className={displayResponse.approved ? "text-green-300" : "text-red-400"}>
                {displayResponse.approved ? "✅ Approved" : "❌ Denied"}
              </p>
            )}
            {displayResponse.choice !== undefined && (
              <p className="text-green-300">
                <span className="font-medium">Choice:</span> {displayResponse.choice}
              </p>
            )}
          </div>
        )}

        {hitlPending && !hasSubmittedResponse && (
          <div onClick={(e) => e.stopPropagation()}>
            {hitl.type === "question" && (
              <div className="flex gap-2">
                <textarea
                  className="flex-1 resize-none rounded border border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] text-sm p-2 min-h-[72px]"
                  placeholder="Type your answer..."
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  disabled={isSubmitting}
                />
                <button
                  className="self-end px-3 py-1.5 rounded bg-[var(--theme-primary)] text-white text-sm font-medium disabled:opacity-50"
                  onClick={submitAnswer}
                  disabled={isSubmitting || !responseText.trim()}
                >
                  {isSubmitting ? "Sending..." : "Submit"}
                </button>
              </div>
            )}
            {hitl.type === "permission" && (
              <div className="flex gap-2">
                <button
                  className="px-4 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium disabled:opacity-50"
                  onClick={() => submitApproval(true)}
                  disabled={isSubmitting}
                >
                  ✅ Approve
                </button>
                <button
                  className="px-4 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-50"
                  onClick={() => submitApproval(false)}
                  disabled={isSubmitting}
                >
                  ❌ Deny
                </button>
              </div>
            )}
            {hitl.type === "choice" && hitl.choices && (
              <div className="flex gap-2 flex-wrap">
                {hitl.choices.map((c) => (
                  <button
                    key={c}
                    className="px-3 py-1.5 rounded border border-[var(--theme-primary)]/40 text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/10 text-sm font-medium disabled:opacity-50"
                    onClick={() => submitChoice(c)}
                    disabled={isSubmitting}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Regular card
  return (
    <>
      <div
        className={`relative rounded-lg border ${borderColorClass} overflow-hidden cursor-pointer mb-2 transition-all ${isExpanded ? "ring-2 ring-[var(--theme-primary)]/50" : ""}`}
        style={{ background: `linear-gradient(135deg, ${appHexColor}11 0%, transparent 60%)` }}
        onClick={toggleExpanded}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-3 rounded-l-lg"
          style={{ backgroundColor: appHexColor }}
        />
        <div className={`absolute left-3 top-0 bottom-0 w-1.5 ${gradientClass}`} />

        <div className="ml-4 pl-1 pr-3 py-2">
          {!isMobile ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded border font-medium ${appColorClass}`}
                  style={{ ...appBgStyle, ...appBorderStyle }}
                >
                  {event.source_app}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded border font-mono ${borderColorClass} text-[var(--theme-text-secondary)]`}
                >
                  {sessionIdShort}
                </span>
                {event.model_name && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)]">
                    🧠 {formatModelName(event.model_name)}
                  </span>
                )}
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--theme-primary)]/20 text-[var(--theme-primary)] font-medium">
                  {hookEmoji} {event.hook_event_type}
                </span>
                {toolName && (
                  <span className="text-xs px-1.5 py-0.5 rounded border border-[var(--theme-primary)]/40 text-[var(--theme-primary)]">
                    {toolName}
                  </span>
                )}
                {event.agent_type && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)] text-[var(--theme-text-tertiary)]">
                    🤖 {event.agent_type}
                  </span>
                )}
                {event.parent_session_id && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-secondary)] text-[var(--theme-text-tertiary)]"
                    title={`Child of session ${event.parent_session_id}`}>
                    ↳ {event.parent_session_id.slice(0, 8)}
                  </span>
                )}
                <span className="text-xs text-[var(--theme-text-tertiary)] ml-auto tabular-nums">
                  {formattedTime}
                </span>
              </div>
              {(toolInfo || event.summary) && (
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  {toolInfo && (
                    <>
                      <span className="font-medium text-[var(--theme-text-secondary)]">
                        {toolInfo.tool}
                      </span>
                      {toolInfo.detail && (
                        <span className="text-[var(--theme-text-tertiary)] truncate max-w-[300px]">
                          {toolInfo.detail}
                        </span>
                      )}
                    </>
                  )}
                  {event.summary && (
                    <span className="ml-auto px-1.5 py-0.5 rounded bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] text-[var(--theme-text-tertiary)]">
                      📝 {event.summary}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`px-1.5 py-0.5 rounded border font-medium ${appColorClass}`}
                  style={{ ...appBgStyle, ...appBorderStyle }}
                >
                  {event.source_app}
                </span>
                <span className="text-[var(--theme-text-tertiary)] ml-auto tabular-nums">
                  {formattedTime}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`px-1.5 py-0.5 rounded border font-mono ${borderColorClass} text-[var(--theme-text-secondary)]`}
                >
                  {sessionIdShort}
                </span>
                {event.model_name && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)]">
                    🧠 {formatModelName(event.model_name)}
                  </span>
                )}
                <span className="px-1.5 py-0.5 rounded bg-[var(--theme-primary)]/20 text-[var(--theme-primary)] font-medium">
                  {hookEmoji} {event.hook_event_type}
                </span>
                {toolName && (
                  <span className="px-1.5 py-0.5 rounded border border-[var(--theme-primary)]/40 text-[var(--theme-primary)]">
                    {toolName}
                  </span>
                )}
                {event.agent_type && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)] text-[var(--theme-text-tertiary)]">
                    🤖 {event.agent_type}
                  </span>
                )}
                {event.parent_session_id && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-secondary)] text-[var(--theme-text-tertiary)]"
                    title={`Child of session ${event.parent_session_id}`}>
                    ↳ {event.parent_session_id.slice(0, 8)}
                  </span>
                )}
              </div>
              {(toolInfo || event.summary) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {toolInfo && (
                    <>
                      <span className="font-medium text-[var(--theme-text-secondary)]">
                        {toolInfo.tool}
                      </span>
                      {toolInfo.detail && (
                        <span className="text-[var(--theme-text-tertiary)] truncate max-w-[200px]">
                          {toolInfo.detail}
                        </span>
                      )}
                    </>
                  )}
                  {event.summary && (
                    <span className="ml-auto px-1.5 py-0.5 rounded bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] text-[var(--theme-text-tertiary)]">
                      📝 {event.summary}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {isExpanded && (
            <div
              className="mt-2 border-t border-[var(--theme-border-primary)] pt-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative">
                <pre className="text-xs bg-[var(--theme-bg-secondary)] rounded p-2 overflow-auto max-h-64 text-[var(--theme-text-secondary)] font-mono whitespace-pre-wrap break-all">
                  {formattedPayload}
                </pre>
                <button
                  className="absolute top-1 right-1 text-xs px-2 py-0.5 rounded bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-primary)]"
                  onClick={handleCopy}
                >
                  {copyLabel}
                </button>
              </div>
              {!isMobile && event.chat && event.chat.length > 0 && (
                <button
                  className="mt-2 text-xs px-3 py-1 rounded border border-[var(--theme-primary)]/50 text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/10"
                  onClick={() => setShowChatModal(true)}
                >
                  💬 View chat transcript
                </button>
              )}
              {event.agent_id && onSelectAgent && (
                <button
                  className="mt-2 ml-2 text-xs px-3 py-1 rounded border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-primary)] hover:border-[var(--theme-primary)]/50"
                  onClick={() => onSelectAgent(event.agent_id!)}
                >
                  🤖 View agent
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {event.chat && event.chat.length > 0 && (
        <ChatTranscriptModal
          isOpen={showChatModal}
          chat={event.chat}
          onClose={() => setShowChatModal(false)}
        />
      )}
    </>
  );
}
