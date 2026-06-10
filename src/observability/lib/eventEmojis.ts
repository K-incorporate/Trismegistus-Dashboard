const eventTypeToEmoji: Record<string, string> = {
  PreToolUse: "🔧",
  PostToolUse: "✅",
  PostToolUseFailure: "❌",
  PermissionRequest: "🔐",
  Notification: "🔔",
  Stop: "🛑",
  SubagentStart: "🟢",
  SubagentStop: "👥",
  PreCompact: "📦",
  UserPromptSubmit: "💬",
  SessionStart: "🚀",
  SessionEnd: "🏁",
};

const toolNameToEmoji: Record<string, string> = {
  Bash: "💻",
  Read: "📖",
  Write: "✍️",
  Edit: "✏️",
  MultiEdit: "✏️",
  Glob: "🔍",
  Grep: "🔎",
  WebFetch: "🌐",
  WebSearch: "🔍",
  NotebookEdit: "📓",
  Task: "🤖",
  TaskCreate: "📋",
  TaskGet: "📄",
  TaskUpdate: "📝",
  TaskList: "📑",
  TaskOutput: "📤",
  TaskStop: "⏹️",
  TeamCreate: "👥",
  TeamDelete: "🗑️",
  SendMessage: "💬",
  EnterPlanMode: "🗺️",
  ExitPlanMode: "🚪",
  AskUserQuestion: "❓",
  Skill: "⚡",
};

export function getEmojiForEventType(eventType: string): string {
  return eventTypeToEmoji[eventType] ?? "❓";
}

export function getEmojiForToolName(toolName: string): string {
  if (toolName in toolNameToEmoji) return toolNameToEmoji[toolName];
  if (toolName.startsWith("mcp__")) return "🔌";
  return "🔧";
}

export function formatEventTypeLabel(eventType: string): string {
  return eventType
    .replace(/([A-Z])/g, " $1")
    .trim();
}
