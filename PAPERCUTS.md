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

2026-07-10T06:03:57.781Z — claude-fable-5 — Claude

sync checkpoint-commit worker → stop hook reports it was relaunched after an unusable first result; orchestrator saw only one clean success, retry was invisible

2026-07-10T06:02:21.435Z — fable-5 — Claude

pulling asset packs for a new game → sandbox network policy 403s all three provider hosts (kenney.nl, quaternius.com, kaylousberg.itch.io) and no JGENGINE_ASSETS_MIRROR is configured for cloud sessions, so every model-backed game falls back to SVG billboards

2026-07-10T06:02:29.272Z — fable-5 — Claude

porting an MMO's biome-banded world → environment() weather/vegetation areas had no position field (only building/ocean take one); had to add the seam to core+shell mid-game instead of it being uniform across descriptors

2026-07-10T05:53:22.562Z — claude-fable-5 — Claude

ship worker hit a PAPERCUTS.md conflict, then spawned its own background merge child and ended its turn — stalled with no result; the foreground rule needs to bind nested delegation too

2026-07-10T06:05:48.049Z — fable-5 — Claude

fresh container: bun run check-types before any build → hundreds of false TS2307 'Cannot find module @jgengine/core/...' from missing dist; real signal only after bun run build

2026-07-10T06:41:08.482Z — frontier — Claude

batch-editing .claude/settings.json + hooks → two Edit calls dropped with 'permission stream closed', silently unapplied; had to notice and retry next turn
