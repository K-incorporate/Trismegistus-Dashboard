---
name: verify-build
description: Verify changes to this dashboard by running the repo's real check chain — lint, typecheck, and production build. Use after making code changes here, since there is no test runner.
---

# Verify Build

This repo has **no test runner**. Verify changes by running these from the project root, in order:

1. `npm run lint` — ESLint (`eslint .`).
2. `npm run build` — `tsc -b && vite build` (type-checks via project references, then bundles). This is the authoritative "did I break it" check.

For a faster type-only pass without a full bundle: `npx tsc --noEmit`.

Report any failures with the offending `file:line` and the message. A change is **verified** only when both lint and build pass clean.

This is **static** verification — it does not exercise runtime behavior. A functional dev session needs the external Hermes backend (see `CLAUDE.md`); for behavioral checks use the bundled `/verify` or `/run` skills.
