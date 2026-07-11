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

2026-07-10T06:22:13.971Z — sonnet-5 — Claude

ship worker's 60s wait: brief said 'sleep inline, do not background' yet worker still armed a Monitor and ended its turn — needed a SendMessage resume; the inline-wait rule needs to be enforced, not just briefed

2026-07-10T06:41:08.482Z — frontier — Claude

batch-editing .claude/settings.json + hooks → two Edit calls dropped with 'permission stream closed', silently unapplied; had to notice and retry next turn

2026-07-10T06:44:19.939Z — frontier — Claude

ship worker briefed to run the whole ship motion in the foreground → spawned a background child for it and ended its turn ('will report back'), stalling the green check; repeat of the known nested-delegation gap

2026-07-10T06:47:35.010Z — fable-5 — Claude

jgengine's three engine skills lived in top-level skills/ where Claude Code never surfaces them — no session ever auto-invoked jgengine-api, so games hand-rolled primitives the engine already had; skills must live in .claude/skills with tight model-invocable descriptions, now gate-enforced

2026-07-10T15:17:27.120Z — fable-5 — Claude

verifying loot-shooter → root check-types reported green twice while Games/loot-shooter had 7 TS errors; root gate skips Games/*, only the game-local check-types catches them

2026-07-10T15:25:12.398Z — fable-5 — Claude

CLAUDE.md ship rule says 'sleep ~60s in the foreground — a backgrounded sleep dies with the worker's turn' but the harness BLOCKS foreground sleep in Bash, so every ship worker stalls on a detached timer at the CI check (4 stalls this session); the rule needs a harness-compatible mechanism (e.g. retry-with-delay inside one command: 'sleep 60 && check' as a single Bash call, or a Monitor-based pattern documented in the ship motion)

2026-07-10T15:32:40.319Z — fable-5 — Claude

chasing a 'wrong world map shows in every game' report → the dev runner silently swapped in the demo game for any unresolvable game id (gameRegistry[GAME_ID] ?? gameRegistry.demo), so a bad id looked like a content leak instead of erroring; made it a loud Unknown-game error

2026-07-10T15:32:40.361Z — fable-5 — Claude

fixing minimap rotation → MinimapView.rotate's JSDoc said 'pass the facing bearing' but the math needed its negative, and the compensating -heading lived in the react layer; drift-district followed the doc literally and spun its map backwards — doc and math now agree

2026-07-10T15:35:48.981Z — fable-5 — Claude

Phase 2 verify → root check-types validates against packages/*/dist without rebuilding; a stale dist (pre-pull main + new core event) produced 20+ phantom errors in shell/cartridge/registry — check-types should depend on build or check against src

2026-07-10T15:50:24.278Z — fable-5 — Claude

resetting session branch onto origin/main → stop-hook flags GitHub's own squash commits (noreply@github.com) as unverified-and-unpushed, demanding a rebase that would diverge from main

2026-07-10T16:09:06.631Z — fable-5 — Claude

after branch reset onto origin/main, running check-types without build → shell fails on stale packages/core/dist (missing new core modules) while CI is green; check-types alone never rebuilds dist

2026-07-10T16:38:25.372Z — sonnet-5 — Claude

ship-motion workers keep backgrounding the post-merge 60s sleep even when told 'foreground, never background' — turn ends, green check never runs, orchestrator re-spawns a verifier every phase

2026-07-10T17:23:54.775Z — sonnet-5 — Claude

shoot --url skips ensureServer so the shot soft-times-out unless a dev server is already running — caller must boot vite manually

2026-07-10T22:58:21.043Z — fable-5 — Claude

orchestrating 14 parallel game-build workers → freecell build worker's first run died with an unusable result and had to be relaunched by the harness

2026-07-10T23:15:22.584Z — fable-5 — Claude

parallel game builds with bun install forbidden mid-batch → session container had no node_modules, workers had to typecheck via tsgo from the bun cache and skip @types/react resolution

2026-07-10T23:18:24.805Z — opus-4.8 — Claude

persisting a mutable single-player credit bank in video-poker → game/recordBook is monotonic-only and the save system is host-authoritative overkill; no lightweight local KV persistence primitive, fell back to raw RecordStorage

2026-07-10T23:18:58.003Z — opus-4.8 — Claude

