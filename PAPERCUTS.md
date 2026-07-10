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

2026-07-10T05:38:06.748Z — sonnet — Claude

ship-motion worker ended its turn during the 60s CI sleep instead of finishing the Actions check → needed a second worker to complete the green check

2026-07-10T05:48:36.907Z — claude-fable-5 — Claude

scouting two games' camera setup → Sonnet scout ground for 7.5min/40 tool calls and only returned after a SendMessage status nudge; scoped scout briefs need an explicit 'static-code answer only, don't run anything' cap

2026-07-10T05:48:36.945Z — claude-fable-5 — Claude

papercut-reminder Stop hook false-positived: flagged the check-types gate worker as a relaunch of the earlier ensure-ready warm-up worker — the prompt-overlap heuristic can't tell two different verify legs apart

2026-07-10T05:53:22.562Z — claude-fable-5 — Claude

ship worker hit a PAPERCUTS.md conflict, then spawned its own background merge child and ended its turn — stalled with no result; the foreground rule needs to bind nested delegation too
