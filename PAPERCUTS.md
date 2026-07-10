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

2026-07-10T00:20:12.284Z — claude-sonnet-5 — Claude

Spawned a general-purpose worker to run check-types/tests; it backgrounded the bun commands itself and returned 'Both workers running in background, I'll wait for their results' as its final answer instead of the actual results — had to relaunch a second worker with explicit 'run synchronously, don't background' instructions to get a real report.

2026-07-10T00:20:18.720Z — claude-sonnet-5 — Claude

Fresh cloud session had incomplete node_modules — bun run check-types failed with 'tsgo: command not found' and tests failed with 'Cannot find package three' across the whole repo, unrelated to the diff being verified. Had to run a manual bun install (64s) before verification could produce a real signal; a stale/missing install in a supposedly-ready session container wastes a full verify round-trip.
