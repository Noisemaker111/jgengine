# Papercuts

Small frictions hit while working — a retried tool call, a dead-end command, a
broken link, a confusing setup step, a flaky script, a stale cache, a misleading
error, a non-obvious gotcha, a task that took far longer than it should have, or
any solvable bump in the road. One or two sentences: what you were doing → what got
in the way (a guess at the cause or fix is a bonus). Log them in the moment, even
though none are blocking; together they show where the repo needs sanding down.

Distinct from CHANGELOG.md (what shipped) and from tracked issues (real bugs).

Log one:

    bun run papercut -m <model> "message"

Every so often these get swept: read the list, make the easy fixes, clear them.

---

2026-07-18T14:14:38.795Z — claude-fable-5 — Claude

capturing editor screenshots via drive: camera_goto only pans the orbit target with no distance/pitch control and KeyF framing can bury the camera in terrain/buildings — getting a usable aerial of a district took ~8 drive round-trips of guessing y offsets

2026-07-18T15:28:59.258Z — claude-fable-5 — NoisemakerJon

driving screenshots via 'bun run drive' with --rpc JSON → guard.ts arg requoting corrupts the JSON payload (Unterminated string); had to invoke scripts/drive-dev.ts directly

2026-07-18T15:46:51.967Z — claude-fable-5 — NoisemakerJon

Shooting close-ups from different vantage points → no way to override player spawn per-shot; had to mutate editor.scene.json player_spawn via python heredocs three times and hand-restore. shoot needs a --spawn x,y,z flag / ?spawn= URL param overlay (like ?cam=) so screenshots never mutate authored scene content.

2026-07-18T16:20:39.762Z — claude-fable-5 — Claude

Rebasing a feature branch via stash/rebase/stash-pop → pop left conflict markers in a file I'd already verified; ship:preflight passed anyway (it checks tree/base/diff, not compilation), so the broken file reached CI. A cheap conflict-marker grep or tsc-on-changed-files in agent-preflight --ship would have caught it locally.

2026-07-18T16:51:34.018Z — claude-fable-5 — Claude

capturing editor screenshots in the dev runner → 'assets pull' run from repo root provisions public/models at the repo root, but apps/dev serves apps/dev/public — the runtime error's suggested fix leaves the dev runner still 404ing until the pack is copied into apps/dev/public/models

2026-07-18T16:54:13.275Z — claude-fable-5 — NoisemakerJon

gate/test:all in the cloud container → 7 pre-existing failures identical on origin/main: msys tar parses 'C:\...' as a remote host (Cannot connect to C: resolve failed) in tarball clean-consumer tests, plus 3 model-pack texture-URI tests; gate can never pass locally on Windows containers — needs tar --force-local or bsdtar and a look at the pack tests

2026-07-18T16:59:02.348Z — cloud-agent — Claude

Running bun run gate on a fresh cloud container → agent:preflight fails on missing node_modules before build's ensure-ready --install-only can run; had to bun install manually first. Preflight could auto-install or point at ensure-ready.

2026-07-18T17:39:17.438Z — cloud-agent — Claude

Fresh branch off origin/main can't pass its own gate: check-content-gate fails because coordinate-literal-baseline.json lists Games/the-robots/src/game/world/zones.ts which no longer trips the lint (baselines only shrink). Every session that runs the gate hits this red before touching any real work — the shrinking baselines need reseeding on main (bun run check-content-gate --update) or a CI job that keeps them trimmed.

2026-07-18T17:39:17.470Z — cloud-agent — Claude

gen:capabilities has no encoding guard: the container's non-UTF-8 locale (LANG=, LC_CTYPE=POSIX) let mojibake em/en-dashes get committed into core JSDoc (gameContext.ts, commandApply.ts). check-capabilities then only reported 'stale — run gen:capabilities', and running that FIX faithfully copies the corruption into the committed skill docs. A cheap grep for the mojibake byte-signature in the gate (or in gen-capability-index) would catch corruption at the source instead of laundering it through the generator. (Locale now pinned to C.UTF-8 in .claude/settings.json to stop new corruption.)
