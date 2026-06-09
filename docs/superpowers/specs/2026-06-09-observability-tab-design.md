# Observability Tab — Design Spec

- **Date:** 2026-06-09
- **Status:** Approved (design gate passed); consolidated after Codex review (added §4.4 multi-agent + token observability); pending final spec review
- **Branch:** to be created at implementation kickoff (work isolated from `main`)
- **Source upstream:** [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)

## 1. Goal & Non-Goals

**Goal:** Add a new **Observability** tab to this React 19 dashboard (the "Hermes Agent" control-plane SPA) that reaches **full feature parity** with upstream's Vue observability client, backed by a faithfully-copied Bun event server, with this repo's Claude Code sessions wired to emit hook events into it — including first-class **multi-agent** and **token/cost** observability (§4.4).

**Non-goals:**
- Porting upstream's Vue client *app shell*, its `.claude` agents/commands/output-styles/status-lines, or the demo agent.
- Modifying the external Hermes Python backend.
- Authentication on the event server (localhost-only dev tool, matching upstream).

> **Clarification — the excluded items are NOT the observability mechanism** (confirmed via Codex review). Upstream's `.claude/agents`, `/commands`, `/output-styles`, `/status_lines`, and `demo-cc-agent` are disler's *own* workflow artifacts and sample-data generators: they *produce* events in his setup. The observability *mechanism* — hooks → server → client — is fully in scope and observes **your** agents. Per-agent tool use, lifecycle, and token usage are delivered per **§4.4**.

## 2. Background

This repo is the **Hermes Agent dashboard**: React 19 + Vite 7 + Tailwind 4, `@nous-research/ui` design system, served by an external Python backend over `/api/*` + a JSON-RPC WebSocket (`/api/ws`). Tabs are registered in `src/App.tsx` via `BUILTIN_ROUTES_CORE` (path→component) and `BUILTIN_NAV_REST` (sidebar items); a server-driven plugin system also exists but is **not** used here (it would require backend manifest support).

Upstream is a **standalone** stack: a Bun + SQLite event server (`:4000`), a Vue 3 client (`:5173`), and Python `.claude/hooks` that POST events via `send_event.py`.

## 3. Architecture & Data Flow

```
Claude Code (this repo)
   │  (12 hook events)
   ▼
.claude/hooks/<event>.py + send_event.py  ──POST {server}/events──▶  Bun event server ──▶ SQLite (events.db, WAL)
                                                                          │
React "Observability" tab  ◀── WS {server}/stream (initial snapshot + live broadcast) ──┘
   (src/observability/, mounted as a dashboard tab)
```

The tab talks to the Bun server **directly** — default `http://localhost:4000`, overridable via `VITE_OBSERVABILITY_SERVER_URL`; a vite dev proxy (`/obs`) is shipped for same-origin / HTTPS setups. No Hermes-backend changes.

## 4. Component Inventory

### 4.1 Bun event server — `observability/server/` (faithful copy)
Files: `package.json`, `tsconfig.json`, `src/{index.ts, db.ts, types.ts, theme.ts}`. Placed **outside `src/`** so the dashboard's `tsc -b` never compiles `bun:sqlite`. Runs as its own `bun run` process.

- **DB (`events.db`, WAL):** `events(id, source_app, session_id, hook_event_type, payload JSON, chat JSON, summary, timestamp, humanInTheLoop JSON, humanInTheLoopStatus JSON, model_name)` + indexes on source_app/session_id/hook_event_type/timestamp. **Extended for §4.4** with `agent_id`, `parent_session_id`, `agent_transcript_path`, and token columns (`input_tokens`/`output_tokens`/`cache_tokens`/`total_tokens`, `cost`). Plus `themes` (+ `theme_shares`, `theme_ratings` retained but their UI is out of scope per §11).
- **Endpoints (unchanged):** `POST /events`, `GET /events/recent?limit=300`, `GET /events/filter-options`, `POST /events/:id/respond` (HITL), `GET/POST/PUT/DELETE /api/themes*`, `/api/themes/:id/export`, `/api/themes/import`, `/api/themes/stats`, `WS /stream`.
- **WS protocol:** on open → `{type:'initial', data: HookEvent[]}`; on new event → `{type:'event', data: HookEvent}`. CORS `*`.
- **Port:** `SERVER_PORT` env, default `4000`.

