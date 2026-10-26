# Agent instructions

These games exist to find and fix gaps in JGengine's shared framework. The root [AGENTS.md](../AGENTS.md) owns the shared rules: writing style, product invariants (editor-authored worlds, no genre kits, UI ownership), verification, lanes and how to ask. [README.md](README.md) owns the game list, dev commands and how games resolve the engine.

## Engine

Games run the engine source in `packages/` from the same commit, never a published npm version. An engine change that breaks a game fixes that game in the same PR.

## Framework-first development

1. Name the shared package owner and read the engine API before editing. Adopt what exists.
2. If reusable behavior is missing or broken, fix the engine package with this game as first adopter.
3. Verify the game itself, plus a differently built second game when it applies.
4. Delete superseded game code after adoption.

**Size signal.** A game module that owns a state machine, reducer, scheduler, resource pool, pathfinder, damage or status table, spawn director or progression curve is an engine system in the wrong place. If it would pass roughly 50 lines, or a second game would want it, file the engine seam first: name `packages/<pkg>/src/<file>`, the API needed and two adopting games, under [epic #2312](https://github.com/Noisemaker111/jgengine/issues/2312).

**Seam line.** Every PR body carries `Engine seam: packages/shell/src/render/x.ts (adopts #1234)` or `Engine seam: none - authored content only`. `bun run check games-framework` fails a new engine-shaped module in a game; `-- --allow "<reason>"` only when you can say why it cannot live upstream.

## Capability adoption

`capabilities.json` is generated from the engine's game-facing capabilities (`bun run gen games-ledger`). Each game's `<game>/capabilities.json` answers every one:

- **adopted** - the game runs the shared system.
- **not-applicable** - the domain does not exist in this game; the reason names the domain.
- **debt** - the game has the domain but not the shared system; the reason names the gap and an open issue in this repo.

Reasons are 20+ specific characters, never copied between games. `bun run check games-capabilities` fails missing, thin or template reasons, ownerless or closed-issue debt, and a stale ledger; `--summary` prints the per-game table. `bun run games:capabilities probe` boots games that name a probe and checks the system reports live counters; name a probe only for a system mounted at boot.

**Debt only goes down.** `scripts/debt-budget.json` holds a total and per-game ceiling. The gate fails when debt exceeds a ceiling or a ceiling sits above the tally; clearing debt lowers its budget with `bun run check games-capabilities --write`, which never raises one.

## Where the work is defined

A game's loop is its README design checklist ([rules](README.md#design-checklist-and-loop-proofs)); keep its numbers true to the build.

