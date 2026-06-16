# Observability Integration Audit

**Merged:** `feat/observability-tab` → `main` (fast-forward, commit `a1e55bf`)
**Date:** 2026-06-14
**Auditor:** Use this document to verify that every integration point landed correctly and works end-to-end. Go through every section in order. Do not skip sections.

---

## Prerequisites

Before starting, ensure:

- [ ] `uv` is installed and in PATH (hooks use `uv run`)
- [ ] Node.js and `bun` are installed
- [ ] `npm install` has been run in the project root
- [ ] `bun install` has been run in `observability/server/`
- [ ] You are on the `main` branch (`git branch` shows `* main`)
- [ ] `git log --oneline -1` shows `a1e55bf`

---

## 1. Server — Bun Event Ingestion

**What was integrated:** A standalone Bun server at `observability/server/` that receives events from Claude Code hooks via HTTP POST, stores them in SQLite (WAL mode), enriches token/cost data from transcripts asynchronously, and broadcasts via WebSocket.

### 1.1 Test suite

```bash
just obs-test
# Expected: 8 pass, 0 fail
```

Verify all 8 tests pass across `db.test.ts`, `enrichment.test.ts`, and `server.test.ts`.

### 1.2 Server starts cleanly

```bash
just obs-server
# Expected output: Observability server listening on http://127.0.0.1:4000
```

- [ ] Server starts without errors
- [ ] Port 4000 is listening (`netstat -an | grep 4000` or check output)
- [ ] No crash on startup

### 1.3 HTTP endpoints respond

With the server running, test each endpoint:

```bash
# Recent events (empty array on fresh DB is fine)
curl http://127.0.0.1:4000/events/recent
# Expected: {"events":[...]}

# Filter options
curl http://127.0.0.1:4000/events/filter-options
# Expected: {"source_apps":[...],"session_ids":[...],"hook_event_types":[...]}

# Themes list
curl http://127.0.0.1:4000/api/themes
# Expected: {"themes":[...]} — may be empty array

# Theme stats
curl http://127.0.0.1:4000/api/themes/stats
# Expected: {"total":...}
```

- [ ] `/events/recent` returns JSON
- [ ] `/events/filter-options` returns JSON
- [ ] `/api/themes` returns JSON
- [ ] `/api/themes/stats` returns JSON

### 1.4 WebSocket stream endpoint

```bash
# Use wscat or any WS client:
wscat -c ws://127.0.0.1:4000/stream
# Expected: immediately receives {"type":"initial","data":[...]} on connect
```

- [ ] WebSocket connection accepted at `/stream`
- [ ] `initial` message arrives on connect with current events array

### 1.5 POST an event manually

```bash
curl -X POST http://127.0.0.1:4000/events \
  -H "Content-Type: application/json" \
  -d '{"source_app":"test","session_id":"abc12345","hook_event_type":"SessionStart","timestamp":1718000000,"payload":{}}'
# Expected: {"id":1} (or next auto-increment id)
```

- [ ] Returns `{"id": <number>}`
- [ ] The WS client (if still open) receives a broadcast with `type:"event"` and the new event

---

## 2. Claude Code Hooks

**What was integrated:** 12 lifecycle hooks wired in `.claude/settings.json`. Each fires `send_event.py` via `uv run`, POSTing to `http://127.0.0.1:4000/events` with `--source-app trismegistus-dashboard`.

### 2.1 Verify hook wiring in settings.json

```bash
grep "send_event.py" .claude/settings.json | wc -l
# Expected: 12
```

Confirm all 12 event types are present:

```bash
grep "event-type" .claude/settings.json
```

Expected event types: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `UserPromptSubmit`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `SessionStart`, `SessionEnd`.

- [ ] All 12 event types present in settings.json
- [ ] `--source-app trismegistus-dashboard` on every hook command
- [ ] `--server-url http://127.0.0.1:4000/events` on every hook command
- [ ] `Stop` hook has `--add-chat` flag (for chat transcript capture)

### 2.2 Live hook firing

With the obs server running and a Claude session active in this project:

- [ ] Use a tool (e.g., Read a file) — verify a `PreToolUse` + `PostToolUse` event appears in the UI feed
- [ ] Submit a prompt — verify `UserPromptSubmit` appears
- [ ] Wait for a Stop event — verify it appears with the chat transcript field populated
- [ ] Check `events/filter-options` shows `trismegistus-dashboard` in `source_apps`

### 2.3 Hook scripts are present

```bash
ls .claude/hooks/send_event.py
ls .claude/hooks/utils/
```

- [ ] `send_event.py` exists
- [ ] `utils/` directory contains `constants.py`, `hitl.py`, `model_extractor.py`, `summarizer.py`, and `llm/` + `tts/` subdirectories

---

## 3. Dashboard — Navigation and Routing

