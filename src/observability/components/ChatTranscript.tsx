import { useEffect, useRef, useState } from "react";

interface ChatTranscriptProps {
  chat: Record<string, unknown>[];
}

function cleanSystemContent(content: string): string {
  return content.replace(/\[[0-9;]*m/g, "");
}

function cleanCommandContent(content: string): string {
  return content
    .replace(/<command-message>.*?<\/command-message>/gs, "")
    .replace(/<command-name>(.*?)<\/command-name>/gs, "$1")
    .trim();
}

export function ChatTranscript({ chat }: ChatTranscriptProps) {
  const [expandedDetails, setExpandedDetails] = useState<Set<number>>(new Set());
  const [copyStates, setCopyStates] = useState<Map<number, string>>(new Map());
  const copyTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = copyTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  function toggleDetails(index: number) {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function copyMessage(index: number, item: Record<string, unknown>) {
    navigator.clipboard.writeText(JSON.stringify(item, null, 2)).then(() => {
      setCopyStates((prev) => new Map(prev).set(index, "✅"));
      const existing = copyTimers.current.get(index);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        setCopyStates((prev) => {
          const next = new Map(prev);
          next.delete(index);
          return next;
        });
      }, 2000);
      copyTimers.current.set(index, t);
    });
  }

  function renderMessageContent(content: unknown, isUser: boolean) {
    if (typeof content === "string") {
      const text = content.includes("<command-") ? cleanCommandContent(content) : content;
      return (
        <p className={`text-sm whitespace-pre-wrap font-medium ${isUser ? "text-gray-800 dark:text-gray-100" : "text-gray-800 dark:text-gray-100"}`}>
          {text}
        </p>
      );
    }
    if (Array.isArray(content)) {
      return (
        <div className="space-y-2">
          {(content as Record<string, unknown>[]).map((c, i) => {
            if (c.type === "text") {
              return (
                <p key={i} className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                  {String(c.text ?? "")}
                </p>
              );
            }
            if (c.type === "tool_result") {
              return (
                <div key={i} className="bg-gray-100 dark:bg-gray-900 rounded p-2">
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">Tool Result:</span>
                  <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap overflow-auto mt-1">
                    {typeof c.content === "string" ? c.content : JSON.stringify(c.content, null, 2)}
                  </pre>
                </div>
              );
            }
            if (c.type === "tool_use") {
              return (
                <div key={i} className="bg-yellow-50 dark:bg-yellow-900/20 rounded p-2">
                  <span className="text-xs font-mono text-yellow-700 dark:text-yellow-400">🔧 {String(c.name ?? "tool_use")}</span>
                  <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap overflow-auto mt-1">
                    {JSON.stringify(c.input ?? {}, null, 2)}
                  </pre>
                </div>
              );
            }
            return null;
          })}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 h-full overflow-y-auto space-y-3 border-2 border-gray-300 dark:border-gray-600">
      {chat.map((item, index) => {
        const isExpanded = expandedDetails.has(index);
        const copyLabel = copyStates.get(index) ?? "📋";

        const itemControls = (
          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            <button
              className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => toggleDetails(index)}
            >
              {isExpanded ? "Hide" : "Show"} Details
            </button>
            <button
              className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => copyMessage(index, item)}
            >
              {copyLabel}
            </button>
          </div>
        );

        const detailPanel = isExpanded && (
          <div className="mt-3 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg">
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap overflow-auto">
              {JSON.stringify(item, null, 2)}
            </pre>
          </div>
        );

        const message = item.message as Record<string, unknown> | undefined;

        if (item.type === "user" && message) {
          return (
            <div key={index} className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-sm font-semibold px-3 py-1 rounded-full flex-shrink-0 bg-blue-500 text-white">
                    User
                  </span>
                  <div className="flex-1 min-w-0">
                    {renderMessageContent(message.content, true)}
                  </div>
                </div>
                {itemControls}
              </div>
              {detailPanel}
            </div>
          );
        }

        if (item.type === "assistant" && message) {
          const usage = message.usage as Record<string, unknown> | undefined;
          return (
            <div key={index} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-sm font-semibold px-3 py-1 rounded-full flex-shrink-0 bg-gray-500 text-white">
                    Assistant
                  </span>
                  <div className="flex-1 min-w-0">
                    {renderMessageContent(message.content, false)}
                    {usage && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Tokens: {String(usage.input_tokens ?? 0)} in / {String(usage.output_tokens ?? 0)} out
                      </p>
                    )}
                  </div>
                </div>
                {itemControls}
              </div>
              {detailPanel}
            </div>
          );
        }

        if (item.type === "system") {
          const raw = typeof item.content === "string" ? item.content : JSON.stringify(item.content);
          return (
            <div key={index} className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-sm font-semibold px-3 py-1 rounded-full flex-shrink-0 bg-amber-500 text-white">
                    System
                  </span>
                  <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap flex-1 min-w-0">
                    {cleanSystemContent(raw)}
                  </p>
                </div>
                {itemControls}
              </div>
              {detailPanel}
            </div>
          );
        }

        // Fallback: role-based
        const role = String(item.role ?? "unknown");
        const isUserRole = role === "user";
        const bgClass = isUserRole ? "bg-blue-50 dark:bg-blue-900/30" : "bg-gray-50 dark:bg-gray-700/30";
        const badgeClass = isUserRole ? "bg-blue-500 text-white" : "bg-gray-500 text-white";
        const badgeLabel = isUserRole ? "User" : role;
        const rawContent = typeof item.content === "string" ? item.content : JSON.stringify(item.content ?? "");

        return (
          <div key={index} className={`p-3 rounded-lg ${bgClass}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <span className={`text-sm font-semibold px-3 py-1 rounded-full flex-shrink-0 ${badgeClass}`}>
                  {badgeLabel}
                </span>
                <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap flex-1 min-w-0">
                  {rawContent}
                </p>
              </div>
              {itemControls}
            </div>
            {detailPanel}
          </div>
        );
      })}
    </div>
  );
}