### 4.2 Hooks — project-level `.claude/` (additive; none exists today)
- `settings.json` wires all **12 events** (PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, Notification, UserPromptSubmit, Stop, SubagentStart, SubagentStop, PreCompact, SessionStart, SessionEnd), each running the event-specific script + `send_event.py --source-app trismegistus-dashboard --event-type <E>`.
- `hooks/`: `send_event.py` + the 12 event scripts + `utils/` (summarizer, model_extractor, constants, tts/, llm/, validators/).
- **`--summarize` OFF by default** (no per-event LLM call); cheap `model_name` transcript extraction stays on. Token/cost extraction is done **server-side** (§4.4), not in the hook, to keep hooks fast.
- Coexists with the user's global `~/.claude` hooks (Warren/codex/superpowers) — both fire.

### 4.3 React module — `src/observability/` (full parity port)
Registered with **two additive lines** in `src/App.tsx`: `BUILTIN_ROUTES_CORE["/observability"] = ObservabilityPage` and a `BUILTIN_NAV_REST` item `{ path:"/observability", label:"Observability", icon: Activity }` (icon already imported).

| Upstream (Vue) | Port (React/TSX, under `src/observability/`) |
|---|---|
| `App.vue` | `pages/ObservabilityPage.tsx` (orchestrator: WS state, filters, layout, modal/theme state) |
| `EventTimeline` + `EventRow` | `components/EventTimeline.tsx`, `EventRow.tsx` |
| `FilterPanel` | `components/FilterPanel.tsx` |
| `LivePulseChart` + `utils/chartRenderer.ts` | `components/LivePulseChart.tsx` + `lib/chartRenderer.ts` (canvas) |
| `AgentSwimLane(+Container)` | `components/AgentSwimLane.tsx`, `AgentSwimLaneContainer.tsx` |
| `ChatTranscript(+Modal)` | `components/ChatTranscript.tsx`, `ChatTranscriptModal.tsx` |
| `ThemeManager` + `ThemePreview` | `components/ThemeManager.tsx`, `ThemePreview.tsx` (scoped — §6) |
| `ToastNotification`, `StickScrollButton` | `components/Toast.tsx`, `StickScrollButton.tsx` |
| composables: `useWebSocket`, `useEventColors`, `useEventEmojis`, `useEventSearch`, `useChartData`, `useAgentChartData`, `useThemes`, `useHITLNotifications` | `hooks/*` React equivalents (`useMediaQuery` → reuse the dashboard's `useBelowBreakpoint` or a small local equivalent) |
| `types.ts`, `config.ts` | `lib/types.ts`, `lib/config.ts` |

Styling uses Tailwind 4 + `@nous-research/ui` primitives where they map; upstream `any` is tightened to satisfy strict TS + eslint.

### 4.4 Multi-agent & token observability (in scope — this is the core goal)
Per-agent tool use, lifecycle, and "what each agent is working on" come from the **subagent hooks + swim-lanes**, *not* from upstream's example agents (those are excluded; see §1). Verified with a Codex review.

- **Subagent events:** `SubagentStart` / `SubagentStop` carry `agent_id`, `agent_type`, and `agent_transcript_path`; tool events carry `tool_name` / `tool_input` / `tool_response`. These render in the **agent swim-lanes** (keyed on **agent identity**, not just session color) and the **chat-transcript viewer**.
- **You observe YOUR agents:** the tab shows whatever runs in this repo — your Task subagents, the Warren/Codex multi-agent workflow — emitting the same events. disler's bundled agents would only have added sample data.
- **Parent/child linking (schema extension):** persist `agent_id`, `parent_session_id`, `agent_transcript_path`, start/stop timestamps, and derived duration/status alongside `session_id`, so the UI shows the agent tree and per-agent timelines.
- **Token/cost per agent (enrichment beyond upstream):** a **server-side ingest step** parses the relevant transcript `.jsonl` to persist `input_tokens` / `output_tokens` / `cache_*` / `total_tokens` + estimated cost, attributed by `agent_id` / `agent_type` / session, surfaced as per-agent rollups. Done server-side (not in `send_event.py`) to keep hooks fast and allow backfill. (The dashboard's existing Analytics/Models tabs cover Hermes-gateway token/cost; this covers Claude Code hook sessions.)
- **Optional next (post-parity):** newer Claude Code lifecycle events (e.g. task-created/completed, permission-denied, teammate/worktree events) may be wired in addition to the 12 for richer multi-agent coverage — verified against the installed Claude Code version at implementation.

This makes the user's core ask — see tool use, lifecycle, token expenditure, and what each agent is doing — explicitly in scope.

## 5. Connection & Configuration (refinement)
- **Default:** `VITE_OBSERVABILITY_SERVER_URL`, falling back to `http://localhost:4000` (matches upstream; robust across vite dev, `vite preview`, and backend-served modes when on HTTP).
- **HTTPS / same-origin:** a vite **dev proxy** (`server.proxy['/obs'] → http://localhost:4000`, `ws:true`, path rewrite) is shipped; point the base at the relative `/obs` to avoid **mixed-content** breakage when the dashboard is served over TLS. (`server.proxy` is dev-only; `vite preview` / backend serving needs its own proxy or the absolute URL.)
- WS URL derived from the resolved base (`ws(s)://`).
- **Offline handling:** the WS hook retries (3 s) and the tab shows a clear "event server offline" state; no crash when `:4000` is down.

## 6. Theming (scoped — refinement)
- Port upstream's theme system, but apply its CSS variables to an **observability container element**, not `:root`, so it never overrides the dashboard's global theme.
- **Portaled elements** (ChatTranscriptModal, Toast) render at `document.body`; the obs theme vars/class must also be attached to their portal root, or they render unthemed.
- Theme CRUD persists via the Bun server's `/api/themes*`. Share/rating tables exist server-side but get **no UI** (§11).

## 7. Canvas Chart Port Requirements
`lib/chartRenderer.ts` ports near-verbatim, driven by a React component that must: hold `canvas` via `useRef`; start/stop the `requestAnimationFrame` loop in `useEffect` with **`cancelAnimationFrame` on cleanup**; **disconnect `ResizeObserver`** on unmount; scale the backing store by **`devicePixelRatio`**; and be safe under **React StrictMode** double-mount (idempotent setup/teardown). Must cancel cleanly on route change away from the tab.

## 8. Hooks Behavior & Performance
- Each tool call fires PreToolUse + PostToolUse → each spawns a `uv run` Python process (event script + `send_event.py`). With `--summarize` off there is no LLM call; cost is process startup + a localhost POST.
- `send_event.py` uses a 5 s POST timeout and **always exits 0** → never blocks Claude. Connection-refused (server down) returns immediately.
- Windows hardening: add `encoding='utf-8'` to the transcript file read in `send_event.py`.
- `source-app` default: `trismegistus-dashboard` (single constant; easy to change).
- Note: this stacks on the user's existing global hooks; the event set can be trimmed if sessions feel slow.

## 9. Human-in-the-Loop (dormant)
Port the client HITL UI + keep the server `POST /events/:id/respond` endpoint for parity. Standard hooks do **not** emit `humanInTheLoop` payloads, so the feature stays dormant unless explicitly opted in.

## 10. Security
Event server is unauthenticated. **Bind to localhost only.** Do not expose `:4000` publicly. `events.db` and `.env`-style files are git-ignored.

## 11. Key Decisions & Tradeoffs

| Decision | Rationale | Tradeoff |
|---|---|---|
| New built-in React tab (not a plugin, not standalone Vue) | User-selected; single integrated UI | Edits `App.tsx` (additively) |
| Bun server copied faithfully, outside `src/` | Fidelity; keeps `bun:sqlite` out of the app build | Second process/port to run |
| Tab → server: absolute `localhost:4000` default + optional vite `/obs` proxy | Matches upstream & robust on HTTP; proxy fixes HTTPS mixed-content | Two connection modes to document |
| Theme manager scoped to obs container | Dashboard already has global theming | Most redundant parity piece; portal theming caveat |
| Faithful canvas chart port | Exact visual parity | More code than an Observable Plot rewrite |
| `--summarize` off by default | Avoids per-event LLM cost/latency | Summaries are opt-in |
| Theme shares/ratings: server tables retained, no UI | Those aren't core to the client UX | Slightly less than 100% server parity exposed |
| Multi-agent + token observability in scope (§4.4) | Directly serves the core goal; server-side token enrichment | Small schema extension + an ingest step beyond bare upstream |

## 12. Out of Scope
Upstream Vue client app shell; upstream `.claude` agents/commands/output-styles/status-lines; demo agent; Hermes backend changes; theme share/rating UI; production deployment of the event server. Excluding these does **not** reduce observability — see the §1 clarification and §4.4.

## 13. Risks & Mitigations
- **Mixed content / cross-origin** → same-origin vite proxy (§5).
- **Theme leakage into the dashboard** → container-scoped CSS vars + portal-root theming (§6).
- **Canvas/rAF leaks on route change** → strict effect cleanup (§7).
- **Hook latency stacking** → summaries off, trimmable event set, non-blocking sender (§8).
- **Strict-TS/eslint friction porting `any`-heavy SFCs** → type payloads as `unknown` + narrow; targeted, justified exceptions only.
- **Token enrichment fragility** → parse transcripts server-side with defensive guards; missing/partial usage data degrades to "unknown", never blocks ingest.
- **Codex consult** → succeeded via direct `codex exec` (read-only sandbox); findings folded into §4.4. (The warm-pane helper couldn't find the `codex` npm binary on its bash PATH — a separate fixable issue.)

## 14. Success Criteria
1. `bun run` starts the event server on `:4000`; `events.db` is created.
2. Running Claude Code in this repo produces rows in `events.db` and live frames on `WS /stream` (verified with `--source-app trismegistus-dashboard`).
3. The dashboard shows an **Observability** sidebar tab; opening it streams events live.
4. Parity surfaces present and functional: event feed + row detail, filter panel, live pulse chart, agent swim-lanes, chat-transcript modal, color/emoji coding, search, stick-scroll, toasts, scoped theme manager, HITL UI (dormant).
5. `npm run build` (`tsc -b && vite build`) and `npm run lint` pass; no global theme regression in other tabs.
6. Event server down ⇒ tab shows offline state and Claude sessions are not blocked.
7. Subagent runs appear as distinct, **parent-linked** lanes with per-agent tool history and **token/cost rollups** (§4.4).

## 15. Phasing (high-level; detailed plan via writing-plans)
1. Bun server + DB (copy, run, smoke-test).
2. `.claude/` hooks wiring + emit a verified test event.
3. React tab scaffold: WS hook, event feed, filters, App.tsx registration, vite proxy.
4. Live pulse chart (canvas) + agent swim-lanes.
5. Chat-transcript modal + colors/emojis/search/stick-scroll/toasts.
6. Scoped theme manager + HITL UI.
7. **Multi-agent enrichment (§4.4):** parent/child session linking (schema) + server-side token/cost ingest from transcripts + per-agent rollups in the swim-lanes.
8. Docs, justfile recipes, `.gitignore`, full build/lint/typecheck + end-to-end verification.

## 16. New Files & Directories (inventory)
- `observability/server/` — `package.json`, `tsconfig.json`, `src/{index.ts,db.ts,types.ts,theme.ts}` + an ingest/enrichment module for §4.4 token parsing.
- `.claude/` — `settings.json`, `hooks/{send_event.py, <12 event scripts>, utils/**}`.
- `src/observability/` — `pages/ObservabilityPage.tsx`, `components/*.tsx`, `hooks/*.ts`, `lib/{chartRenderer.ts,types.ts,config.ts}`.
- `src/App.tsx` — **edited** (2 additive entries).
- `vite.config.ts` — **edited** (add `/obs` proxy alongside the existing `/api` proxy).
- `justfile` — **edited** (`obs-server`, `obs` recipes).
- `.gitignore` — **edited** (`observability/server/events.db*`).
- `docs/superpowers/specs/2026-06-09-observability-tab-design.md` — this spec.
