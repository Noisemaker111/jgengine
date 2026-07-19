# JGengine repository governance

Read [README.md](README.md) first. It owns stable project truth: repository map, packages, layering, stack, commands, publishing model, and license. Do not duplicate those facts here or in skills.

## Product invariants

- **Author world content in the editor.** Scenes, placement, terrain, paths, zones, foliage, and assets belong in `editor.scene.json`, authored through the editor GUI or RPC/CLI. Any request that adds, moves, restyles, or removes visible world content — streets, buildings, props, enemy/NPC placement, phase or trigger locations, "design this world", "make it look better" — is an editor authoring task first, however it is phrased. Runtime and gameplay consume that document through shared engine primitives. If the editor cannot express required content, file a `[FEATURE]` issue before any code fallback; never hardcode geometry or coordinate arrays a scene can own. Use `jgengine-editor` for authoring and `jgengine-world` for runtime consumption.
- **Build reusable capability upstream.** Before editing `Games/*`, name the shared owner. Anything another game could need belongs in `packages/*` as a narrow, genre-agnostic seam with the game as its first adopter. Game-local code is reserved for genuinely game-specific content and feel. Extracting a primitive must preserve observable play.
- **Every game is custom; no genre kits.** Never build or reach for genre kits, presets, archetypes, class templates, or "default sports car / default RPG / default FPS" product shapes in the SDK or skills. Treat every pitch as a unique composition of needs, not a genre to fill in. `Games/*` are probes, never templates — prefer `capabilities.md`, recipes, or core APIs over reading another game's source. When a custom game needs something awkward, incomplete, or handrolled (catalog builders, loadout compose, boost meters, driving glue, and the like), lift a narrow, data-first, genre-agnostic seam into `packages/*` and skills; do not invent a game-local mini-framework or copy `Games/*`. If two custom games would re-handroll the same glue, that glue belongs in the SDK or a skill recipe, not duplicated under `Games/*`.
- **Respect package layering.** The dependency direction in [README.md](README.md#layering) is authoritative. Never import from a higher layer or make `core` depend on frameworks, rendering, browser, backend, or game code.
- **Scale by default.** Prefer serializable state, deterministic injected randomness, bounded work, and allocation-aware hot paths. Avoid full-world per-frame scans and single-player-only contracts.
- **Every game owns its UI.** Presentation is game content, not engine chrome. Each game designs and ships a custom HUD, menus, feedback, and art direction — never ships a stock drop-in face assembled from default widgets or genre theme presets. The engine supplies headless data/layout/accessibility seams and optional unskinned building blocks (hooks, layout, tokens, interaction models); games own composition, skin, placement, terminology, and their single main menu. An empty `HudCanvas` plus a UI art-direction block is the starting point, not `StatBar`/`Hotbar`/`Coins` as the product.
- **Never use Kenney assets.** Do not add, fetch, index, alias, credit, or reference Kenney.nl content. Prefer Quaternius or KayKit for CC0 3D, game-icons.net for icons, and ambientCG for PBR.
- **Ports copy behavior and data, not implementation.** Harvest numbers, tables, layouts, palettes, formulas, and feel, then rebuild on engine seams. Do not transplant another project's functions, renderers, or DOM/canvas workarounds.
- **Credit borrowed work.** Record inspiration, ports, and copied permissive assets in `CREDITS.md`; player-facing game work also carries HUD and website credit.

## Agent runtime (Claude / Codex / Grok)

Cold checkouts and git worktrees are not ready until bootstrapped. Do this before recon thrash, issue storms, or package typechecks:

1. **Bootstrap** — `bun run agent:bootstrap` (installs if needed, then full package build so `@jgengine/*` dist exists; ~2–3 min cold). Start it in a background task and recon while it runs. NEVER kill a slow install — a killed `bun install` leaves half-hardlinked `node_modules` and forces a wipe-and-reinstall loop. Bootstrap is lock-guarded (re-invoking joins the running one) and self-heals partial trees. Check only: `bun run agent:bootstrap --check`.
2. **Package scripts** — prefer `bun --cwd packages/<pkg> run <script>`. Avoid `bun run --cwd packages/<pkg> <script>` (can hit the wrong root script).
3. **Worktrees are for local parallelism only** — multiple agents sharing one machine's checkout: `bun run agent:worktree -- <name>` or Claude `claude --worktree <name>` (both land under `.claude/worktrees/` and bootstrap themselves; never nest one under another, never `C:\tmp\...` on Windows Codex). Cloud/container sessions (Claude web, Codex cloud, Grok) are already isolated — never create a worktree there; just branch from `origin/main`. Cloud environments should set their setup script to `bash scripts/cloud-setup.sh` so sessions start from a warm snapshot instead of a cold install.
4. **Process order** — bootstrap first; then claim **one** issue (or the slice the user named); implement; focused tests; `bun run gate` / `bun run ship:preflight` when shipping. Do not open a multi-issue program before the tree can run Bun.
5. **Papercuts** — log only after bootstrap works (`bun run papercut -m <model> "..."`). Do not thrash on papercut path while install/build is broken.
6. **Evidence** — deterministic tests first. Screenshots only for pixel claims (`jgengine-verify`); use `bun run shoot` / `drive`, not a hand-rolled Vite app. Arbitrary `--url` pages must set `document.documentElement.dataset.jgCapture = "ready"`. Capture fails twice → stop and report lower-rung evidence.

## Change governance

- Preserve user work. Never discard or overwrite unrelated changes. Start a new task branch from current `origin/main`; do not stack new work on a parked or merged task branch.
- Move in slices; bound recon. Read only what the smallest end-to-end change needs, then act — recon must terminate in a commit or an approved plan, never in open-ended narration. Prefer a working vertical slice over broad discovery.
- Parallelize by default. When the task has two or more legs that do not need each other's output — separate subsystems, separate files, independent audits or verification suites — spawn one Opus subagent per leg in a single batch instead of working them serially. Keep planning, overlapping edits, and final synthesis in the main agent; never give two workers the same files; judge worker evidence rather than trusting claims. Small edits, quick greps, and waiting stay inline. Serial work on independent legs is the exception and needs a reason.
- Route drudge work to Haiku. Long mechanical sequences that need no judgment — babysitting `bun run gate`/preflight runs and reporting the verdict, regenerating manifests/artifacts, commit + push + PR-open choreography, tailing logs for a known marker, capturing screenshot galleries, mass renames from an explicit list — go to a `model: haiku` subagent instead of occupying the main model. The main agent writes a precise prompt with exact commands and success criteria, then judges the returned evidence. Anything requiring design decisions, debugging, or code authorship stays on the stronger model.
- Claim a tracked issue before implementation. A fixed issue is closed by the PR with `Closes #N` (or explicitly when auto-close cannot work).
- A PR is one coherent, independently reviewable and revertible change. Combine work sharing a root cause, API migration, files, acceptance criteria, and verification story. Split work that is independently releasable, reviewable, revertible, or likely to conflict. Issue count never determines PR count.
- Follow the `workflow` skill for issue → change → verify → ship. Push with a standalone `git push` command. In the `Noisemaker111` repo, enable squash auto-merge when you open the PR so GitHub lands it itself once CI is green — the user never merges by hand. Never enable auto-merge or merge for any other owner/repo (park the PR there). Never bump versions or publish npm releases unless the user explicitly asks; the user owns release and publish timing.
- Public API, workflow, convention, or tooling changes update their owning skill/reference and generated artifacts in the same PR. Do not create ADRs, audit reports, or freestanding design docs; durable guidance belongs here, an existing README, or the owning skill.
- Log papercuts in the moment. Whenever work hits a small non-blocking friction — a preview build error on main, a retried or dead-end command, a misleading error, a flaky script, a confusing setup step, a task that took far longer than it should have, or any solvable bump in the road — log it immediately with `bun run papercut -m <your-model-id> "what you were doing → what got in the way"` and keep going. Do not wait for session end or ask permission; `/papercut` mines a whole session, and `improve` passes sweep `PAPERCUTS.md` (research each entry, fix the easy ones, remove fixed entries).
- Treat completion as an evidence claim. Inspect the actual diff and acceptance criteria; run verification proportional to risk. `bun run gate` is the full local verdict and `bun run ship:preflight` is the final shipping check. Visual claims also follow `jgengine-verify` and include screenshot evidence.

## Skill architecture

- `jgengine` is intake and routing only. Load only domains the task needs; use each selected domain's `capabilities.md` for intent-to-import discovery, `api.md` for generated export inventory, and references for deeper workflows.
- Each concept has one skill owner. `workflow` owns delivery, `jgengine-verify` owns evidence, `improve` owns backlog passes and post-fix friction retrospectives, and domain skills own their package/API boundaries. Concurrency has no skill: the parallelize-by-default invariant above is the whole policy.
- Skill descriptions stay short and trigger-oriented. `SKILL.md` holds decisions and canonical workflows, not export catalogs or repeated project facts. The repository gates root mirroring, route integrity, and duplicate prose.

## Model identity

- State the model you are (name and ID) at the start of every conversation.
- Model index — `$` is relative cost, `IQ` is relative capability, both rough and directional, not measured:

  | Model | $ | IQ |
  | --- | --- | --- |
  | Fable | 9 | 10 |
  | GPT 5.6 | 4 | 7 |
  | Grok 4.5 | 3 | 6 |
  | Opus | 4 | 5 |
  | Sonnet | 3 | 4 |
  | Haiku | 1 | 1 |

  Route work by this index: Haiku for the mechanical drudge work described above, Sonnet for default implementation, Opus/GPT 5.6/Grok 4.5/Fable reserved for design decisions, hard debugging, or judgment calls that justify their cost.