**What was integrated:** The Observability tab is embedded as a sub-tab inside the **Workflow** hub page at `/workflow`. It is NOT a top-level route.

### 3.1 Dashboard starts

```bash
just dev
# Vite on :5173. Open http://localhost:5173
```

- [ ] Dashboard loads without console errors
- [ ] Sidebar shows navigation items

### 3.2 Workflow hub accessible

- [ ] Click **Workflow** in the sidebar — navigates to `/workflow`
- [ ] Six sub-tabs appear in the tab bar: **Active Sessions**, **Agent Status**, **Observability**, **Models & Telemetry**, **System Logs**, **Integrations**

### 3.3 Observability sub-tab loads

- [ ] Click **Observability** sub-tab
- [ ] ObservabilityPage renders inside the 650px container
- [ ] Header shows connection status: `○ offline` (if obs server not running) or `● live` (if running)
- [ ] Event count shows (e.g., `0 events`)
- [ ] **Filters**, **🎨 Theme**, and **Clear** buttons visible in header bar

### 3.4 Vite proxy wiring

The dashboard proxies `/obs/*` → `http://127.0.0.1:4000` (WebSocket-enabled):

- [ ] With obs server running: status flips to `● live` within ~3 seconds
- [ ] A toast "Connected to event server" appears briefly
- [ ] Stop the obs server: status flips to `○ offline` and a red toast "Event server offline — reconnecting…" appears

---

## 4. Observability Features

### 4.1 Live Pulse Chart

**What:** 30fps canvas bar chart showing event frequency over a sliding time window.

- [ ] Canvas renders at the top of the Observability pane (height ~96px on desktop, ~210px on small screens)
- [ ] Time range buttons visible: **1m**, **3m**, **5m**, **10m** — clicking switches the window and re-scales bars
- [ ] Stat badges show: 👥 agent count, ⚡ event count, 🔧 tool call count, 🕐 avg gap
- [ ] Hovering over a bar shows a tooltip: `N events · <event_type>`
- [ ] "⏳ Waiting for events..." placeholder visible when no data
- [ ] After generating events: bars appear and animate

### 4.2 Event Timeline (Feed)

**What:** Scrollable list of all events, newest at bottom, with stick-scroll behavior.

- [ ] Events appear in the list as they arrive
- [ ] Each row has a colored left border and app-colored accent matching the source app
- [ ] Stick-to-bottom FAB (📌/⬇) appears in lower-right; click toggles stick mode
- [ ] Scrolling up disables stick mode; clicking FAB re-enables it

### 4.3 Event Row — expand, copy, badges

Click any event row to expand it:

- [ ] Expanded view shows full payload JSON
- [ ] **Copy** button copies payload JSON to clipboard; label changes to "Copied!" for 2 seconds then resets
- [ ] **model_name** badge (🧠) shown when present
- [ ] **hook_event_type** badge shown on every row
- [ ] **tool_name** badge shown for PreToolUse/PostToolUse events
- [ ] **🤖 agent_type** badge shown when event has `agent_type` field (sub-agent events)
- [ ] **↳ {8-char id}** parent chip shown when event has `parent_session_id` (child agent events)
- [ ] For `Stop` events with chat transcript: **💬 View chat transcript** button appears (desktop only)

### 4.4 HITL (Human-in-the-Loop) Events

Events with `humanInTheLoop` field get special treatment:

- [ ] HITL row shows the question text and response options (choice buttons or text input)
- [ ] Responding sends a POST to `/events/{id}/respond`
- [ ] After responding, the row updates to show the answer
- [ ] If browser notifications are enabled: a system notification fires for each HITL event (see §4.10)

### 4.5 Filter Panel

Click **Filters** in the header:

- [ ] Filter panel slides in below the pulse chart
- [ ] Three dropdowns: **Source App**, **Session ID**, **Event Type**
- [ ] Dropdowns populate from `/events/filter-options` (polling every 10s)
- [ ] Selecting a filter narrows the event timeline
- [ ] Filter pill in the dropdown shows "All" when no filter selected
- [ ] Clearing a filter to "All" restores full feed

### 4.6 Search

- [ ] Search field in EventTimeline accepts text and regex
- [ ] Matching highlights / filters the feed in real time
- [ ] Invalid regex shows an error indicator without crashing

### 4.7 Agent Swim-Lanes

**What:** Per-agent mini canvas charts pinned below the pulse chart. Activated by clicking agent pills in the EventTimeline.

