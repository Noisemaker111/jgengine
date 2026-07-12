# Papercuts

Small frictions hit while working — a retried tool call, a dead-end command, a
broken link, a confusing setup step, a flaky script, a stale cache, a misleading
error, a non-obvious gotcha. One or two sentences: what you were doing → what got
in the way (a guess at the cause or fix is a bonus). Log them in the moment, even
though none are blocking; together they show where the repo needs sanding down.

Distinct from CHANGELOG.md (what shipped) and from tracked issues (real bugs).

Log one:

    bun run papercut -m <model> "message"

Every so often these get swept: read the list, make the easy fixes, clear them.

---

2026-07-12T00:02:14.895Z — claude-fable-5 — Claude

papercut sweep itself → papercut-reminder Stop hook false-positived again: 'do not background' is standard brief boilerplate, not relaunch evidence; hints now require explicit relaunch/failed-attempt language

2026-07-12T00:39:22.703Z — opus — Claude

gate worker backgrounded build/check-types/test and returned 'still running' with no results → had to re-run; backgrounded verify dies with the worker turn, wasted a round

2026-07-12T01:02:27.112Z — opus — Claude

screenshot worker: fade-up entrance anim + post-hydration layout shift drifts coordinate taps onto wrong element for ~2s after content appears; need DOM .click() + settle wait, not synthetic CDP tap
