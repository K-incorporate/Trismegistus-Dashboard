# Observability Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an **Observability** tab to the Trismegistus (Hermes Agent) React dashboard at full feature parity with disler's upstream Vue client, backed by a faithfully-copied Bun + SQLite event server, with this repo's Claude Code hooks emitting events — including first-class multi-agent swim-lanes and per-agent token/cost rollups.

**Architecture:** Three subsystems. (1) A standalone Bun event server in `observability/server/` (outside `src/` so the dashboard's `tsc -b` never compiles `bun:sqlite`) — HTTP + WebSocket, SQLite (WAL), plus a server-side transcript-enrichment module for token/cost. (2) Project-level `.claude/` Python hooks (copied from upstream, patched for Windows/utf-8, source-app, summaries-off) that POST events. (3) A React module `src/observability/` (Vue→React port of 13 components + 8 composables + a canvas chart), registered as a built-in tab via two additive lines in `src/App.tsx`, talking to the Bun server directly (`VITE_OBSERVABILITY_SERVER_URL`, default `http://localhost:4000`) with an optional vite `/obs` proxy for HTTPS.

**Tech Stack:** Bun + `bun:sqlite` + `bun test` (server); Python 3.11 + `uv` single-file scripts (hooks); React 19 + Vite 7 + TypeScript (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`) + Tailwind 4 + `@nous-research/ui` (client). Canvas 2D for the pulse chart. Reference clone (read-only, NOT committed): `C:\Users\Ivonne\AppData\Local\Temp\cc-obs-ref`.

---

## How to use this plan

**Spec:** `docs/superpowers/specs/2026-06-09-observability-tab-design.md` is the source of truth; this plan implements it.

**Verification — there is NO test runner in the dashboard** (per `CLAUDE.md`). Verification differs per subsystem and is NOT an invented test command:

- **Server (`observability/server/`):** Bun has a built-in runner. Real TDD applies — `bun test`. Run from `observability/server/`.
- **Hooks (`.claude/`):** Verify by piping a synthetic hook JSON into the script and asserting a row lands in `events.db` + a frame arrives on `WS /stream`.
- **Dashboard (`src/observability/`):** Verify with the repo's real gate, run from the project root:
  - `npx tsc --noEmit` (fast type-only; catches `verbatimModuleSyntax`/`erasableSyntaxOnly` violations)
  - `npm run lint`
  - `npm run build` (`tsc -b && vite build` — authoritative)
  - Plus the per-task **runtime check** against a running server (`npm run dev` with the obs server up).
  These four are written as `**Verify (dashboard)**` below; a dashboard change is *verified* only when tsc + lint + build pass clean.

**Porting convention (not placeholders):** For mechanical Vue→React component ports, each task names the exact upstream `.vue` file to read, gives the complete React props/state interface and the exact DOM/Tailwind structure to produce, and inlines complete code for every non-obvious behavior (timers, portals, rAF/observer cleanup, optimistic HITL). "Port upstream X.vue to this contract" + the inlined critical code is concrete and executable. Read the referenced upstream file before writing each component.

**Reference paths (read-only upstream):**
- Server: `…\cc-obs-ref\apps\server\{index.ts, src\index.ts, src\db.ts, src\types.ts, src\theme.ts, package.json, tsconfig.json}`
- Hooks: `…\cc-obs-ref\.claude\hooks\**`, `…\cc-obs-ref\.claude\settings.json`
- Client: `…\cc-obs-ref\apps\client\src\{App.vue, components\*.vue, composables\*.ts, utils\chartRenderer.ts, types.ts, types\theme.ts, config.ts, styles\themes.css}`

**Conventions to honor (from `CLAUDE.md`):** import via `@/` alias; type-only imports use `import type`; no `enum`/`namespace`/param-properties; reach the *Hermes* backend only via `src/lib/api.ts` (the obs server is a *separate* origin — do NOT route it through `fetchJSON`); UI primitives from `@nous-research/ui`; no comments unless the WHY is non-obvious; commit messages concise (WHY not WHAT); no "Co-authored-by".

**Parallelization note (user preference — fan out whenever it speeds things up):** Tasks within a phase that touch disjoint files can be dispatched to parallel subagents. Safe parallel batches are flagged **[PARALLEL-SAFE: group N]**. Tasks that edit a shared file (`src/App.tsx`, `vite.config.ts`, `ObservabilityPage.tsx`, the server `index.ts`) must be serialized. When running parallel subagents that mutate files, give each its own file set; never two agents on one file.

---

## Codex review corrections (AUTHORITATIVE — read before executing any task)

A non-author Codex (gpt-5.x) reviewed this plan on 2026-06-09. The corrections below **override the task bodies** wherever they conflict. The orchestrator MUST pass the relevant correction(s) to each task's subagent. MUST-FIX items are correctness bugs in the original task text.

**C1 — Real agent identity (MUST-FIX; blocks Phase 6/7).** `${source_app}:${session_id.slice(0,8)}` collapses subagents that share a session. Add `src/observability/lib/agent.ts` as a **new Task 3.3b** (before any UI), and use it everywhere the plan says that key — `useChartData` (5.1), `AgentSwimLane` (6.1), timeline pills (4.4), toasts (4.7), token rollups (7.1):

```ts
import type { HookEvent } from "./types";
/** Stable per-agent identity: real agent_id when present, else app:session-prefix. */
export function getAgentKey(e: HookEvent): string {
  if (e.agent_id) return `${e.source_app}:agent:${e.agent_id}`;
  return `${e.source_app}:${e.session_id.slice(0, 8)}`;
}
export function matchesAgentKey(e: HookEvent, key: string): boolean {
  return getAgentKey(e) === key;
}
/** Transcript path for token enrichment / chat. */
export function getEventTranscriptPath(e: HookEvent): string | undefined {
  if (e.agent_transcript_path) return e.agent_transcript_path;
  const tp = (e.payload as Record<string, unknown>)?.transcript_path;
  return typeof tp === "string" ? tp : undefined;
}
```

**C2 — Async, bounded token enrichment (MUST-FIX; Task 1.7).** Do NOT await enrichment before insert/broadcast, and do NOT parse `payload.transcript_path` for every event. Insert + broadcast immediately; then, only for **terminal lifecycle events** (`SubagentStop`, `Stop`, `SessionEnd`), enrich in the background, update the row, and re-broadcast. Dedupe by transcript path (parse each at most once). Replace the 1.7 Step-3 snippet with:

```ts
const TERMINAL = new Set(["SubagentStop", "Stop", "SessionEnd"]);
const enrichedPaths = new Set<string>(); // dedupe per server lifetime

// inside POST /events, AFTER insertEvent(event) + broadcast + building the response:
if (TERMINAL.has(event.hook_event_type) && savedEvent.id != null) {
  const tp = savedEvent.agent_transcript_path
    ?? (typeof savedEvent.payload?.transcript_path === "string" ? savedEvent.payload.transcript_path : undefined);
  if (tp && !enrichedPaths.has(tp)) {
    enrichedPaths.add(tp);
    void (async () => {
      const usage = await parseTranscriptUsage(tp);      // never throws
      if (!usage) return;
      updateEventTokens(savedEvent.id!, usage);           // new db.ts helper (Task 1.3)
      const msg = JSON.stringify({ type: "event", data: { ...savedEvent, tokens: usage } });
      wsClients.forEach((c) => { try { c.send(msg); } catch { wsClients.delete(c); } });
    })();
  }
}
```
Add `updateEventTokens(id, tokens)` to `db.ts` (writes the token columns by id). Combine with **C4** (client upserts by id) so the follow-up broadcast replaces the row, not duplicates it.

**C3 — `useChartData` reactivity (MUST-FIX; Task 5.1).** Refs don't trigger renders. Keep `allEvents`/`eventBuffer`/`debounceTimer` as refs for buffering, but add `const [version, setVersion] = useState(0)` and `setVersion(v => v + 1)` whenever the buffer flushes, data is cleaned, or `clearData()` runs. Every derived `useMemo` (`uniqueAgentIdsInWindow`, `allUniqueAgentIds`, `uniqueAgentCount`, `toolCallCount`, `eventTimingMetrics`, and `getChartData()`'s result) depends on `[version, timeRange]`.

**C4 — StrictMode-safe WebSocket + upsert (MUST-FIX; Task 3.5).** Guard reconnect by socket identity; clear handlers before close:

```ts
ws.onclose = () => {
  setIsConnected(false);
  if (closedByUs.current || wsRef.current !== ws) return; // not the active socket
  reconnectRef.current = setTimeout(connect, 3000);
};
// cleanup:
return () => {
  closedByUs.current = true;
  if (reconnectRef.current) clearTimeout(reconnectRef.current);
  const ws = wsRef.current;
  if (ws) { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; ws.close(); }
  wsRef.current = null;
};
```
Make the `'event'` handler **upsert by id**: if an event with the same `id` exists, replace it; else append (respecting `OBS_MAX_EVENTS`). (Required by C2's re-broadcast.)

**C5 — Canvas cleanup (MUST-FIX; Tasks 5.1, 6.1).** Store the **repeating render-loop** rAF id in a ref and cancel it on unmount (not only the pulse rAF). Track pulse animations in a `Set<number>` (or cancel the prior before starting a new one) so overlapping pulses don't leak. Add a `mountedRef` flag checked inside the render loop; null `rendererRef.current` on cleanup.

**C6 — `ChartRenderer.setConfig()` for live theme (Task 5.1).** The renderer caches colors at construction, so a MutationObserver that only calls `render()` draws stale axis/text colors. Add `setConfig(config: ChartConfig)`; in the theme observer: re-read `getActiveConfig()` → `renderer.setConfig(cfg)` → `render()`. Observe **both** `class` and `style` attributes.

**C7 — CSS scoping precision (Task 3.4).** Theme-state classes are **same-element** (`.obs-root.theme-dark { … }`); utility classes are **descendant** (`.obs-root .theme-bg-primary { … }`). Don't conflate. In ported obs components consume `var(--theme-*)` / the `.theme-*` utilities — not the dashboard's own tokens (`text-text-primary`, `text-success`) where an obs theme var is intended. (The 3.6 minimal shell may keep dashboard tokens; parity components use obs vars.)

**C8 — ESLint must ignore the Bun server (MUST-FIX; Task 1.1).** `eslint .` from root would lint `observability/server/**` with browser/React rules and fail on Bun globals + upstream `any`. In Task 1.1, edit `eslint.config.js` to add `observability/server` to the flat-config `ignores`; confirm `npm run lint` skips it.

**C9 — UTF-8 catch-all (Tasks 2.2, 2.3).** `PYTHONIOENCODING` only covers stdio. Add `"PYTHONUTF8": "1"` to the settings `env` block (forces UTF-8 file I/O) in addition to patching the known transcript `open()` calls — covers `session_end.py`/`subagent_start.py`/etc.

**C10 — Consistent loopback (Tasks 1.6, 3.2, 2.3, tests).** Server binds `127.0.0.1` but defaults use `localhost` (Windows may resolve `::1` first → refused). Default everything to `127.0.0.1`: `config.ts` → `http://127.0.0.1:4000`; pass `--server-url http://127.0.0.1:4000/events` to `send_event.py` in settings.json; `/obs` proxy target → `http://127.0.0.1:4000`.

**C11 — Hoist + derive `parent_session_id` (Task 2.2).** Add `parent_session_id` to the `send_event.py` hoist list. If Claude doesn't supply it on subagent events, derive it (a subagent's parent = the invoking session id) and document the derivation.

**C12 — Verify the real hook path on Windows (Task 2.4).** Keep the direct `uv run send_event.py` unit check, but ADD: trigger an actual Claude Code `Write`/`Edit` and confirm (a) `$CLAUDE_PROJECT_DIR` expanded, (b) BOTH `PostToolUse` matcher blocks ran (lint hook AND obs hook), (c) events landed with `source_app trismegistus-dashboard`.

**C13 — Reorder: chat modal before EventRow (Phase 4).** `EventRow` (4.3) renders `ChatTranscriptModal` (currently 5.2) → Phase 4 won't build. Move `ChatTranscript` + `ChatTranscriptModal` to a new **Task 4.2b** (before EventRow). Phase 5 then contains only the pulse chart.

**C14 — Derive subagent timestamps/duration/status (Phase 7; spec §4.4).** Don't add columns; derive per-agent start/stop/duration/status in the UI from the `SubagentStart`/`SubagentStop` pair (matched via `getAgentKey`). Document this; add columns only if derivation is insufficient.

**C15 — Tailwind `mobile:`/`short:` variants (port convention).** Upstream uses custom breakpoints this dashboard doesn't define. Map them to real Tailwind breakpoints (`max-lg:`/`sm:`) or drive conditional rendering from `useObsMediaQuery().isMobile`. Don't copy the variant names verbatim.

**C16 — ThemeManager scope (Task 6.2).** Ship **predefined-theme switching only** for v1; the create/import/export form is **explicitly deferred** (server `/api/themes` CRUD stays available; matches spec §11). Remove the vague "optional create-form".

**C17 — Final gate additions (Task 8.2; + Task 0.4/1.1).** Add `cd observability/server && bun run typecheck` to the gate. **Commit** the Bun lockfile (remove `observability/server/bun.lockb` from `.gitignore` in 0.4; bun may emit `bun.lock`). Add a browser leak checklist: enter Observability → leave → re-enter ×3, confirm no console errors and CPU returns to idle.

---

## Phase 0: Git baseline & branch

**Files:**
- Create: `.gitignore` entries (project root `.gitignore` already exists — append)
- Modify: repo git state (zero commits currently; entire scaffold is untracked)

- [ ] **Step 1: Confirm git state**

Run: `git -C "C:\Users\Ivonne\Documents\Coding\Trismegistus-Dashboard" status --porcelain=v1 --branch`
Expected: branch `main`, no commits yet, all scaffold files untracked (`??`).

- [ ] **Step 2: Establish a baseline commit on `main`** (the existing dashboard scaffold is untracked; we need a base to branch from)

```bash
git add -A
git commit -m "chore: baseline dashboard scaffold"
```
Expected: one commit on `main` containing the current scaffold. (This touches `main`; it is the repo's first commit and is required to branch. Per user git rules, do this once at kickoff.)

- [ ] **Step 3: Create the feature branch — all subsequent work lands here**

```bash
git checkout -b feat/observability-tab
```
Expected: `Switched to a new branch 'feat/observability-tab'`. `main` stays clean from here on.

- [ ] **Step 4: Append ignore rules** to the project-root `.gitignore`

Add these lines (the event DB, server deps, and obs env are never committed):

```gitignore
# Observability event server
observability/server/node_modules/
observability/server/events.db
observability/server/events.db-shm
observability/server/events.db-wal
observability/server/bun.lockb
# Hook runtime logs
logs/
.claude/data/
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore obs server db, deps, and hook logs"
```

---

## Phase 1: Bun event server (copy + §4.4 schema) — TDD with `bun test`

The server is a near-verbatim copy of upstream `apps/server`. Differences: (a) the events table gains §4.4 columns (`agent_id`, `parent_session_id`, `agent_transcript_path`, token/cost columns); (b) `insertEvent`/`getRecentEvents`/`updateEventHITLResponse` read/write those columns; (c) a `bun test` suite; (d) the vestigial `sqlite`/`sqlite3` npm deps are dropped (the server uses `bun:sqlite`).

**Files (all under `observability/server/`):**
- Create: `package.json`, `tsconfig.json`
- Create: `src/types.ts`, `src/db.ts`, `src/theme.ts`, `src/index.ts`, `src/enrichment.ts`
- Test: `tests/db.test.ts`, `tests/enrichment.test.ts`, `tests/server.test.ts`

### Task 1.1: Server package scaffold

- [ ] **Step 1: Create `observability/server/package.json`**

```json
{
  "name": "trismegistus-observability-server",
  "version": "1.0.0",
  "module": "src/index.ts",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create `observability/server/tsconfig.json`** (copy upstream `apps/server/tsconfig.json` verbatim — Bun-targeted, bundler resolution). Read `…\cc-obs-ref\apps\server\tsconfig.json` and reproduce it. It must include `"types": ["bun-types"]` (or `@types/bun`) and `"moduleResolution": "bundler"`, `"strict": true`.

- [ ] **Step 3: Install deps**

Run (from `observability/server/`): `bun install`
Expected: `node_modules/` created, `@types/bun` + `typescript` resolved. No `sqlite`/`sqlite3` (we use `bun:sqlite`).

- [ ] **Step 4: Commit**

```bash
git add observability/server/package.json observability/server/tsconfig.json
git commit -m "feat(obs-server): scaffold Bun server package"
```

### Task 1.2: Types (with §4.4 fields)

- [ ] **Step 1: Create `observability/server/src/types.ts`**

Copy upstream `apps/server/src/types.ts` verbatim (HITL interfaces, `HookEvent`, `FilterOptions`, `Theme`/`ThemeColors`/`ThemeSearchQuery`/`ThemeShare`/`ThemeRating`/`ApiResponse`), then extend `HookEvent` with the §4.4 optional fields. The resulting `HookEvent`:

```ts
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
```

Keep `HumanInTheLoop`, `HumanInTheLoopResponse`, `HumanInTheLoopStatus`, `FilterOptions`, all theme interfaces, and `ApiResponse<T>` exactly as upstream.

- [ ] **Step 2: Commit**

```bash
git add observability/server/src/types.ts
git commit -m "feat(obs-server): port event/theme types + §4.4 agent/token fields"
```

### Task 1.3: DB layer — failing test first

- [ ] **Step 1: Write the failing test `observability/server/tests/db.test.ts`**

```ts
import { test, expect, beforeEach } from "bun:test";
import { initDatabase, insertEvent, getRecentEvents, getFilterOptions, db } from "../src/db";

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
```

- [ ] **Step 2: Run it to confirm it fails**

Run (from `observability/server/`): `bun test tests/db.test.ts`
Expected: FAIL — `Cannot find module '../src/db'`.

- [ ] **Step 3: Implement `observability/server/src/db.ts`**

Start from upstream `apps/server/src/db.ts` verbatim, then make these exact changes:
1. **DB path from env:** `db = new Database(process.env.OBS_DB_PATH || 'events.db');` (enables `:memory:` in tests).
2. **Extend the `CREATE TABLE events`** with the §4.4 columns and add idempotent `ALTER TABLE` migrations (same defensive pattern upstream uses for `chat`/`summary`/`model_name`). New columns: `agent_id TEXT`, `agent_type TEXT`, `parent_session_id TEXT`, `agent_transcript_path TEXT`, `input_tokens INTEGER`, `output_tokens INTEGER`, `cache_creation_tokens INTEGER`, `cache_read_tokens INTEGER`, `total_tokens INTEGER`, `cost REAL`.
3. **Add indexes:** `idx_agent_id ON events(agent_id)`, `idx_parent_session_id ON events(parent_session_id)`.
4. **`insertEvent`:** extend the INSERT column list + bound params to persist the new fields. Map `event.tokens?.input_tokens` etc. to the flat columns (null when absent). Return the saved event including `tokens` reconstructed.
5. **`getRecentEvents` + `updateEventHITLResponse`:** extend the SELECT column list and the row→object mapping to hydrate `agent_id`, `agent_type`, `parent_session_id`, `agent_transcript_path`, and a `tokens` object (built from the flat columns; omit if all null).
6. Keep all theme functions (`insertTheme`/`updateTheme`/`getTheme`/`getThemes`/`deleteTheme`/`incrementThemeDownloadCount`) verbatim, and the `export { db }` at the end.

Helper to include in `db.ts` for the token mapping (used by insert + select):

```ts
import type { AgentTokenUsage } from "./types";

function tokensToColumns(t?: AgentTokenUsage) {
  return {
    input_tokens: t?.input_tokens ?? null,
    output_tokens: t?.output_tokens ?? null,
    cache_creation_tokens: t?.cache_creation_tokens ?? null,
    cache_read_tokens: t?.cache_read_tokens ?? null,
    total_tokens: t?.total_tokens ?? null,
    cost: t?.cost ?? null,
  };
}
function columnsToTokens(row: Record<string, unknown>): AgentTokenUsage | undefined {
  const keys = ["input_tokens","output_tokens","cache_creation_tokens","cache_read_tokens","total_tokens","cost"] as const;
  if (keys.every((k) => row[k] == null)) return undefined;
  const t: AgentTokenUsage = {};
  for (const k of keys) if (row[k] != null) (t as Record<string, number>)[k] = row[k] as number;
  return t;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bun test tests/db.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add observability/server/src/db.ts observability/server/tests/db.test.ts
git commit -m "feat(obs-server): SQLite layer with §4.4 agent/token columns"
```

### Task 1.4: Theme module (copy verbatim)

- [ ] **Step 1: Create `observability/server/src/theme.ts`** — copy upstream `apps/server/src/theme.ts` verbatim. Exports `createTheme`, `updateThemeById`, `getThemeById`, `searchThemes`, `deleteThemeById`, `exportThemeById`, `importTheme`, `getThemeStats`. No changes (persists only user-created themes; predefined themes live client-side).

- [ ] **Step 2: Typecheck** — `bunx tsc --noEmit` → no errors.

- [ ] **Step 3: Commit**

```bash
git add observability/server/src/theme.ts
git commit -m "feat(obs-server): port theme CRUD module"
```

### Task 1.5: Token/cost enrichment module — failing test first (§4.4)

Parses a Claude Code transcript `.jsonl` and sums token usage; invoked server-side on ingest (Task 1.7), never in the hook.

- [ ] **Step 1: Write `observability/server/tests/enrichment.test.ts`**

```ts
import { test, expect } from "bun:test";
import { parseTranscriptUsage, estimateCost } from "../src/enrichment";

test("parseTranscriptUsage sums assistant usage blocks", async () => {
  const path = `${import.meta.dir}/fixtures/transcript.jsonl`;
  await Bun.write(path, [
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 10 } } }),
    JSON.stringify({ type: "user", message: { content: "hi" } }),
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 50, output_tokens: 20 } } }),
  ].join("\n"));
  const usage = await parseTranscriptUsage(path);
  expect(usage?.input_tokens).toBe(150);
  expect(usage?.output_tokens).toBe(60);
  expect(usage?.cache_read_tokens).toBe(10);
  expect(usage?.total_tokens).toBe(220);
});

test("parseTranscriptUsage returns undefined for missing file (never throws)", async () => {
  const usage = await parseTranscriptUsage("/no/such/file.jsonl");
  expect(usage).toBeUndefined();
});

test("estimateCost is monotonic in tokens", () => {
  const a = estimateCost("claude-opus-4-8", { input_tokens: 1000, output_tokens: 1000 });
  const b = estimateCost("claude-opus-4-8", { input_tokens: 2000, output_tokens: 2000 });
  expect(b).toBeGreaterThan(a);
});
```

- [ ] **Step 2: Run it to confirm it fails** — `bun test tests/enrichment.test.ts` → FAIL (`Cannot find module '../src/enrichment'`).

- [ ] **Step 3: Implement `observability/server/src/enrichment.ts`**

```ts
import type { AgentTokenUsage } from "./types";

// Per-1M-token USD rates; coarse defaults. Unknown models fall back to OPUS.
const RATES: Record<string, { in: number; out: number; cacheRead: number }> = {
  "claude-opus-4-8": { in: 15, out: 75, cacheRead: 1.5 },
  "claude-sonnet-4-6": { in: 3, out: 15, cacheRead: 0.3 },
  "claude-haiku-4-5": { in: 1, out: 5, cacheRead: 0.1 },
};
function rateFor(model: string) {
  const key = Object.keys(RATES).find((k) => model.includes(k));
  return RATES[key ?? "claude-opus-4-8"];
}

export function estimateCost(model: string, t: AgentTokenUsage): number {
  const r = rateFor(model || "");
  const input = (t.input_tokens ?? 0) / 1_000_000;
  const output = (t.output_tokens ?? 0) / 1_000_000;
  const cacheRead = (t.cache_read_tokens ?? 0) / 1_000_000;
  return input * r.in + output * r.out + cacheRead * r.cacheRead;
}

// Parse a Claude Code transcript .jsonl and sum usage across assistant turns.
// Never throws: returns undefined on any read/parse failure or empty input.
export async function parseTranscriptUsage(transcriptPath: string): Promise<AgentTokenUsage | undefined> {
  let text: string;
  try {
    const file = Bun.file(transcriptPath);
    if (!(await file.exists())) return undefined;
    text = await file.text();
  } catch {
    return undefined;
  }
  let input = 0, output = 0, cacheCreate = 0, cacheRead = 0, sawAny = false, model = "";
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as Record<string, any>;
      const usage = entry?.message?.usage;
      if (entry?.type === "assistant" && usage) {
        sawAny = true;
        input += usage.input_tokens ?? 0;
        output += usage.output_tokens ?? 0;
        cacheCreate += usage.cache_creation_input_tokens ?? 0;
        cacheRead += usage.cache_read_input_tokens ?? 0;
        if (entry?.message?.model) model = entry.message.model;
      }
    } catch {
      // tolerate malformed lines
    }
  }
  if (!sawAny) return undefined;
  const total = input + output + cacheCreate + cacheRead;
  const usage: AgentTokenUsage = {
    input_tokens: input, output_tokens: output,
    cache_creation_tokens: cacheCreate, cache_read_tokens: cacheRead,
    total_tokens: total,
  };
  usage.cost = estimateCost(model, usage);
  return usage;
}
```

- [ ] **Step 4: Run the test to confirm it passes** — `bun test tests/enrichment.test.ts` → PASS (3 tests; the test writes its own fixture under `tests/fixtures/`).

- [ ] **Step 5: Commit**

```bash
git add observability/server/src/enrichment.ts observability/server/tests/enrichment.test.ts
git commit -m "feat(obs-server): transcript token/cost enrichment (§4.4)"
```

### Task 1.6: HTTP + WS server (copy + localhost bind)

- [ ] **Step 1: Create `observability/server/src/index.ts`** — copy upstream `apps/server/src/index.ts` verbatim (CORS, `POST /events`, `GET /events/recent`, `GET /events/filter-options`, `POST /events/:id/respond`, all `/api/themes*` routes, `WS /stream` with `{type:'initial'}` on open + `{type:'event'}` broadcast, the `sendResponseToAgent` HITL helper). Changes: keep `port: parseInt(process.env.SERVER_PORT || '4000')`; add `hostname: '127.0.0.1'` (spec §10). (Enrichment wires in 1.7.)

- [ ] **Step 2: Smoke-run** — PowerShell `$env:OBS_DB_PATH=":memory:"; bun run start` → logs `🚀 Server running on http://localhost:4000`. Stop (Ctrl-C).

- [ ] **Step 3: Commit**

```bash
git add observability/server/src/index.ts
git commit -m "feat(obs-server): HTTP + WS server, localhost-bound"
```

### Task 1.7: Wire enrichment into ingest + server test

- [ ] **Step 1: Write the failing test `observability/server/tests/server.test.ts`**

```ts
import { test, expect, beforeAll, afterAll } from "bun:test";

let proc: ReturnType<typeof Bun.spawn>;
const PORT = 4123;

beforeAll(async () => {
  proc = Bun.spawn(["bun", "src/index.ts"], {
    cwd: import.meta.dir + "/..",
    env: { ...process.env, SERVER_PORT: String(PORT), OBS_DB_PATH: ":memory:" },
    stdout: "ignore", stderr: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://localhost:${PORT}/events/recent`); break; } catch { await Bun.sleep(100); }
  }
});
afterAll(() => proc.kill());

test("POST /events stores and GET /events/recent returns it", async () => {
  const res = await fetch(`http://localhost:${PORT}/events`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_app: "trismegistus-dashboard", session_id: "s1", hook_event_type: "PreToolUse", payload: { tool_name: "Bash" } }),
  });
  expect(res.ok).toBe(true);
  const recent = await (await fetch(`http://localhost:${PORT}/events/recent?limit=10`)).json();
  expect(recent.at(-1).hook_event_type).toBe("PreToolUse");
});

test("WS /stream sends initial snapshot then live event", async () => {
  const ws = new WebSocket(`ws://localhost:${PORT}/stream`);
  const got: string[] = [];
  await new Promise<void>((resolve) => {
    ws.onmessage = (e) => { got.push(JSON.parse(e.data).type); if (got.length >= 2) resolve(); };
    ws.onopen = () => {
      fetch(`http://localhost:${PORT}/events`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_app: "x", session_id: "s2", hook_event_type: "Stop", payload: {} }) });
    };
  });
  expect(got[0]).toBe("initial");
  expect(got).toContain("event");
  ws.close();
});
```

- [ ] **Step 2: Run it** — `bun test tests/server.test.ts` → PASS (server already copied). If `POST /events` 400s, verify required-field validation matches the payload.

- [ ] **Step 3: Wire enrichment in `src/index.ts`** — in the `POST /events` handler, after parsing `event` and before `insertEvent(event)`:

```ts
// §4.4 — enrich with token/cost from the agent's transcript when available.
if (!event.tokens) {
  const tp = event.agent_transcript_path
    || (typeof event.payload?.transcript_path === "string" ? event.payload.transcript_path : undefined);
  if (tp) {
    const usage = await parseTranscriptUsage(tp);
    if (usage) event.tokens = usage;
  }
}
```
Add `import { parseTranscriptUsage } from './enrichment';` at the top. (Best-effort, never throws → cannot block ingest beyond the file read.)

- [ ] **Step 4: Re-run the full server suite** — `bun test` → PASS (db, enrichment, server).

- [ ] **Step 5: Commit**

```bash
git add observability/server/src/index.ts observability/server/tests/server.test.ts
git commit -m "feat(obs-server): enrich events with token/cost on ingest (§4.4)"
```

---

## Phase 2: `.claude/` hooks (copy + patch) — emit verified events

Copy upstream `.claude/hooks/**` faithfully, patch for this repo, and wire all 12 events in `.claude/settings.json`. **Note:** `.claude/settings.json` already exists here (the lint-on-edit hook from `/init`) — **merge**, don't overwrite.

**Files:**
- Create: `.claude/hooks/send_event.py`, the 12 event scripts, `.claude/hooks/utils/**`
- Modify: `.claude/settings.json`

### Task 2.1: Copy the hook tree

- [ ] **Step 1: Copy `.claude/hooks/**` from upstream**: `send_event.py`; 12 event scripts (`pre_tool_use.py`, `post_tool_use.py`, `post_tool_use_failure.py`, `permission_request.py`, `notification.py`, `user_prompt_submit.py`, `stop.py`, `subagent_start.py`, `subagent_stop.py`, `pre_compact.py`, `session_start.py`, `session_end.py`); `utils/` (`constants.py`, `model_extractor.py`, `summarizer.py`, `llm/anth.py`, `llm/oai.py`, `tts/*.py`).
  PowerShell: `Copy-Item -Recurse "C:\Users\Ivonne\AppData\Local\Temp\cc-obs-ref\.claude\hooks" "C:\Users\Ivonne\Documents\Coding\Trismegistus-Dashboard\.claude\hooks"`

- [ ] **Step 2: Commit the unpatched copy**

```bash
git add .claude/hooks
git commit -m "feat(hooks): copy upstream observability hook scripts (pre-patch)"
```

### Task 2.2: Patch for this repo (Windows utf-8, light hot path)

- [ ] **Step 1: utf-8 on every transcript/log `open()`** — in `send_event.py`, `utils/model_extractor.py`, `stop.py`, `subagent_stop.py`: change each `open(path, 'r')` reading a transcript/log to `open(path, 'r', encoding='utf-8')`.

- [ ] **Step 2: Lighten `send_event.py`'s hot path** — remove `anthropic` from its uv inline `# dependencies = [...]` (only used under `--summarize`, which we never pass) and move `from utils.summarizer import generate_event_summary` inside the `if args.summarize:` branch. Header becomes:
  ```python
  # dependencies = [
  #     "python-dotenv",
  # ]
  ```

- [ ] **Step 3: §4.4 hoist check** — verify `send_event.py` hoists `agent_id`, `agent_type`, `agent_transcript_path` from payload to top-level POST fields; add any missing.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/send_event.py .claude/hooks/utils/model_extractor.py .claude/hooks/stop.py .claude/hooks/subagent_stop.py
git commit -m "fix(hooks): utf-8 reads, drop anthropic from hot path, hoist agent fields"
```

### Task 2.3: Wire all 12 events into `.claude/settings.json` (merge)

- [ ] **Step 1: Read** the existing `.claude/settings.json` (lint hook) + upstream `.claude/settings.json` (wiring template).

- [ ] **Step 2: Merge the 12-event wiring**, preserving the existing lint hook. `--source-app trismegistus-dashboard`, **NO `--summarize`**, add `PYTHONIOENCODING=utf-8`:

```json
{
  "env": { "PYTHONIOENCODING": "utf-8" },
  "hooks": {
    "PreToolUse": [
      { "matcher": "", "hooks": [
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre_tool_use.py\"" },
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/send_event.py\" --source-app trismegistus-dashboard --event-type PreToolUse" }
      ]}
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit", "hooks": [
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/lint-changed.mjs\"", "timeout": 60, "statusMessage": "Linting changed file..." }
      ]},
      { "matcher": "", "hooks": [
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/post_tool_use.py\"" },
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/send_event.py\" --source-app trismegistus-dashboard --event-type PostToolUse" }
      ]}
    ],
    "PostToolUseFailure": [
      { "matcher": "", "hooks": [
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/post_tool_use_failure.py\"" },
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/send_event.py\" --source-app trismegistus-dashboard --event-type PostToolUseFailure" }
      ]}
    ],
    "PermissionRequest": [
      { "matcher": "", "hooks": [
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/permission_request.py\"" },
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/send_event.py\" --source-app trismegistus-dashboard --event-type PermissionRequest" }
      ]}
    ],
    "Notification": [
      { "hooks": [
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/notification.py\"" },
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/send_event.py\" --source-app trismegistus-dashboard --event-type Notification" }
      ]}
    ],
    "UserPromptSubmit": [
      { "hooks": [
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/user_prompt_submit.py\" --log-only" },
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/send_event.py\" --source-app trismegistus-dashboard --event-type UserPromptSubmit" }
      ]}
    ],
    "Stop": [
      { "hooks": [
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/stop.py\" --chat" },
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/send_event.py\" --source-app trismegistus-dashboard --event-type Stop --add-chat" }
      ]}
    ],
    "SubagentStart": [
      { "matcher": "", "hooks": [
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/subagent_start.py\"" },
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/send_event.py\" --source-app trismegistus-dashboard --event-type SubagentStart" }
      ]}
    ],
    "SubagentStop": [
      { "hooks": [
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/subagent_stop.py\"" },
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/send_event.py\" --source-app trismegistus-dashboard --event-type SubagentStop" }
      ]}
    ],
    "PreCompact": [
      { "hooks": [
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre_compact.py\"" },
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/send_event.py\" --source-app trismegistus-dashboard --event-type PreCompact" }
      ]}
    ],
    "SessionStart": [
      { "hooks": [
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/session_start.py\"" },
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/send_event.py\" --source-app trismegistus-dashboard --event-type SessionStart" }
      ]}
    ],
    "SessionEnd": [
      { "hooks": [
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/session_end.py\"" },
        { "type": "command", "command": "uv run \"$CLAUDE_PROJECT_DIR/.claude/hooks/send_event.py\" --source-app trismegistus-dashboard --event-type SessionEnd" }
      ]}
    ]
  }
}
```

> Windows note: Claude Code expands `$CLAUDE_PROJECT_DIR` itself in hook commands (not via shell), so POSIX-style `$VAR` works on Windows. `uv` must be on PATH. If it ever fails to expand, fall back to absolute paths.

- [ ] **Step 3: Validate JSON** — `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('ok')"` → `ok`.

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(hooks): wire 12 observability events (summaries off, utf-8)"
```

### Task 2.4: End-to-end hook → server verification

- [ ] **Step 1: Start the server** — from `observability/server/`, `bun run start` (real `events.db`).
- [ ] **Step 2: Simulate an event** (PowerShell):
```powershell
'{ "session_id": "verify-1", "transcript_path": "", "tool_name": "Bash", "tool_input": {"command":"ls"} }' | uv run .\.claude\hooks\send_event.py --source-app trismegistus-dashboard --event-type PreToolUse
```
Expected: exit 0, no error.
- [ ] **Step 3: Confirm the row** — `curl http://localhost:4000/events/recent?limit=5` → event with `source_app: "trismegistus-dashboard"`, `hook_event_type: "PreToolUse"`, `session_id: "verify-1"`.
- [ ] **Step 4: Confirm `events.db`** exists (+ `-wal`/`-shm`).
- [ ] **Step 5: (Verification only — no commit.)** If absent: check `uv` on PATH, port 4000, `send_event.py --server-url` default.

---

## Phase 3: Client foundation — types, config, theme scaffold, WS hook, registration

All files under `src/observability/` unless noted, imported via `@/observability/...`. Verification in Phases 3–7 = **Verify (dashboard)** = `npx tsc --noEmit && npm run lint && npm run build`, plus the noted runtime check.

### Task 3.1: Client types

**Files:** Create `src/observability/lib/types.ts`

- [ ] **Step 1: Create it** — strict port of server `types.ts` + chart types. `payload: Record<string, unknown>`. Include `HumanInTheLoop*`, `AgentTokenUsage`, `HookEvent` (§4.4 fields mirroring the server), `FilterOptions`, `WebSocketMessage` (`{ type: 'initial'|'event'; data: HookEvent | HookEvent[] }`), `TimeRange='1m'|'3m'|'5m'|'10m'`, `ChartDataPoint`, `ChartConfig`, `ChartDimensions`, `export interface ObsFilters { sourceApp: string; sessionId: string; eventType: string }`.
- [ ] **Step 2: Commit** `feat(obs): client event/chart/filter types (strict)`.

### Task 3.2: Connection config (`VITE_OBSERVABILITY_SERVER_URL` + `/obs`)

**Files:** Create `src/observability/lib/config.ts`; Modify `vite.config.ts`

- [ ] **Step 1: Create `lib/config.ts`**

```ts
function resolveBase(): string {
  const fromEnv = import.meta.env.VITE_OBSERVABILITY_SERVER_URL as string | undefined;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim().replace(/\/+$/, "");
  return "http://localhost:4000";
}

export const OBS_SERVER_BASE = resolveBase();

/** WS URL derived from the resolved base. Relative base (e.g. "/obs") → same-origin ws(s). */
export function obsWsUrl(): string {
  if (OBS_SERVER_BASE.startsWith("/")) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${OBS_SERVER_BASE}/stream`;
  }
  return `${OBS_SERVER_BASE.replace(/^http/, "ws")}/stream`;
}

export const OBS_MAX_EVENTS = Number(import.meta.env.VITE_OBS_MAX_EVENTS ?? 300);
```

- [ ] **Step 2: Add `/obs` dev proxy to `vite.config.ts`** (serialized) — in `server.proxy`:
```ts
"/obs": { target: "http://localhost:4000", ws: true, rewrite: (p) => p.replace(/^\/obs/, "") },
```
- [ ] **Step 3: Verify (dashboard)** + commit `feat(obs): server connection config + /obs dev proxy`.

### Task 3.3: Event colors + emojis (pure modules) **[PARALLEL-SAFE: group F1]**

**Files:** Create `src/observability/lib/eventColors.ts`, `src/observability/lib/eventEmojis.ts`

- [ ] **Step 1: `eventColors.ts`** — `hashString` (seed `7151`, `((hash<<5)+hash)+charCodeAt`, `Math.abs(hash>>>0)`); 10-color `colorPalette` (`bg-blue-500 … bg-cyan-500`); `getColorForSession/App=palette[hash%10]`; `getGradientForSession/App` (`bg-X-500→from-X-500 to-X-600`, default `from-gray-500 to-gray-600`); `tailwindToHex` (blue `#3B82F6`, green `#22C55E`, yellow `#EAB308`, purple `#A855F7`, pink `#EC4899`, indigo `#6366F1`, red `#EF4444`, orange `#F97316`, teal `#14B8A6`, cyan `#06B6D4`, default `#3B82F6`); `getHexColorForSession=tailwindToHex∘getColorForSession`; `getHexColorForApp=hsl(hash%360,70%,50%)`.
- [ ] **Step 2: `eventEmojis.ts`** — `eventTypeToEmoji` (PreToolUse 🔧, PostToolUse ✅, PostToolUseFailure ❌, PermissionRequest 🔐, Notification 🔔, Stop 🛑, SubagentStart 🟢, SubagentStop 👥, PreCompact 📦, UserPromptSubmit 💬, SessionStart 🚀, SessionEnd 🏁, default ❓); `toolNameToEmoji` (Bash 💻, Read 📖, Write ✍️, Edit ✏️, MultiEdit ✏️, Glob 🔍, Grep 🔎, WebFetch 🌐, WebSearch 🔍, NotebookEdit 📓, Task 🤖, TaskCreate 📋, TaskGet 📄, TaskUpdate 📝, TaskList 📑, TaskOutput 📤, TaskStop ⏹️, TeamCreate 👥, TeamDelete 🗑️, SendMessage 💬, EnterPlanMode 🗺️, ExitPlanMode 🚪, AskUserQuestion ❓, Skill ⚡, default 🔧); `getEmojiForToolName` (exact→`mcp__` 🔌→default 🔧); `formatEventTypeLabel` top-3 algorithm.
- [ ] **Step 3: Verify (dashboard)** + commit `feat(obs): event color + emoji utilities (verbatim port)`.

### Task 3.4: Scoped theme system (CSS + provider) — prevents global theme leakage (§6)

**Files:** Create `src/observability/styles/observability-themes.css`, `src/observability/lib/themeData.ts`, `src/observability/ObservabilityThemeProvider.tsx`

- [ ] **Step 1: `styles/observability-themes.css`** — port `styles/themes.css`, **scoping every selector to `.obs-root`**: `:root{…}`→`.obs-root{…}`; `.theme-dark{…}`→`.obs-root.theme-dark{…}` (all 12). All 26 CSS vars (24 per-theme + `--theme-transition`/`--theme-transition-fast` on `.obs-root` only).
- [ ] **Step 2: `lib/themeData.ts`** — read `…\cc-obs-ref\apps\client\src\types\theme.ts`; reproduce `ThemeName` (12), `ThemeColors` (23), `CustomTheme`, `PredefinedTheme`, `ThemeState`, `CreateThemeFormData`, `ThemeImportExport`, `THEME_COLOR_KEYS`, `PREDEFINED_THEME_NAMES`, `COLOR_REGEX`, `RGBA_REGEX`, and the 12 `PREDEFINED_THEMES`.
- [ ] **Step 3: `ObservabilityThemeProvider.tsx`** — context applying theme to **both** the obs container ref and a portal-root `<div>` on `document.body`. Complete code:

```tsx
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { OBS_SERVER_BASE } from "./lib/config";
import { PREDEFINED_THEMES, type CustomTheme, type ThemeColors } from "./lib/themeData";

const LS_THEME = "obs.theme";
const THEME_CLASSES = Object.values(PREDEFINED_THEMES).map((t) => t.cssClass).concat("theme-custom");
function camelToKebab(s: string) { return s.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, "$1-$2").toLowerCase(); }

interface ObsThemeCtx {
  currentTheme: string; customThemes: CustomTheme[]; setTheme: (name: string) => void;
  portalRoot: HTMLElement | null; containerRef: React.RefObject<HTMLDivElement | null>;
  refreshCustomThemes: () => Promise<void>; saveCustomTheme: (t: CustomTheme) => Promise<void>;
}
const Ctx = createContext<ObsThemeCtx | null>(null);
export const useObsTheme = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useObsTheme must be used within ObservabilityThemeProvider");
  return v;
};

function applyTheme(el: HTMLElement | null, name: string, customThemes: CustomTheme[]) {
  if (!el) return;
  THEME_CLASSES.forEach((c) => el.classList.remove(c));
  const predef = PREDEFINED_THEMES[name as keyof typeof PREDEFINED_THEMES];
  const sample = Object.values(PREDEFINED_THEMES)[0].colors;
  if (predef) {
    el.classList.add(predef.cssClass);
    Object.keys(sample).forEach((k) => el.style.removeProperty(`--theme-${camelToKebab(k)}`));
    return;
  }
  const custom = customThemes.find((t) => t.name === name || t.id === name);
  if (custom) {
    el.classList.add("theme-custom");
    (Object.entries(custom.colors) as [keyof ThemeColors, string][]).forEach(([k, v]) =>
      el.style.setProperty(`--theme-${camelToKebab(String(k))}`, v));
  }
}

export function ObservabilityThemeProvider({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    try { return localStorage.getItem(LS_THEME) || "dark"; } catch { return "dark"; }
  });
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);

  useEffect(() => {
    const root = document.createElement("div");
    root.className = "obs-root"; root.id = "obs-portal-root";
    document.body.appendChild(root); setPortalRoot(root);
    return () => { document.body.removeChild(root); };
  }, []);

  useEffect(() => {
    applyTheme(containerRef.current, currentTheme, customThemes);
    applyTheme(portalRoot, currentTheme, customThemes);
    try { localStorage.setItem(LS_THEME, currentTheme); } catch { /* private mode */ }
  }, [currentTheme, customThemes, portalRoot]);

  const refreshCustomThemes = useMemo(() => async () => {
    try {
      const res = await fetch(`${OBS_SERVER_BASE}/api/themes?isPublic=true`);
      if (!res.ok) return;
      const body = await res.json();
      if (Array.isArray(body?.data)) setCustomThemes(body.data as CustomTheme[]);
    } catch { /* server down — keep predefined only */ }
  }, []);

  const saveCustomTheme = useMemo(() => async (t: CustomTheme) => {
    await fetch(`${OBS_SERVER_BASE}/api/themes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t),
    });
    await refreshCustomThemes();
  }, [refreshCustomThemes]);

  useEffect(() => { void refreshCustomThemes(); }, [refreshCustomThemes]);

  const value: ObsThemeCtx = {
    currentTheme, customThemes, setTheme: setCurrentTheme,
    portalRoot, containerRef, refreshCustomThemes, saveCustomTheme,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 4: Verify (dashboard)** + commit `feat(obs): container-scoped theme system + portal-root theming (§6)`.

### Task 3.5: WebSocket hook (offline-resilient)

**Files:** Create `src/observability/hooks/useObservabilityWebSocket.ts`

- [ ] **Step 1: Create it** (§5 — 3s reconnect, never crashes when `:4000` down):

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { obsWsUrl, OBS_MAX_EVENTS } from "../lib/config";
import type { HookEvent, WebSocketMessage } from "../lib/types";

export function useObservabilityWebSocket() {
  const [events, setEvents] = useState<HookEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUs = useRef(false);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(obsWsUrl());
      wsRef.current = ws;
      ws.onopen = () => { setIsConnected(true); setError(null); };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WebSocketMessage;
          if (msg.type === "initial") {
            const arr = Array.isArray(msg.data) ? (msg.data as HookEvent[]) : [];
            setEvents(arr.slice(-OBS_MAX_EVENTS));
          } else if (msg.type === "event") {
            setEvents((prev) => {
              const next = [...prev, msg.data as HookEvent];
              return next.length > OBS_MAX_EVENTS ? next.slice(next.length - OBS_MAX_EVENTS + 10) : next;
            });
          }
        } catch { /* ignore malformed frame */ }
      };
      ws.onerror = () => setError("event server offline");
      ws.onclose = () => {
        setIsConnected(false);
        if (closedByUs.current) return;
        reconnectRef.current = setTimeout(connect, 3000);
      };
    } catch {
      setError("event server offline");
      reconnectRef.current = setTimeout(connect, 3000);
    }
  }, []);

  useEffect(() => {
    closedByUs.current = false;
    connect();
    return () => {
      closedByUs.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const clearEvents = useCallback(() => setEvents([]), []);
  return { events, isConnected, error, clearEvents };
}
```

- [ ] **Step 2: Verify (dashboard)** + commit `feat(obs): offline-resilient WebSocket hook`.

### Task 3.6: Minimal page + tab registration (first on-screen milestone)

**Files:** Create `src/observability/pages/ObservabilityPage.tsx`; Modify `src/App.tsx`

- [ ] **Step 1: Minimal `ObservabilityPage.tsx`**:

```tsx
import { ObservabilityThemeProvider, useObsTheme } from "../ObservabilityThemeProvider";
import { useObservabilityWebSocket } from "../hooks/useObservabilityWebSocket";
import "../styles/observability-themes.css";

function ObservabilityInner() {
  const { containerRef } = useObsTheme();
  const { events, isConnected, error } = useObservabilityWebSocket();
  return (
    <div ref={containerRef} className="obs-root flex h-full min-h-0 flex-col text-text-primary">
      <div className="flex items-center gap-2 p-3">
        <span className={isConnected ? "text-success" : "text-destructive"}>
          {isConnected ? "● live" : "○ event server offline"}
        </span>
        <span className="text-text-secondary">{events.length} events</span>
        {error && <span className="text-destructive">{error}</span>}
      </div>
    </div>
  );
}

export default function ObservabilityPage() {
  return (
    <ObservabilityThemeProvider>
      <ObservabilityInner />
    </ObservabilityThemeProvider>
  );
}
```

- [ ] **Step 2: Register the tab in `src/App.tsx`** (two additive lines; serialized). Import `import ObservabilityPage from "@/observability/pages/ObservabilityPage";`. Add to `BUILTIN_ROUTES_CORE`: `"/observability": ObservabilityPage,`. Add to `BUILTIN_NAV_REST` (after Logs): `{ path: "/observability", label: "Observability", icon: Activity },` (`Activity` already imported).
- [ ] **Step 3: Verify (dashboard)**.
- [ ] **Step 4: Runtime check** — server up → `● live`, count climbs; server down → `○ event server offline`, no crash.
- [ ] **Step 5: Commit** `feat(obs): register Observability tab + minimal live shell`.

---

## Phase 4: Core feed UI — search, colors/emojis, filters, rows, stick-scroll, toasts

**[PARALLEL-SAFE: group A]** Tasks 4.1, 4.2, 4.6 touch disjoint files → parallel subagents. 4.3→4.4→4.5 separate files; 4.7 serialized (edits `ObservabilityPage.tsx`).

### Task 4.1: `useEventSearch` hook **[PARALLEL-SAFE: group A]**
**Files:** Create `src/observability/hooks/useEventSearch.ts`
- [ ] **Step 1: Port** — `searchPattern`/`searchError` state; `validateRegex`; `getSearchableText` (hook_event_type, source_app, session_id, model_name, payload.tool_name, summary, HITL question, joined+lowercased); `matchesPattern` (`new RegExp(pattern,'i')`, try/catch→false); `searchEvents`; `updateSearchPattern`; `clearSearch`; `hasError` (`useMemo`).
- [ ] **Step 2: Verify (dashboard)** + commit `feat(obs): regex event search hook`.

### Task 4.2: `useObsMediaQuery` hook **[PARALLEL-SAFE: group A]**
**Files:** Create `src/observability/hooks/useObsMediaQuery.ts`
- [ ] **Step 1: Port** — `{ isMobile, isTablet, isDesktop, windowWidth }`; single `useEffect` adds debounced (100ms) `resize` + `matchMedia('(max-width: 699px)')` change listeners, both cleaned up; `MOBILE_BREAKPOINT=700`; init from `window.innerWidth`.
- [ ] **Step 2: Verify (dashboard)** + commit `feat(obs): media-query hook`.

### Task 4.3: `EventRow` component
**Files:** Create `src/observability/components/EventRow.tsx`. Read `components/EventRow.vue`.
- [ ] **Step 1: Props** — `{ event: HookEvent; gradientClass: string; colorClass: string; appColorClass: string; appHexColor: string; onSelectAgent?: (id: string) => void }`.
- [ ] **Step 2: State** — `isExpanded`, `showChatModal`, `copyLabel` (`"📋 Copy"`), `responseText`, `isSubmitting`, `hasSubmittedResponse`, `localResponse: HumanInTheLoopResponse | null`; copy-reset timeout in a `useRef`, cleared on unmount.
- [ ] **Step 3: Computed (`useMemo`)** — `sessionIdShort=slice(0,8)`; `hookEmoji` (base+tool); `borderColorClass=colorClass.replace('bg-','border-')`; `appBgStyle={backgroundColor: appHexColor+'33'}`; `formattedPayload=JSON.stringify(payload,null,2)`; `toolName` (from `payload.tool_name` for the 4 tool types); `toolInfo` (command/file_path/pattern/url/query from `payload.tool_input`); `formatModelName` (`claude-haiku-4-5-20251001`→`haiku-4-5`).
- [ ] **Step 4: Structure** — desktop (badges: source_app, sessionIdShort, model 🧠, hook_event_type pill, toolName pill, right time; row2 toolInfo + summary) + mobile stacked. Left edge: app color bar (`absolute left-0 w-3`, bg=appHexColor) + session gradient strip (`absolute left-3 w-1.5`, `className={gradientClass}`). Expanded: `<pre>` payload (`max-h-64 overflow-auto`), copy (`navigator.clipboard.writeText`, 2s `✅ Copied!`), "View chat transcript" when `event.chat?.length` (desktop) → `setShowChatModal(true)`.
- [ ] **Step 5: HITL block** (above card when `event.humanInTheLoop`) — pending yellow/pulse, responded green; modes `question`/`permission`/`choice`; optimistic then `POST ${OBS_SERVER_BASE}/events/${event.id}/respond`, roll back on error; all controls `e.stopPropagation()`.
- [ ] **Step 6: Render `<ChatTranscriptModal>`** (Task 5.2) when `event.chat?.length`, controlled by `showChatModal`.
- [ ] **Step 7: Verify (dashboard)** + commit `feat(obs): EventRow with HITL + expand`.

### Task 4.4: `EventTimeline` component
**Files:** Create `src/observability/components/EventTimeline.tsx`. Read `components/EventTimeline.vue`.
- [ ] **Step 1: Props** — `{ events; filters: ObsFilters; stickToBottom: boolean; onStickToBottomChange: (v:boolean)=>void; uniqueAppNames?: string[]; allAppNames?: string[]; onSelectAgent: (id:string)=>void }`.
- [ ] **Step 2: Logic** — `scrollContainerRef`; `filteredEvents` = filters then `searchEvents`; `handleScroll`: `isAtBottom=scrollHeight-scrollTop-clientHeight<50`, emit on change; `useEffect([events.length])` scroll to bottom when `stickToBottom` (rAF/`useLayoutEffect`); `useEffect([stickToBottom])` scroll when true.
- [ ] **Step 3: Structure** — fixed header (title; agent pills from `allAppNames ?? uniqueAppNames`, colored via `getHexColorForApp`, active vs opacity-50, click→`onSelectAgent`); search input (monospace, red border on error, ✕ clear). Scroll container renders `EventRow` per `filteredEvents` keyed `` `${e.id}-${e.timestamp}` `` with color props; empty state. Optional `motion` entry animation.
- [ ] **Step 4: Verify (dashboard)** + commit `feat(obs): EventTimeline with search + stick-scroll`.

### Task 4.5: `FilterPanel` component
**Files:** Create `src/observability/components/FilterPanel.tsx`. Read `components/FilterPanel.vue`.
- [ ] **Step 1: Port** — three `<select>`s from `GET ${OBS_SERVER_BASE}/events/filter-options`, polled every 10s via `setInterval` **cleared in cleanup**. Props `{ filters: ObsFilters; onFiltersChange: (f: ObsFilters)=>void }`. Session labels `slice(0,8)+'...'`. "Clear Filters" when any active.
- [ ] **Step 2: Verify (dashboard)** + commit `feat(obs): FilterPanel`.

### Task 4.6: `StickScrollButton` component **[PARALLEL-SAFE: group A]**
**Files:** Create `src/observability/components/StickScrollButton.tsx`. Read `components/StickScrollButton.vue`.
- [ ] **Step 1: Port** — fixed FAB, `{ stickToBottom: boolean; onToggle: ()=>void }`, inline SVG path swap, themed classes. Pure display.
- [ ] **Step 2: Verify (dashboard)** + commit `feat(obs): StickScrollButton`.

### Task 4.7: `Toast` + new-agent logic, wire feed into the page
**Files:** Create `src/observability/components/Toast.tsx`; Modify `src/observability/pages/ObservabilityPage.tsx`
- [ ] **Step 1: Port `ToastNotification.vue`** → `Toast.tsx`. Props `{ agentName; agentColor; index; duration?; onDismiss }`. Enter animation via mount `useEffect` flipping visible next frame; auto-dismiss `setTimeout(duration ?? 4000)` in a ref, cleared on unmount; `dismiss()` → invisible then `setTimeout(onDismiss, 300)`. Position `top: 16 + index*68`. Render via `createPortal(node, portalRoot)`.
- [ ] **Step 2: Extend `ObservabilityPage`** — state `filters`, `stickToBottom` (true), `showFilters`, `selectedAgentLanes: string[]`, `currentTimeRange` (`'1m'`), `uniqueAppNames`, `allAppNames`, `toasts`, `seenAgents` ref. Header (status, count, Clear, Filters toggle, Theme btn); `<FilterPanel>` when `showFilters`; `<EventTimeline … onSelectAgent={toggleAgentLane}>`; `<StickScrollButton>`; toast list. New unseen app → push toast (color `getHexColorForApp`).
- [ ] **Step 3: Verify (dashboard)** + runtime check (feed streams, search/filter, stick-scroll, toast on new agent).
- [ ] **Step 4: Commit** `feat(obs): live event feed wired into Observability page`.

---

## Phase 5: Canvas pulse chart + chat transcript modal

### Task 5.1: `chartRenderer` + `useChartData` + `LivePulseChart`
**Files:** Create `src/observability/lib/chartRenderer.ts`, `src/observability/hooks/useChartData.ts`, `src/observability/components/LivePulseChart.tsx`. Read `utils/chartRenderer.ts`, `composables/useChartData.ts`, `components/LivePulseChart.vue`.
- [ ] **Step 1: Port `chartRenderer.ts` verbatim** with two changes: type the `roundRect` fallback without `any`; replace global `document.documentElement.classList.contains('dark')` in `drawBars` with a `this.isDark` field + `setDark(v)` method driven by the obs container. Keep `setupCanvas` dpr scaling, `resize`, `stopAnimation`, `drawBars`, `drawPulseEffect`, `animate`, `createChartRenderer`.
- [ ] **Step 2: Port `useChartData(agentIdFilter?)`** — `timeRange`/`dataPoints` state; `allEvents`/`eventBuffer`/`debounceTimer` refs; `timeRangeConfig` (1m 60000/1000/60, 3m 180000/3000/60, 5m 300000/5000/60, 10m 600000/10000/60); `addEvent` (50ms debounce); bucket `floor(ts/bucketSize)*bucketSize`; tool key `` `${hook_event_type}:${payload.tool_name}` ``; `cleanOldData`/`cleanOldEvents` (events window hardcoded 5min); `setTimeRange`→reaggregate; `getChartData()`; `clearData()`; **1s cleanup `setInterval` inside a `useEffect`, cleared on unmount**; computeds `uniqueAgentIdsInWindow`/`allUniqueAgentIds`/`uniqueAgentCount`/`toolCallCount`/`eventTimingMetrics` (`useMemo`); agent id `` `${source_app}:${session_id.slice(0,8)}` ``.
- [ ] **Step 3: Port `LivePulseChart.vue`** — props `{ events; filters; onUpdateUniqueApps; onUpdateAllApps; onUpdateTimeRange }`. Refs: canvas/container/renderer/`processedEventIds`(Set)/**render-loop rAF handle**/pulse rAF handle. Mount `useEffect`: create renderer; `ResizeObserver` on container; `MutationObserver` on the **obs container** (`useObsTheme().containerRef`); window resize for `chartHeight` (`<=400?210:96`); start 30fps render loop. **Cleanup MUST** cancel both rAFs, `renderer.stopAnimation()`, disconnect both observers, remove resize listener, run `useChartData` cleanup. `processNewEvents` skips `refresh`/`initial`, filters, dedupes by `` `${id}-${timestamp}` ``, `addEvent`, `animateNewEvent`. `getActiveConfig()` reads `--theme-*` via `getComputedStyle(containerRef.current)`. Stat badges, time-range buttons (`onUpdateTimeRange`), tooltip, "⏳ Waiting…". Emit callbacks from effects watching computeds.
- [ ] **Step 4: Mount `<LivePulseChart>`** in `ObservabilityPage` (serialized) between header and feed; wire callbacks to page state.
- [ ] **Step 5: Verify (dashboard)** + runtime check — bars render, pulse on new, time-range works, **leaving & returning to the tab doesn't leak** (CPU idle, no errors). Commit `feat(obs): live pulse canvas chart + chart data hook`.

### Task 5.2: `ChatTranscript` + `ChatTranscriptModal`
**Files:** Create `src/observability/components/ChatTranscript.tsx`, `src/observability/components/ChatTranscriptModal.tsx`. Read both `.vue` files.
- [ ] **Step 1: Port `ChatTranscript.vue`** — `{ chat: unknown[] }`; message branches (user/assistant/system/role); `cleanSystemContent` (ANSI strip), `cleanCommandContent`; per-item expand (`Set<number>` state) + copy (2s reset via ref'd timeout).
- [ ] **Step 2: Port `ChatTranscriptModal.vue`** — `createPortal` to `useObsTheme().portalRoot`. `{ isOpen; chat; onClose }`. State `searchQuery`/`activeSearchQuery`/`activeFilters`/`copyAllLabel`. Escape-to-close `document` keydown in `useEffect` (cleanup); `useEffect([isOpen])` resets search when closed. The 9 static filter chips. `filteredChat=matchesSearch && matchesFilters`. Renders `<ChatTranscript chat={filteredChat} />`.
- [ ] **Step 3: Verify (dashboard)** + runtime check — expand an event with chat (desktop) → themed modal, search/filter/copy-all, Escape + backdrop close. Commit `feat(obs): chat transcript modal (portaled, themed)`.

---

## Phase 6: Agent swim-lanes + scoped theme manager

### Task 6.1: `AgentSwimLane` + `AgentSwimLaneContainer`
**Files:** Create `src/observability/components/AgentSwimLane.tsx`, `src/observability/components/AgentSwimLaneContainer.tsx`. Read both `.vue` files.
- [ ] **Step 1: Port `AgentSwimLane.vue`** — `{ agentName; events; timeRange; onClose }`. Same canvas lifecycle as LivePulseChart but fixed `chartHeight=80`, no window-resize listener, `timeRange` from prop (effect calls `setTimeRange` on change), events processed on mount, filter `source_app===app && session_id.slice(0,8)===session` (parsed from `agentName`). Header: app/session colored label pair, model badge, hover-expanding event/tool/avg-gap badges, close button. Reuse `useChartData(agentName)`. **Same rAF/observer cleanup.**
- [ ] **Step 2: Port `AgentSwimLaneContainer.vue`** — `{ selectedAgents; events; timeRange; onSelectedAgentsChange }`; stacked lanes keyed by `"app:session"`; `onClose` removes via callback.
- [ ] **Step 3: Mount `<AgentSwimLaneContainer>`** in `ObservabilityPage` (serialized) — visible when `selectedAgentLanes.length>0`.
- [ ] **Step 4: Verify (dashboard)** + runtime check — click an agent pill → lane; spawn a `Task` subagent → its `SubagentStart/Stop` create a distinct identity-keyed lane; close removes; no leak. Commit `feat(obs): agent swim-lanes (per-agent canvas, identity-keyed)`.

### Task 6.2: `ThemePreview` + `ThemeManager`
**Files:** Create `src/observability/components/ThemePreview.tsx`, `src/observability/components/ThemeManager.tsx`. Read both `.vue` files.
- [ ] **Step 1: Port `ThemePreview.vue`** — inline-styled mini-dashboard skin; `{ theme: CustomTheme; onApply?: ()=>void }`; hover via `onMouseEnter/Leave` state.
- [ ] **Step 2: Port `ThemeManager.vue`** — `createPortal` to portal root. `{ isOpen; onClose }`. Uses `useObsTheme()`. Grid of theme cards (3-color preview, displayName, description, "Current" badge); click→`setTheme(name)`+`onClose()`. Optional create-form (validate `COLOR_REGEX`/`RGBA_REGEX`, `POST /api/themes` via `saveCustomTheme`).
- [ ] **Step 3: Mount `<ThemeManager>`** in `ObservabilityPage` (serialized), toggled by header Theme button.
- [ ] **Step 4: Verify (dashboard)** + runtime check — switch among 12 themes: obs container + modal/toast restyle; **other dashboard tabs unchanged** (no leakage). Commit `feat(obs): scoped theme manager + preview (§6 verified)`.

### Task 6.3: HITL notifications hook (dormant) + finalize page
**Files:** Create `src/observability/hooks/useHITLNotifications.ts`; Modify `src/observability/pages/ObservabilityPage.tsx`
- [ ] **Step 1: Port `useHITLNotifications`** → `{ hasPermission, requestPermission, notifyHITLRequest }` via `Notification` API (guarded `'Notification' in window`).
- [ ] **Step 2: Wire** `notifyHITLRequest` on streamed events with `humanInTheLoop` (effect over `events`).
- [ ] **Step 3: Verify (dashboard)** + commit `feat(obs): HITL notifications (dormant) wired`.

---

## Phase 7: Multi-agent enrichment surfacing (§4.4)

Server-side token/cost ingest landed in Phase 1 (1.5–1.7). This phase surfaces it + parent/child linking.

### Task 7.1: Per-agent token/cost rollups in swim-lanes
**Files:** Modify `src/observability/components/AgentSwimLane.tsx` (+ optionally `useChartData.ts`)
- [ ] **Step 1: Token rollup** — sum `event.tokens.{input,output,total}` + `cost` across the lane's events (`useMemo`).
- [ ] **Step 2: Render badge** in the lane header (`🧮 {totalTokens} tok`, `💲{cost.toFixed(4)}`, hover-expand input/output split); degrade to "—" when `tokens` absent.
- [ ] **Step 3: Verify (dashboard)** + runtime check — subagent lane shows non-zero token + cost once its `SubagentStop` (with `agent_transcript_path`) is enriched. Commit `feat(obs): per-agent token/cost rollups (§4.4)`.

### Task 7.2: Parent/child agent linking in the UI
**Files:** Modify `src/observability/components/EventRow.tsx`, `src/observability/components/AgentSwimLane.tsx`
- [ ] **Step 1: Surface linkage** — when an event has `agent_id`/`parent_session_id`, show a "child of {parent.slice(0,8)}" chip + `agent_type` badge on the row; label lanes by `agent_type` when present.
- [ ] **Step 2: Verify (dashboard)** + runtime check — subagent events show `agent_type` + parent linkage; top-level events don't. Commit `feat(obs): surface parent/child agent linkage (§4.4)`.

---

## Phase 8: Docs, recipes, end-to-end verification

### Task 8.1: justfile recipes + README
**Files:** Modify `justfile`; Create `observability/README.md`
- [ ] **Step 1: Add recipes** to `justfile`:
```
obs-server:
    cd observability/server && bun run start

obs-server-dev:
    cd observability/server && bun run dev

obs-test:
    cd observability/server && bun test
```
- [ ] **Step 2: Create `observability/README.md`** — how to run (`just obs-server` + `npm run dev`), env vars (`VITE_OBSERVABILITY_SERVER_URL`, `SERVER_PORT`, `OBS_DB_PATH`), localhost-only note (§10), §4.4 token note (transcript-derived, degrades to "unknown"), `/obs` proxy for HTTPS.
- [ ] **Step 3: Commit** `docs(obs): run recipes + README`.

### Task 8.2: Full gate + end-to-end smoke
- [ ] **Step 1: Server suite** — `cd observability/server && bun test` → all pass.
- [ ] **Step 2: Dashboard gate** — `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build` succeeds.
- [ ] **Step 3: End-to-end** — `just obs-server`; `npm run dev`; run a multi-step Claude action incl. a subagent; confirm Success Criteria §14 #1–7 (server up + `events.db`; rows + live WS frames with `source-app trismegistus-dashboard`; sidebar tab streams; all parity surfaces; kill server → offline + Claude not blocked; subagent appears as parent-linked lane with token/cost rollup).
- [ ] **Step 4: No global theme regression** — switch obs themes; other tabs unchanged.
- [ ] **Step 5: Commit** `chore(obs): end-to-end verification pass`. Branch `feat/observability-tab` is then ready for review/merge (user-driven).

---

## Self-review notes (author)

- **Spec coverage:** §4.1 server → Phase 1; §4.2 hooks → Phase 2; §4.3 client parity → Phases 3–6; §4.4 multi-agent/token → Phases 1 (server) + 7 (UI); §5 connection/offline → 3.2/3.5; §6 theming scope → 3.4/6.2; §7 canvas lifecycle → 5.1; §8 hook perf → 2.2/2.3; §9 HITL dormant → 4.3/6.3; §10 localhost bind + gitignore → 1.6/0.4; §14 criteria → 8.2.
- **Type consistency:** `HookEvent` defined once (server `types.ts`, 1.2), mirrored in client `lib/types.ts` (3.1) with identical §4.4 fields (`agent_id`, `agent_type`, `parent_session_id`, `agent_transcript_path`, `tokens: AgentTokenUsage`). `ObsFilters` consistent across FilterPanel/EventTimeline/page. `TimeRange` shared. Agent-id format `"${source_app}:${session_id.slice(0,8)}"` consistent across `useChartData`, swim-lanes, pills.
- **No placeholders:** load-bearing modules (config, WS hook, theme provider, enrichment, chartRenderer change, server schema, settings.json) fully inlined; component tasks pin the exact upstream `.vue` source + complete prop/state/structure contracts + the critical timer/portal/cleanup code.
- **Risks (spec §13):** mixed-content → `/obs`; theme leakage → `.obs-root` scoping + portal-root theming; rAF/observer leaks → explicit cleanup in 5.1/6.1; strict-TS friction → `unknown` + narrow; enrichment fragility → never-throws parser.