- [ ] Agent pills (colored by app) appear in EventTimeline header for each observed agent
- [ ] Clicking a pill adds a swim-lane below the LivePulseChart
- [ ] Each swim-lane shows: `{app}` badge (app color) + `{session-8char}` badge (session color)
- [ ] 🧠 model name badge shown when a model was detected for that agent
- [ ] **↳ {parent id}** chip shown if the agent is a sub-agent (has `parent_session_id`)
- [ ] ⚡ event count badge (expands label on hover)
- [ ] 🔧 tool call count badge (expands on hover)
- [ ] 🕐 avg gap badge (expands on hover)
- [ ] 📊 token count badge (k/M formatted) shown when token data available
- [ ] 💵 cost badge shown when server has enriched cost from transcript
- [ ] Canvas renders 30fps activity bars for that agent only
- [ ] "⏳ Waiting for events..." shown when no data for that agent
- [ ] Hovering canvas shows tooltip with event count and top event type
- [ ] ✕ close button removes the swim-lane
- [ ] Multiple swim-lanes can be open simultaneously

### 4.8 Chat Transcript Modal

For `Stop` events with `--add-chat` data:

- [ ] Click **💬 View chat transcript** in the expanded event row
- [ ] Modal opens (portal, 85vw × 85vh, full-screen on mobile)
- [ ] 9 filter chips appear: user, assistant, system, tool_use, tool_result, Read, Write, Edit, Glob
- [ ] Message search field filters by content, role, type
- [ ] Each message is expandable; expand shows full content
- [ ] Per-message copy button works (copies message text)
- [ ] **Copy All** button copies full transcript to clipboard
- [ ] Press **Escape** closes the modal
- [ ] Clicking the backdrop (**✕** button) closes the modal

### 4.9 Theme Manager

Click **🎨 Theme**:

- [ ] Modal opens (portal, 75vw × 75vh) showing a 4-column grid of 13 theme cards
- [ ] Current active theme has a gold border highlight and a **Current** green badge
- [ ] Each card shows a mini preview (header, event card, filter panel, color palette)
- [ ] Clicking a theme card applies it immediately and closes the modal
- [ ] **Greek Pantheon** theme is present in the grid
- [ ] After applying a theme, the entire Observability pane re-skins (all CSS vars update)
- [ ] Theme preference persists across page reload (stored in `localStorage` under `obs.theme`)
- [ ] Press **Escape** closes the manager without applying

Verify all 13 themes render (no blank/broken cards):
`light`, `dark`, `pantheon`, `modern`, `earth`, `glass`, `aurora`, `midnight`, `forest`, `ocean`, `sunset-orange`, `mint-fresh` + the Greek Pantheon entry.

### 4.10 HITL Browser Notifications

- [ ] On first visit, a permission request for browser notifications can be triggered (requires a HITL event or a manual `requestPermission()` call in devtools)
- [ ] Once granted, `humanInTheLoop` events trigger a system notification: title "🤚 Human-in-the-Loop Request", body shows the question
- [ ] Notification uses tag `hitl-{session_id}` (deduplicates per session)
- [ ] If permission denied/not granted, no crash occurs (silent fallback)

### 4.11 Toast Notifications

- [ ] Connection gained → green "Connected to event server" toast
- [ ] Connection lost → red "Event server offline — reconnecting…" toast
- [ ] Toasts auto-dismiss after 4 seconds
- [ ] Clicking ✕ on a toast dismisses it immediately
- [ ] Multiple toasts stack vertically

---

## 5. Greek Pantheon Theme Integration

**What was integrated:** A full Greek Pantheon theme in both the main dashboard theme system and the observability scoped theme system, plus four new hub pages and 12 artwork images.

### 5.1 Main dashboard theme preset

- [ ] Navigate to `/config` or theme settings — verify **Greek Pantheon** theme preset is available
- [ ] Applying it re-skins the entire dashboard with teal (`#041c1c`) background and gold (`#dfb15b`) accents

### 5.2 New hub pages

Navigate to each route and confirm the page renders without errors:

- [ ] `/agents` — **Agents** page loads
- [ ] `/tools` — **Tool Use** page loads
- [ ] `/workflow` — **Workflow** hub page loads (this is where Observability lives)
- [ ] `/documents` — **Documents** page loads
- [ ] Default route `/` redirects to `/agents`

### 5.3 Artwork assets

```bash
ls public/images/*.png | wc -l
# Expected: 12
```

- [ ] 12 PNG images present: `abacus.png`, `alchemist.png`, `astrolabe.png`, `athena.png`, `book_quill.png`, `envelope_seal.png`, `labyrinth.png`, `library.png`, `mercury.png`, `oracle.png`, `orpheus.png`, `philosopher.png`
- [ ] Images are referenced correctly in AgentsPage/DocumentsPage (no broken image icons)

### 5.4 Pantheon border utility class

- [ ] `border-pantheon-single` and `border-pantheon` CSS classes render gold borders in the WorkflowPage sub-tab buttons

---

## 6. Developer Tooling

### 6.1 justfile recipes

```bash
just --list
```

