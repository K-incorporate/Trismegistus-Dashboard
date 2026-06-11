import { test, expect, beforeAll, afterAll } from "bun:test";

let proc: ReturnType<typeof Bun.spawn>;
const PORT = 4123;

beforeAll(async () => {
  proc = Bun.spawn(["bun", "src/index.ts"], {
    cwd: import.meta.dir + "/..",
    env: { ...process.env, SERVER_PORT: String(PORT), OBS_DB_PATH: ":memory:" },
    stdout: "ignore",
    stderr: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/events/recent`);
      break;
    } catch {
      await Bun.sleep(100);
    }
  }
});

afterAll(() => proc.kill());

test("POST /events stores and GET /events/recent returns it", async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_app: "trismegistus-dashboard",
      session_id: "s1",
      hook_event_type: "PreToolUse",
      payload: { tool_name: "Bash" },
    }),
  });
  expect(res.ok).toBe(true);
  const recent = await (await fetch(`http://127.0.0.1:${PORT}/events/recent?limit=10`)).json() as unknown[];
  expect((recent.at(-1) as Record<string,unknown>)?.hook_event_type).toBe("PreToolUse");
});

test("WS /stream sends initial snapshot then live event", async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/stream`);
  const got: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), 5000);
    ws.onmessage = (e) => {
      got.push((JSON.parse(e.data as string) as Record<string, unknown>).type as string);
      if (got.length >= 2) { clearTimeout(t); resolve(); }
    };
    ws.onopen = () => {
      void fetch(`http://127.0.0.1:${PORT}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_app: "x", session_id: "s2", hook_event_type: "Stop", payload: {} }),
      });
    };
  });
  expect(got[0]).toBe("initial");
  expect(got).toContain("event");
  ws.close();
});
