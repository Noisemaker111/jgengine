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

**Seam line.** `lane:close` writes the PR's `Engine seam:` line from the diff: the engine source changed beside the game, or `none - game content only`. `bun run check games-framework` fails a new engine-shaped module in a game; a first-line `// framework-ok: <reason>` exempts one file when you can say why it cannot live upstream, and the PR body lists it as a bend.

## Capability adoption

`capabilities.json` is generated from the engine's capabilities (`bun run gen games-ledger`, which `lane:close` runs). What a game adopts is read from its imports; nobody writes it. A game's `jgengine.json` `capabilities` section holds only what source cannot show:

- **debt** - a game-facing capability whose domain the game has while it runs its own version, keyed by id: `{ "issue": N }` for the issue that tracks adopting it, plus an optional `reason` for the reader. Importing the capability pays the debt; the check then asks you to remove the entry.
- **probes** - by module, the boot probes that prove an adopted system live. Name one only for a system mounted at boot.

`bun run check games-capabilities` fails debt on an id the ledger lacks, on something already imported or on a capability that ships no probe, a debt entry with no issue number, a probe for a module the game does not import, and a stale ledger; it never judges the words, and it reads nothing from GitHub. `--summary` prints the per-game table. `bun run games:capabilities probe` boots games that name a probe and checks the system reports live counters.

## Where the work is defined

A game's build order is its `PLAN.md` (root [AGENTS.md](../AGENTS.md#game-changes-improve-the-framework), step 0). Its loop is its README design checklist ([rules](README.md#design-checklist-and-loop-proofs)); keep its numbers true to the build.

