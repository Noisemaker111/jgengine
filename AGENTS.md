# JGengine repository governance

[README.md](README.md) owns project facts: packages, layering, commands and publishing. Do not restate them here or in skills. Explicit user instructions override this file and any skill; if a skill would stop requested work, name its SKILL.md and follow the user.

## Project purpose

JGengine is built through distinct playable games in `games/`. Reviewing a game exists to improve the shared framework, so one fix reaches every game. Trace a game symptom to its real cause, the engine contract, its adoption or the game's own rules, before fixing it: an obstructed HUD does not justify game-local CSS, and apparent sinking does not justify a guessed offset.

## Writing

Write short everywhere a human reads, one idea per line, in plain words and the tone of a calm coworker.

- Chat reply: what you did, what is open, the links.
- PR body: one line of context, a bullet per changed area, `Closes #N`, verification as commands with verdicts, screenshots; a bugfix adds one sentence of root cause.
- Issue: the problem in one sentence plus acceptance criteria.
- Leave out plan recaps, rejected options, file walkthroughs, restated output and closing summaries. Keep facts, guesses and suggestions apart.
- A decision for the user is one concrete question with the options named.

Code comments default to none. Exported public API keeps tight JSDoc (it generates `api.md` and `capabilities.md`). Inside a function, comment only a non-obvious why.

## Product invariants