Verify these recipes are present:

- [ ] `obs-server` — `cd observability/server && bun run src/index.ts`
- [ ] `obs-server-dev` — `cd observability/server && bun --watch src/index.ts`
- [ ] `obs-test` — `cd observability/server && bun test`

```bash
just obs-test
# Expected: 8 pass, 0 fail
```

### 6.2 Build gate

```bash
npx tsc --noEmit
# Expected: no output (exit 0)

npm run lint
# Expected: errors only in pre-existing files (App.tsx, ModelsPage.tsx, PluginsPage.tsx, SessionsPage.tsx, themes/context.tsx)
# Expected: ZERO errors in src/observability/**

npm run build
# Expected: "✓ built in ~Xs" with no TypeScript errors
```

- [ ] TypeScript: clean
- [ ] Lint: zero errors in `src/observability/`
- [ ] Build: succeeds

### 6.3 observability/README.md

```bash
cat observability/README.md
```

- [ ] File exists at `observability/README.md`
- [ ] Contains architecture diagram, quickstart steps, hooks list, env var table, feature list

---

## 7. Memory / Leak Check (C17 Protocol)

**What:** Verify canvas RAF loops and WebSocket connections are properly cleaned up when leaving and re-entering the Observability tab.

Steps:

1. Open browser DevTools → Console (clear any existing messages) and Performance monitor
2. Navigate to `/workflow` → **Observability** sub-tab — note baseline CPU%
3. Wait 5 seconds — confirm CPU returns to ~baseline (30fps RAF loop is throttled)
4. Click away to a different sub-tab (**Active Sessions**) — the ObservabilityPage unmounts
5. **Wait 3 seconds** — confirm CPU drops (RAF loop cancelled on unmount)
6. Return to **Observability** sub-tab — page remounts
7. Repeat steps 4-6 two more times (3 total mount/unmount cycles)

After 3 cycles verify:

- [ ] No `Cannot perform a React state update on an unmounted component` warnings in Console
- [ ] No `WebSocket is already in CLOSING or CLOSED state` errors
- [ ] No escalating CPU% (RAF loops not accumulating)
- [ ] `● live` / `○ offline` indicator behaves correctly after remount
- [ ] Canvas renders correctly after each remount (not blank or frozen)

---

## 8. End-to-End Smoke Test

Run both the obs server and the dashboard simultaneously and generate real events:

```bash
# Terminal 1
just obs-server

# Terminal 2
just dev
```

1. Open `http://localhost:5173/workflow` → click **Observability**
2. Confirm `● live` status
3. Open a new Claude session **in this project directory** (triggers `SessionStart` hook)
4. In the Observability pane:
   - [ ] A `SessionStart` event appears in the feed within ~2 seconds
   - [ ] The LivePulseChart shows a bar for that event
   - [ ] The agent pill for `trismegistus-dashboard` appears in the EventTimeline
5. Use a tool in Claude (e.g., read a file):
   - [ ] `PreToolUse` event appears with the tool name badge
   - [ ] `PostToolUse` event follows it
6. Click the `trismegistus-dashboard` agent pill:
   - [ ] A swim-lane opens with the agent's canvas
   - [ ] Event count increments as more events arrive
7. Open the ThemeManager, apply the **Greek Pantheon** theme:
   - [ ] Entire pane re-skins with teal/gold palette
   - [ ] Charts continue rendering (MutationObserver picked up the class change)
8. End the Claude session:
   - [ ] `SessionEnd` event appears
   - [ ] If `Stop` event was fired with chat: **💬 View chat transcript** button appears

---

## Summary Checklist

| Area | Items | Status |
|---|---|---|
| Obs server — startup & endpoints | §1.1–1.5 | |
| Claude Code hooks wiring | §2.1–2.3 | |
| Nav routing (WorkflowPage sub-tab) | §3.1–3.4 | |
| LivePulseChart | §4.1 | |
| EventTimeline + feed | §4.2 | |
| EventRow badges + expand/copy | §4.3 | |
| HITL event handling | §4.4 | |
| Filter panel | §4.5 | |
| Search | §4.6 | |
| Agent swim-lanes (token/cost, parent↳child) | §4.7 | |
| Chat transcript modal | §4.8 | |
| Theme manager (13 themes) | §4.9 | |
| HITL browser notifications | §4.10 | |
| Toast notifications | §4.11 | |
| Greek Pantheon main theme | §5.1 | |
| New hub pages (/agents /tools /workflow /documents) | §5.2 | |
| Artwork assets (12 PNGs) | §5.3 | |
| justfile recipes | §6.1 | |
| Build gate (tsc + lint + build) | §6.2 | |
| observability/README.md | §6.3 | |
| Memory / leak check (3x mount cycle) | §7 | |
| End-to-end smoke test | §8 | |
