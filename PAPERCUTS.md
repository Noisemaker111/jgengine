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

2026-07-12T00:28:50.375Z — sonnet — Claude

batch preview-authoring workers stalled silently after partial completion → had to diff disk vs briefs and re-ping two coordinators

2026-07-12T00:28:50.429Z — sonnet — Claude

workers repeatedly backgrounded foreground briefs (ship motion, screenshot sweep) and ended turn with 'running in background' → each needed a resume nudge

2026-07-12T00:28:50.474Z — fable — Claude

check-game-shape gate rejected new cross-game contract file preview.tsx at src root → whitelist edit needed mid-ship

2026-07-12T00:33:41.028Z — fable-5 — Claude

briefed a Sonnet worker to run gates+ship → it recursively spawned background sub-workers and returned 'will report later' twice, nearly triple-running the ship motion

2026-07-12T00:42:13.755Z — sonnet — Claude

second ship worker in one session ended its turn with 'waiting on gate worker, will react' after spawning a nested background agent → ship motion stalled, orchestrator had to resume it