- **World content is authored in the editor.** Placement, terrain, paths, zones, foliage and assets live in `editor.scene.json`, authored through the editor GUI or RPC/CLI and consumed at runtime through shared primitives. Changing visible world content is an editor task first; if the editor cannot express it, file a `[FEATURE]` issue before any code fallback. Never hardcode coordinate arrays a scene can own (`jgengine-editor`, `jgengine-world`).
- **Reusable capability goes upstream first.** Name the shared owner before editing a game. Adopt what exists, or fix its package; anything another game could need goes in `packages/*` as a narrow, configurable seam with a real adopter.
- **No genre kits.** No presets, archetypes or default-genre shapes in the SDK or skills. Probe games are not templates; use `capabilities.md`, recipes or core APIs.
- **Respect layering** ([README.md](README.md#layering)). `core` never depends on frameworks, rendering, browser, backend or game code.
- **Scale by default.** Serializable state, injected deterministic randomness, bounded work, allocation-aware hot paths, no full-world per-frame scans, no single-player-only contracts.
- **Stateful primitives keep state, storage and policy reachable.** A `create*` factory with mutable state exposes `snapshot()`/`state()` and `restore()`/`reset()` (`cards/cardPile.ts`), takes storage as an injected interface (`game/keyValueStore.ts`), and keeps play-time values retunable (`vehicleDynamics.ts` `retune`). `check-stateful-ratchet` enforces the first.
- **Games own their UI composition; the engine ships the parts.** Inventory, windows, vitals, action bars, currency and minimaps are `packages/*` blocks (`HudSlots` plus `@jgengine/react/kitHud`) reskinned with the UI kit's tokens. Every game has its own look, a real main menu, a settings surface and in-game credits.
- **Never use Kenney assets.** Prefer Quaternius or KayKit (3D), game-icons.net (icons), ambientCG (PBR).
- **Ports copy behavior and data, not implementation.** Credit sources in `CREDITS.md` and, for player-facing work, in the HUD and website.

## Game changes improve the framework

1. Separate the game's rules, content and presentation from reusable behavior.
2. Check engine `beta` before declaring a gap; if the fix exists, adopt it.
3. Build missing shared behavior upstream with configurable policy, keeping the first adopter's behavior. Do not edit files another session owns.
4. Land the engine change and the game change in one PR. Games run engine source from the same commit, so npm releases never gate a games change.
5. Delete the superseded game-local code. Report the shared owner, the cleanup and the behavior verified.

Repeated glue is a framework defect even when the game works. Games-side rules (size signal, seam line, capabilities ledger) are in [games/AGENTS.md](games/AGENTS.md#framework-first-development).

**No legacy code.** An engine change that breaks an in-repo game fixes that game in the same PR and deletes the old API there: no shims, no deprecated aliases.
Outside users are protected by npm versions only: a breaking change gets a semver bump and a short migration note in `changes/`.

## Runtime and verification

- Cold checkout: `bun run agent:bootstrap` (lock-guarded; `--check` confirms). Never kill a slow `bun install`. Docs-only work needs no install.
- Tests, type-checks and `bun run gen` read package source; `bun run build` is only for packing and the Node CLI.
- Package scripts: `bun --cwd=packages/<pkg> run <script>`. The space form silently runs nothing.
- Worktrees: `bun run agent:worktree -- <name>` (or `claude --worktree <name>`) under the main checkout's `.claude/worktrees/`, never nested, never under `C:\tmp`. It links dependencies and the ignored game assets under `games/*/public`. `bun run worktree:doctor` finds broken worktrees (`--repair --only <name>`); `worktree:reap` removes merged ones. Scratch goes in `.scratch/`.
- Search with `bun run find <pattern> [--in <dir>] [--files]`, never a recursive listing; `check-recursive-walk` enforces it (`// walk-ok: <reason>`).
- Before pushing: `bun run verify:fast` (exit 2: a changed runtime file reached no test), `bun run gen` if public API changed, `bun run ship:preflight`. Run `bun run gate` only to reproduce a CI failure.
- Screenshots back pixel claims: `bun run shoot` or `bun run drive <game> --steps <file>` per `jgengine-verify`, never a hand-rolled Vite app. After two capture failures, report lower-rung evidence.

## Change governance

- Branch from current `origin/beta`; never stack on a merged branch or discard unrelated changes. One coherent, revertible change per PR; follow the `workflow` skill.
- **Land with `bun run lane:close`**: `verify:fast`, then commit, push, rebase, PR and hand-off to the merge queue — the only landing command. Several finished branches: `bun run lane:close --batch <branch ...>`; `bun run lane:close --queue` drains the queue. Docs-only changes may push to `beta` directly. Never open task PRs into `main`.
- **Never watch CI or sleep.** `bun run ci:status` reads checks once; the queue does the waiting. Long commands: harness background, or `bun run bg:run -- <cmd>` then `bun run bg:await <id>`. `check:no-blocking-wait` enforces it (`// wait-ok: <reason>`); `lane:close` refuses a lane that slept or watched.
- For a reversible choice, pick your recommendation, note it in the PR and continue. Ask only for irreversible actions, money or production data. Record demo clips yourself; keep PR bodies current.
- **Releases** are agent-owned, for outside users, about once a day at most. Check no open PR touches the version, `bun run release` on a fresh branch, land it, `git push origin origin/beta:main`, then confirm the Publish run and `npm view @jgengine/core version`. `publish.yml` refuses commits CI did not pass.
- **A failure class repeats until a gate exists.** A fix ships a regression test, or a `check-*` script for a structural class. `check:fix-has-test` rejects runtime source with no test change unless the body says `Prevention: none - <reason>`; `check:fixture-location` rejects fixtures outside the workspace. A bugfix body names the seam that allowed the bug.
- Rendered changes embed before/after screenshots; behavior over time is shown by driving the game (`jgengine-verify`, `pr-video`).
- API, workflow or tooling changes update their skill and generated artifacts in the same PR. Plans and findings go in the issue or PR; `check-skills` fails markdown outside this file, READMEs, skills, `changes/` and `examples/`.

## Skill architecture

`jgengine` is intake and routing only; load only the domains a task needs (`capabilities.md`, generated `api.md`, references). One owner per concept: `workflow` delivery, `jgengine-verify` evidence, `improve` backlog passes, `ce-handoff` continuity. Claude Code reads this file; `CLAUDE.md` must not exist.
