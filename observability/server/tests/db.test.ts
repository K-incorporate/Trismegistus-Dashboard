import { test, expect, beforeEach } from "bun:test";
import { initDatabase, insertEvent, getRecentEvents, getFilterOptions, updateEventTokens, db } from "../src/db";

beforeEach(() => {
  process.env.OBS_DB_PATH = ":memory:";
  initDatabase();
  db.exec("DELETE FROM events");
});

test("insertEvent round-trips core + §4.4 fields", () => {
  const saved = insertEvent({
    source_app: "trismegistus-dashboard",
    session_id: "sess-123456789",
    hook_event_type: "SubagentStop",
    payload: { tool_name: "Task" },
    agent_id: "agent-abc",
    agent_type: "general-purpose",
    parent_session_id: "sess-parent",
    agent_transcript_path: "/tmp/a.jsonl",
    model_name: "claude-opus-4-8",
    tokens: { input_tokens: 10, output_tokens: 5, total_tokens: 15, cost: 0.01 },
  });
  expect(saved.id).toBeGreaterThan(0);
  const recent = getRecentEvents(10);
  expect(recent.length).toBe(1);
  expect(recent[0].agent_id).toBe("agent-abc");
  expect(recent[0].agent_type).toBe("general-purpose");
  expect(recent[0].parent_session_id).toBe("sess-parent");
  expect(recent[0].tokens?.total_tokens).toBe(15);
  expect(recent[0].payload).toEqual({ tool_name: "Task" });
});

test("getFilterOptions returns distinct source apps / sessions / types", () => {
  insertEvent({ source_app: "a", session_id: "s1", hook_event_type: "PreToolUse", payload: {} });
  insertEvent({ source_app: "b", session_id: "s2", hook_event_type: "Stop", payload: {} });
  const opts = getFilterOptions();
  expect(opts.source_apps.sort()).toEqual(["a", "b"]);
  expect(opts.hook_event_types.sort()).toEqual(["PreToolUse", "Stop"]);
  expect(opts.session_ids.length).toBe(2);
});

test("updateEventTokens updates token columns by id", () => {
  const saved = insertEvent({
    source_app: "x", session_id: "s3", hook_event_type: "Stop", payload: {},
    agent_transcript_path: "/tmp/t.jsonl",
  });
  updateEventTokens(saved.id!, { input_tokens: 100, output_tokens: 50, total_tokens: 150, cost: 0.005 });
  const recent = getRecentEvents(10);
  const updated = recent.find(e => e.id === saved.id);
  expect(updated?.tokens?.input_tokens).toBe(100);
  expect(updated?.tokens?.total_tokens).toBe(150);
});
