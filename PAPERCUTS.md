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

2026-07-09T23:50:48.991Z — claude-sonnet-5 — Claude

Building tideway (regatta racing game): assets add/pull for kenney-pirate and other CDN packs (kenney.nl, quaternius.com, poly.pizza) all failed with proxy CONNECT 403 — this sandboxed session has no outbound access to any asset provider host, so real GLB models are unreachable; built the game with procedural low-poly three.js primitive geometry (renderObject/renderEntity) instead of pulled asset packs.

2026-07-10T00:20:12.284Z — claude-sonnet-5 — Claude

Spawned a general-purpose worker to run check-types/tests; it backgrounded the bun commands itself and returned 'Both workers running in background, I'll wait for their results' as its final answer instead of the actual results — had to relaunch a second worker with explicit 'run synchronously, don't background' instructions to get a real report.

2026-07-10T00:20:18.720Z — claude-sonnet-5 — Claude

Fresh cloud session had incomplete node_modules — bun run check-types failed with 'tsgo: command not found' and tests failed with 'Cannot find package three' across the whole repo, unrelated to the diff being verified. Had to run a manual bun install (64s) before verification could produce a real signal; a stale/missing install in a supposedly-ready session container wastes a full verify round-trip.

2026-07-10T00:33:50.149Z — claude-fable-5 — Claude

Batch worker ran a stray 'bun install' mid-parallel-build; interrupted install left node_modules half-extracted, failing check-types/tests repo-wide with phantom TS2307s until a clean reinstall — parallel workers must never run installs

2026-07-10T00:44:29.170Z — claude-sonnet-5 — Claude

canyon-chase build: assets add / pull kenney-nature and kenney-racing to source real GLB props (rocks, cacti, cars) → blocked, proxy policy-denies kenney.nl/quaternius.com/poly.pizza (403 on CONNECT) in this sandbox with no mirror configured, so this session's games ship with primitive/colored-box props instead of real assets

2026-07-10T01:35:49.041Z — claude-opus-4-8 — Claude

auto-thumbnail poster capture → maze-muncher and commit-canopy render an empty 3D scene at their default play camera (poster stddev <4); their old committed screenshots only looked non-empty because the HUD DOM was in frame. Real camera-framing gap: these games' world content isn't in the default camera view.

2026-07-10T03:18:15.694Z — claude-fable-5 — Claude

verifying turbine-city changes in a fresh container → bun run check-types fails with cascading TS2307 Cannot-find-module @jgengine/* errors until bun run build has run once, because package exports point at gitignored dist/; CI already orders build before check-types but nothing tells a fresh session that check-types alone is not self-sufficient

2026-07-10T03:43:12.752Z — Fable 5 — Claude

Ship worker backgrounded its sleep/sub-agent and ended its turn — background children die with the turn — so the ship motion stalled twice and needed SendMessage resumes. Worker briefs should say the 60s wait runs inline.

2026-07-10T03:43:12.798Z — Fable 5 — Claude

Skipped logging a papercut mid-session because the CLAUDE.md wording read like the entry would need its own ship cycle; nothing said papercuts ride along in the next PR.

2026-07-10T04:50:45.550Z — grok — NoisemakerJon

shell PATH missing bun → bun not recognized; needed full path C:\Users\Jk101\.bun\bin\bun.exe

2026-07-10T05:38:06.748Z — sonnet — Claude

ship-motion worker ended its turn during the 60s CI sleep instead of finishing the Actions check → needed a second worker to complete the green check
