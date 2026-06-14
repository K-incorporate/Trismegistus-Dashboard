# Observability — Hermes Agent Dashboard

Real-time multi-agent observability for Claude Code sessions. Displays a live event feed, per-agent canvas swim-lanes, token/cost rollups, and HITL notifications inside the Hermes Dashboard frontend.

## Architecture

```
observability/
  server/          # Bun event ingestion server (port 4000)
    src/
      index.ts     # HTTP + WebSocket, async transcript enrichment
      db.ts        # bun:sqlite, WAL mode
      enrichment.ts # transcript cost parsing
      theme.ts     # theme CRUD endpoints
      types.ts     # shared type definitions
    tests/         # bun test suite (8 tests)
src/observability/ # React client (embedded in dashboard at /observability)
  lib/             # types, config, agent identity, colors, emojis, themeData
  hooks/           # useObservabilityWebSocket, useChartData, useEventSearch, useHITLNotifications
  components/      # EventRow, EventTimeline, LivePulseChart, AgentSwimLane*, ChatTranscript*, ThemeManager*
  pages/           # ObservabilityPage.tsx
  styles/          # observability-themes.css (all selectors scoped to .obs-root)
```

## Quick start

```bash
# 1. Install server deps (first time only)
cd observability/server && bun install

# 2. Run the event server
just obs-server          # production
just obs-server-dev      # file-watch reload during development

# 3. Run the dashboard
just dev                 # Vite on :5173, proxies /obs → localhost:4000
```

The server listens on `127.0.0.1:4000`. The dashboard Vite proxy forwards `/obs/*` to it.

## Claude Code hooks

`.claude/hooks/` contains Python scripts that fire on Claude Code lifecycle events and POST to `http://127.0.0.1:4000/events`. The hooks are wired in `.claude/settings.json`.

Supported events: `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Stop`, `SubagentStart`, `SubagentStop`, `UserPromptSubmit`, `Notification`, `PreCompact`.

## Testing the server

```bash
just obs-test
# or directly:
cd observability/server && bun test
```

## Environment

| Variable | Default | Description |
|---|---|---|
| `OBS_PORT` | `4000` | Server listen port |
| `OBS_DB_PATH` | `./obs.db` | SQLite database path |

## Dashboard features

- **Live feed** — real-time event stream with regex search and filters
- **Pulse chart** — 30fps canvas bar chart, 1m/3m/5m/10m time windows
- **Agent swim-lanes** — per-agent canvas with token/cost rollups and parent↳child links
- **Theme manager** — 13 predefined themes (including Greek Pantheon) scoped to `.obs-root`
- **HITL notifications** — browser Notification API alerts for human-in-the-loop requests
- **Chat transcripts** — inline message viewer with 9 filter chips