importing HUD primitives in a game → bare @jgengine/react barrel import only resolves against built dist; game tsconfig paths map @jgengine/react/* subpaths only, two builders independently had to discover the /hudLayout subpath

2026-07-10T23:19:24.750Z — opus-4.8 — Claude

wiring swipe controls for a hud-presentation game → touch.gestures/buttons are inert under presentation:'hud' (shell mounts TouchControlsDock only in the 3D branch), had to hand-wire swipe on the board canvas

2026-07-10T23:19:24.784Z — opus-4.8 — Claude

binding snake steering → reserved action names turnLeft/turnRight are swallowed by the shell even in hud mode with no camera rig, renamed to steer*

2026-07-10T23:19:55.635Z — opus-4.8 — Claude

building klondike/video-poker card UIs → @jgengine/react ships no playing-card face or stacked-pile component, every card game hand-rolls rank/suit rendering and drag piles; candidate registry component

2026-07-10T23:23:57.038Z — opus-4.8 — Claude

building sokoban level-select → game/levelSequence has no jump-to-level select() and tracks no per-level stars/completion; campaign frontier had to be reseeded from recordBook records

2026-07-10T23:49:11.581Z — fable-5 — Claude

judging game screenshots → custom classes in a game's src/index.css silently never load in the dev runner/shoot (only standalone main.tsx imports it); games styled with custom CSS render as raw text — only Tailwind utilities from the dev app @source scan work

2026-07-10T23:58:14.583Z — opus-4.8 — Claude

klondike HUD invisible in shots → HudCanvas renders its region divs before children, so an opaque full-screen child (felt background) silently paints over every portaled HudPanel; backgrounds must live behind HudCanvas, not inside it

2026-07-10T23:22:05.695Z — sonnet — Claude

verifying asset pack URLs for #308 → WebFetch returned 403 on every URL (tool-level proxy outage, even example.com) and curl CONNECT also 403 — had to fall back to WebSearch-only cross-checking

2026-07-10T23:25:53.324Z — sonnet — Claude

ship-motion worker told to sleep 60 in the foreground before the Actions check → worker backgrounded the sleep and its turn ended, leaving the green check unreported (happened on two consecutive ship workers)

2026-07-10T23:45:41.127Z — sonnet — Claude

surveying all 37 games' environments in one scout → worker died on API server error mid-run, resumed via SendMessage and finished fine

2026-07-10T23:51:04.164Z — sonnet — Claude

running repo-root check-types → its --filter '*' pass emitted no Games/* lines, so the repo-wide gate may silently skip all games; per-game tsgo runs were needed for a direct signal

2026-07-11T00:07:26.896Z — sonnet — Claude

shipping via worker chain → three consecutive workers returned garbled/placeholder final messages (survey, remap, ship), each needed manual state inspection and takeover
2026-07-11T03:32:23.250Z — gpt-5 — unknown

auditing onboarding copy -> PowerShell quoting broke a targeted rg command

2026-07-11T04:35:53.206Z — opus-4.8 — Claude

adding pad tones to a hud-presentation game → audio is suspended-silent for presentation:'hud' games: GamePlayerShell only calls audioEngine.resume() in the 3D branch's onPointerDown, playOneShot doesn't self-resume, and AudioEngine isn't reachable from ctx — shipped visual-only

2026-07-11T05:07:32.431Z — sonnet — Claude

bun run check-types → bun run --filter "*" check-types silently matches 0 of 66 Games/* workspaces (confirmed via bun pm ls vs --filter '@games/klondike' → 'No packages matched the filter') even though bun.lock/pm ls register them correctly — the root check-types gate has never actually type-checked any Games/* code; had to fall back to bun run --cwd Games/<id> check-types per game

2026-07-11T07:23:58.444Z — claude-opus-4-8 — Claude

wiring a headless boot smoke gate → picked a DOM-only game (blackjack) whose play-mode capture handshake waits for a <canvas> that never renders, so it timed out; no cheap signal tells you which games are canvas vs pure-HUD before a full boot round

2026-07-11T16:03:47.453Z — sonnet — Claude

delegating the ship motion → Sonnet ship-workers twice returned an announcement ('running in background, will report') and ended their turn without committing/pushing/merging, so the ship silently didn't happen and had to be re-sent with 'execute in THIS turn'; a ship brief needs the worker to actually run the motion, not narrate intent

2026-07-11T18:35:57.142Z — opus-4.8 — Claude

authored core settings/keybind persistence by copying shell's fovPreference.ts (the documented house-style for persisted prefs) → it uses the DOM `Storage` type, which core has no lib for, so the build failed; the 'copy fovPreference' guidance doesn't flag that it's shell-only and DOM types don't exist in core

2026-07-11T20:44:47.432Z — Sonnet 5 — Claude

retrofitting settings trigger onto frostbite-circuit → top-right corner already occupied by MemoryMap widget, exemplars (canyon-chase/platform-hopper) didn't cover the occupied-corner case, had to improvise by nesting the trigger into the existing widget's header row

2026-07-11T20:55:48.822Z — claude-opus-4-8 — Claude

Sweep briefs listing N games to a single Sonnet worker → the worker treated it as an orchestration task and spawned N sub-workers (some spawning sub-scouts producing 100k-token digests), deep-nesting the fan-out and inflating cost/latency far beyond N inline edits. A per-item brief needs an explicit 'do these yourself, do not delegate' or it recursively fans out.

2026-07-11T22:32:30.217Z — claude-opus-4-8 — Claude

post-merge 60s green-check worker → Sonnet backgrounded its foreground sleep and returned 'waiting on the 60s sleep' with no Actions result, forcing a relaunch to actually read the merge-commit runs

2026-07-11T23:06:32.648Z — sonnet — Claude

ship worker spawned a nested background worker and returned 'running in background' as its final result → orchestrator got a status echo instead of the PR/merge/CI report

2026-07-11T23:17:31.334Z — sonnet — Claude

ship briefs → workers repeatedly return 'launched in background' as final result without committing; ship motion stalled three times
