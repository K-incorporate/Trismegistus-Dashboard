# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
React 19 + Vite 7 + TypeScript + Tailwind 4 SPA — the **Hermes Agent** dashboard frontend. It is the frontend only; an external Python "Hermes" backend serves it and provides all data.

## Commands (use npm here — not bun, despite global preferences)
- Dev server: `npm run dev` (Vite on `:5173`)
- Build: `npm run build` (`tsc -b && vite build`)
- Lint: `npm run lint` (`eslint .`)
- Typecheck: `npx tsc --noEmit` (also `just typecheck`; this is **not** a package.json script)
- **No test runner is configured.** Verify changes with build + lint + typecheck — do not invent a test command.

## TypeScript rules that will break the build
- `verbatimModuleSyntax: true` — import type-only symbols with `import type { X }`, never a plain value import.
- `erasableSyntaxOnly: true` — no `enum`, `namespace`, or constructor parameter-properties; use `const` objects / unions instead.

## A real dev session needs the backend
`npm run dev` alone serves an **unauthenticated shell** — every `/api/*` returns 401. For a functional session, run the Hermes dashboard backend (Vite proxies `/api` and `/dashboard-plugins` to `HERMES_DASHBOARD_URL`, default `http://127.0.0.1:9119`) or point `HERMES_DASHBOARD_URL` at a running one. The backend injects `window.__HERMES_SESSION_TOKEN__` / `__HERMES_BASE_PATH__` / `__HERMES_AUTH_REQUIRED__` at serve time; the checked-in `index.html` does not contain them.

## Conventions
- Import via the `@/` alias (`@/lib/api`), not relative paths (`@` → `src/`).
- Reach the backend through `src/lib/api.ts` (the `api` object / `fetchJSON`) — it sets the `X-Hermes-Session-Token` header and handles the 401→login redirect. `src/lib/gatewayClient.ts` is the JSON-RPC-over-WebSocket client (`/api/ws`). Don't hand-roll `fetch`.
- The dashboard plugin SDK surface — `window.__HERMES_PLUGIN_SDK__` / `window.__HERMES_PLUGINS__`, typed in `src/plugins/sdk.d.ts` — is a **versioned external API boundary**; don't change it casually (bump `SDK_CONTRACT_VERSION` for breaking changes).
- UI primitives come from the `@nous-research/ui` package.
