## How to talk to me (MANDATORY, read first)

Follow this in every message you send me, whatever the task. Ignoring it is a failure, the same as broken code.

Be brief but clear. Give me enough context to understand and decide, and nothing more. Cut background, recaps of what you did, and lists of minor issues that don't change my next action.

Keep it plain. No emoji, headers, bold, or nested bullets. Write short sentences in plain words. Use a simple numbered list only when I'm picking between options.

Put the point first: the result, or the one thing you need from me.

Make asks concrete. If you need something from me, ask the actual question. Never point me to a file or issue to find out what you're asking. Give at most 3 options. Mark your recommendation. Give each option 1-2 plain sentences: what it does and why it matters.

Decide what you can. Don't ask about anything you can reasonably decide yourself. Only ask about things that are risky or can't be undone (deploying, publishing, deleting, spending money). When what you needed to decide was not in front of you, decide from the evidence and write the answer where the next agent will read it, so nobody asks again.

Keep the noise out of chat. Put bugs, follow-ups, and blocked work in a tracking file, not in the message. Mention them only if they need me now.

Example of a good reply:
Done and merged. What next?

1. Fix the repeated breakages (recommended). Four process bugs caused most of tonight's rework, like duplicate library entries breaking beta and sessions colliding on shared files. Fixing them makes every future session faster.
2. Release. Beta has a day of engine changes that aren't on npm or jgengine.com yet. This publishes them and redeploys the live site, so it needs your OK.
3. Get the blocked game art. Three games are stuck because the cloud can't reach the sites hosting their art. The asset mirror might be able to, which would unblock all three.

# JGengine repository governance

This file holds how this repo builds, tests and lands, and what "done" means here. Rules for every repo live in `~/.config/opencode/AGENTS.md`; project facts (packages, layering, commands, publishing) live in [README.md](README.md). Neither is restated here. Claude Code reads this file; `CLAUDE.md` must not exist.

## Project purpose

