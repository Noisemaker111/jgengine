# JGengine repository governance

Read [README.md](README.md) first. It owns stable project truth: repository map, packages, layering, stack, commands, publishing model, and license. Do not duplicate those facts here or in skills.

## Product invariants

- **Author world content in the editor.** Scenes, placement, terrain, paths, zones, foliage, and assets belong in `editor.scene.json`, authored through the editor GUI or RPC/CLI. Runtime and gameplay consume that document through shared engine primitives. If the editor cannot express required content, file a `[FEATURE]` issue before any code fallback; never hardcode geometry or coordinate arrays a scene can own. Use `jgengine-editor` for authoring and `jgengine-world` for runtime consumption.
- **Build reusable capability upstream.** Before editing `Games/*`, name the shared owner. Anything another game could need belongs in `packages/*` as a narrow, genre-agnostic seam with the game as its first adopter. Game-local code is reserved for genuinely game-specific content and feel. Extracting a primitive must preserve observable play.
- **Respect package layering.** The dependency direction in [README.md](README.md#layering) is authoritative. Never import from a higher layer or make `core` depend on frameworks, rendering, browser, backend, or game code.
- **Scale by default.** Prefer serializable state, deterministic injected randomness, bounded work, and allocation-aware hot paths. Avoid full-world per-frame scans and single-player-only contracts.
- **Engine chrome is optional.** Shared UI is composable and headless where practical; games own placement, skin, and their single main menu.
- **Never use Kenney assets.** Do not add, fetch, index, alias, credit, or reference Kenney.nl content. Prefer Quaternius or KayKit for CC0 3D, game-icons.net for icons, and ambientCG for PBR.
- **Ports copy behavior and data, not implementation.** Harvest numbers, tables, layouts, palettes, formulas, and feel, then rebuild on engine seams. Do not transplant another project's functions, renderers, or DOM/canvas workarounds.
- **Credit borrowed work.** Record inspiration, ports, and copied permissive assets in `CREDITS.md`; player-facing game work also carries HUD and website credit.

## Change governance

- Preserve user work. Never discard or overwrite unrelated changes. Start a new task branch from current `origin/main`; do not stack new work on a parked or merged task branch.
- Claim a tracked issue before implementation. A fixed issue is closed by the PR with `Closes #N` (or explicitly when auto-close cannot work).
- A PR is one coherent, independently reviewable and revertible change. Combine work sharing a root cause, API migration, files, acceptance criteria, and verification story. Split work that is independently releasable, reviewable, revertible, or likely to conflict. Issue count never determines PR count.
- Follow the `workflow` skill for issue → change → verify → ship. Push with a standalone `git push` command. Never merge, enable auto-merge, or bump versions/releases unless the user explicitly asks; the user owns merge and release timing.
- Public API, workflow, convention, or tooling changes update their owning skill/reference and generated artifacts in the same PR. Do not create ADRs, audit reports, or freestanding design docs; durable guidance belongs here, an existing README, or the owning skill.
- Treat completion as an evidence claim. Inspect the actual diff and acceptance criteria; run verification proportional to risk. `bun run gate` is the full local verdict and `bun run ship:preflight` is the final shipping check. Visual claims also follow `jgengine-verify` and include screenshot evidence.

## Skill architecture

- `jgengine` is intake and routing only. Load only domains the task needs; use each selected domain's `capabilities.md` for intent-to-import discovery, `api.md` for generated export inventory, and references for deeper workflows.
- Each concept has one skill owner. `workflow` owns delivery, `fan-out` owns concurrency, `jgengine-verify` owns evidence, `improve` owns backlog passes and post-fix friction retrospectives, and domain skills own their package/API boundaries.
- Skill descriptions stay short and trigger-oriented. `SKILL.md` holds decisions and canonical workflows, not export catalogs or repeated project facts. The repository gates root mirroring, route integrity, duplicate prose, and active-intake budgets.