JGengine is measured by the time from an idea to a deep playable game, so friction an agent hits while building a game is an engine bug to fix. Games in `games/` exist to improve the shared framework: trace a game symptom to its real cause (the engine contract, its adoption, or the game's own rules) before fixing it, because an obstructed HUD was patched with game-local CSS and apparent sinking with a guessed offset, and the engine kept the bug.

The engine is small general systems that combine into any game; it never ships a game's feature as one closed thing. A supply drop is a game combining a schedule that spawns things at a pace from a start time, a rarity table, an access rule tied to that rarity, a loot pool per rarity, and a motion and landing animation, so the game's tick says `spawnSupplyDrop(x, y, "purple")` in a few lines it wrote. Breeding, taming, boss fights and police break down the same way. The test for each piece: a game that wants only part of it uses that part and throws nothing away. Much of today's code was built for one game and is being taken apart, so build the systems a feature should have been made of instead of copying its shape.

## Product invariants

- **World content is authored in the editor.** Placement, terrain, paths, zones, foliage and assets live in `editor.scene.json`, authored through the editor GUI or RPC/CLI. Changing visible world content is an editor task first; if the editor cannot express it, file a `[FEATURE]` issue before any code fallback, and never hardcode coordinate arrays a scene can own.
- **Reusable capability goes upstream first.** Name the shared owner before editing a game; adopt what exists or fix its package. Anything another game could need goes in `packages/*` as a narrow, configurable seam with a real adopter.
- **Build for every game.** Every engine feature is separate parts a game can switch off, swap or retune, named for the general idea (a summoned encounter, not an obelisk boss; a growth stage list, not ARK's baby/juvenile/adolescent). Fixed lists (stages, tiers, body plans, damage types, camera views, difficulty levels) are data the game supplies, and a game's numbers live in its config, never in engine defaults, names or docs. No presets, archetypes or one fixed API per genre or vehicle class. A folder no in-repo game imports is deleted; git keeps it. The exception is a physical model checked against published data: that is engine ground truth and stays.
- **Build from the parts.** Before writing a `create*` factory or a feature folder, name the parts it combines ([README.md](README.md#the-parts)). A bounded value, a tier list, a stage list, a pace over time, a spawn location, a weighted pick, a condition, a modifier stack, an inherited value or a path over time uses that part's home, never its own copy; a part that lacks something gets it added there, with a test.
- **Simulations are separate effects.** Every physical effect (tyre slip, weight transfer, drag, wind, buoyancy and the rest) is its own named term with its own strength, a multiplier from 0 (off) upward where 1 is exactly what the reference measures, plus its own parameters with the reference value as default; never one realism slider for the whole body. Every effect stays finite, bounded and monotone over the whole dial, and its documented sane range is tested at both ends. Defaults per class come from the reference data, and a fleet of hundreds of vehicles is one record per vehicle from a class plus overrides, never new code. Reference sims live in `scripts/reference/`, run in CI, measure every effect they can against published data and list each gap; a new one needs the published data it reproduces, not a game adopter.
- **Trees are held to the forestry tables, with one envelope for every species and no per-species exception list.** The decision, the numbers and why they are what they are sit in the header of `packages/core/src/plants/species/data/plantLibrary.test.ts`; read it before touching a tree check or a species record. Appearance is a fit objective (`bun run jgengine plants fit --until-pass`), never a test exemption: three PRs in one day loosened, tightened and then deleted those checks because each agent chose for a few species by eye.
- **Respect layering** ([README.md](README.md#layering)); `bun run check layers` enforces it. `core` never depends on frameworks, rendering, browser, backend or game code.
- **Scale by default.** Serializable state, injected deterministic randomness, bounded work, allocation-aware hot paths, no full-world per-frame scans, no single-player-only contracts.
- **Stateful primitives keep state, storage and policy reachable.** A `create*` factory with mutable state exposes `snapshot()`/`state()` and `restore()`/`reset()` (`cards/cardPile.ts`), takes storage as an injected interface (`game/keyValueStore.ts`), and keeps play-time values retunable (`vehicleDynamics.ts` `retune`).
- **Types are the first test.** `core`, `shell` and `ws` type-check with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature` and `noImplicitReturns` on top of `strict`. Fix an error with a guard, a real type or a `T | undefined` helper, never `any`, `!`, `as` or `@ts-ignore`; an escape that truly cannot be avoided says `// type-escape: <why>` on its line.
- **Games own their UI composition; the engine ships the parts.** Inventory, windows, vitals, action bars, currency and minimaps are `packages/*` blocks reskinned with the UI kit's tokens. Every game has its own look, a real main menu, a settings surface and in-game credits.
- **Never use Kenney assets.** Prefer Quaternius or KayKit (3D), game-icons.net (icons), ambientCG (PBR). Credit sources in `CREDITS.md` and, for player-facing work, in the HUD and website.

## Layout

- **One feature, one folder.** A feature's model, view, draw code and tests live together in `packages/core/src/<feature>/`; the file name says the layer: `hudLayout.ts` (model), `kitHud.view.tsx` (React), `WorldHud.draw.tsx` (three.js). `packages/shell` and `packages/react` hold only package glue; every feature, world and render ones included, lives in its core folder.
- **Names say what the thing is**: `notificationCenter.ts`, not `store.ts` or `utils.ts`. One exported name has one definition engine-wide.
- **The folders are the map.** `bun run find <words>` names the feature folder; `bun run find --text <regex> [--in <dir>]` searches text. Never a hand-kept concept list or a recursive listing. Moving a concept home moves its files, deletes duplicates and fixes every importer and game in the same PR.
- Code comments default to none. Exported public API keeps tight JSDoc (it generates `api.md` and `capabilities.md`). Inside a function, comment only a non-obvious why.

## Game changes improve the framework

0. **Plan first.** A new game or big feature starts with the [`create-game-jg`](.claude/skills/create-game-jg/SKILL.md) skill: agree the direction, map every feature with one `bun run jgengine has <feature> ...` call, write `games/<id>/PLAN.md`, then build milestone by milestone. Milestone 1 is the core loop playing from second 0. A milestone is a commit on the idea's branch that ticks it in `PLAN.md`, not a PR of its own.
1. Separate the game's rules, content and presentation from reusable behavior, and check engine `beta` before declaring a gap.
2. Ship the milestone first. A mechanism only one game wants stays in that game with an issue naming the seam; the second game that wants it builds it upstream as the general systems it is made of, with each game's numbers in its config. A milestone never waits for engine work it can ship without.
3. Land the engine change and the game change in one PR, and delete the superseded game-local code in it. Games run engine source from the same commit, so npm releases never gate a games change.

**No legacy code.** An engine change that breaks an in-repo game fixes that game in the same PR: no shims, no deprecated aliases. Outside users are protected by npm versions only: a breaking change gets a semver bump and a short migration note in `changes/`. Games-side rules are in [games/AGENTS.md](games/AGENTS.md#framework-first-development).

## Runtime and verification

- Cold checkout: `bun run agent:bootstrap` (lock-guarded; `--check` confirms). Never kill a slow `bun install`. Docs-only work needs no install.
- Tests, type-checks and `bun run gen` read package source; `bun run build` is only for packing and the Node CLI. Package scripts: `bun --cwd=packages/<pkg> run <script>`; the space form silently runs nothing.
- Root commands are one per tool and `bun run <tool> --help` lists its verbs and flags: `check [name...]` (`--list`), `gen`, `test`, and `worktree`, `background`, `perf`, `games:capabilities` with a verb. Each check, generator and verb is one row in `scripts/run-stages.ts` or its dispatcher; add a row, never a root script. Do not add `check-*` gates: a gate costs every lane on every landing, and a rule here is enough for a one-off.
- Worktrees: `bun run worktree new <name>` under the main checkout's `.claude/worktrees/`, never nested, never under `C:\tmp`; it shares the main install and the asset store, so it is ready in about 10 s. To add or change a dependency in one, first `rm node_modules` (the link only), so the install writes the worktree's own copy. `bun run worktree doctor` finds broken worktrees and `worktree reap` removes merged ones. Your own scratch files go in the session scratchpad, never the repo; `.scratch/` is only where tools write their output.
- Windows: Git Bash has no `python3` (use `python`; set `PYTHONUTF8=1`, and pass `newline='\n'` when writing files). Scripts spawn System32 `tar.exe`, which takes `C:` paths; GNU tar in Git Bash needs `--force-local`.
- While iterating, `bun run verify:fast` runs the tests and gates the branch's diff reaches, in seconds; the tests named after the changed files run first, and a red step prints each failing file's first error, the command that reruns only it, and the UTF-8 log under `.scratch/verify-fast/`. Its result is partial by design and says so; `--plan` lists the steps, `--no-cache` reruns units that passed on the same bytes, and `--full` runs what CI runs, only to reproduce a CI failure. `bun run preflight` runs the type-checks and every gate CI's `quick` and `types` jobs run (the ones it skips are in `CI_ONLY_GATES` with a reason). A red `bun run check` or `bun run test` ends the same way: the failing files, the rerun command, the log.
- A check must be able to fail. `bun scripts/gate-proof.ts` breaks the product with a known regression, requires `verify:fast`, `check` and `test` to go red naming the file and the rerun, and restores the tree. Run it after changing a gate's output or selection, or before trusting a green you did not see fail: one break of `pick.ts` once reached a thousand tests and the red named a loot table while the file's own test never ran.
- Screenshots back pixel claims: `bun run shoot` or `bun run drive <game> --flow <name>` per `jgengine-verify`, never a hand-rolled Vite app. Captures are limited by evidence, not a count: when one fails, read why, fix it, capture again.

## Change governance

- **One idea, one branch, one PR.** An idea is what Jon (or the brief) asked for in one go: a feature, a game's milestones, a fix and the cleanup it implies, the engine seam and every game that adopts it. It gets one worktree and one branch from current `origin/beta`, many commits, and one landing at the end. Never split an idea into PRs by milestone, package, issue or step: every PR pays a full landing and rebases against every other. Only an unrelated finding becomes its own idea. Never stack on a merged branch; follow the `workflow` skill.
- **Commit as you go**: after each step that works, `git add <its paths>` and `git commit -m "<one plain line of what changed>"` (`Fixed:` / `Added:` / `Removed:` / `Migrate:` pick the changelog heading). Those lines become the PR body and release note, so each describes the whole change: a title about one marker over a diff that removed checks across 180 files hid the change from everyone.
- A helper session given part of someone else's idea works in its own worktree on a branch from the idea's branch, commits and pushes, and does not land; the idea's owner merges that branch and lands once.
- **Land once, at the end, with `bun run lane:close`** (`-m "<what changed>"` to say it in other words than the commits; `-m "Closes #N"`; for a bugfix `-m "Root cause: ..."`): it runs `preflight`, then `verify:fast`, then commits, pushes, rebases, opens the PR and hands it to the merge queue; nothing runs by hand before it. It takes several minutes: run it in the foreground with a 10-minute timeout. **The idea is done when its PR is merged**: lane:close's last line names `bun run background await <id> --timeout 540`; run it (again if still waiting) and report the merge, or fix what it names on the same branch and close again. The Stop hook refuses to end a turn while that queue runs. Rebases are the queue's job: a generated-file conflict is regenerated, `CREDITS.md` merges both sides, and only a source conflict comes back to the lane. Several finished branches: `bun run lane:close --batch <branch ...>`. Docs-only changes may push to `beta` directly. Never open task PRs into `main`.
- **Never watch CI or sleep.** `bun run ci:status` reads checks once; the queue does the waiting. Every command gets a timeout under 10 minutes. A job that may outlast it (a species fit, a full perf run) is started with `bun run background start -- <cmd>`, read with `bun run background status <id>` (state, elapsed, the log's last lines), and awaited with `bun run background await <id>` as a harness background command with a long timeout, so its exit calls you back: one session spent 26 hours re-running ten-minute foreground awaits on plant fits. Dev servers and game launches run in the background too; a foreground command whose child stays alive never returns.
- **One heavy job at a time per session, and the PC is shared.** Never fan out with `&`, parallel loops or several background starts; `--workers` at 4 or fewer. A job too slow that way gets a smaller input or a faster tool, never more processes. Stop every process you started before you end your turn.
- **Releases** are agent-owned, for outside users, about once a day at most. Check no open PR touches the version, then `bun run release --wait` on a fresh branch: it builds and checks the site at the commit it would release and publishes nothing if that fails, cuts and lands the version, waits for npm to serve every package, and deploys jgengine.com from the released commit. `bun run release --wait <version>` finishes a release already cut. `publish.yml` refuses commits CI did not pass.
- A bugfix ships a regression test when one is cheap. Rendered changes embed before/after screenshots; behavior over time is shown by driving the game (`jgengine-verify`, `scripts/pr-video.ts`). API, workflow or tooling changes update their skill and generated artifacts in the same PR.

## Skill architecture

`jgengine` is intake and routing only; load only the domains a task needs (`capabilities.md`, generated `api.md`, references). One owner per concept: `workflow` delivery, `jgengine-verify` evidence, `improve` backlog passes, `ce-handoff` continuity.
