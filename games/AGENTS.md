# Agent instructions

These games exist to find and fix gaps in JGengine's shared framework. The root [AGENTS.md](../AGENTS.md) owns the shared rules: writing style, product invariants (editor-authored worlds, no genre kits, UI ownership), verification, lanes and how to ask. [README.md](README.md) owns the game list, dev commands and how games resolve the engine.

## Engine

Games run the engine source in `packages/` from the same commit, never a published npm version. An engine change that breaks a game fixes that game in the same PR.

## Framework-first development

1. Name the shared package owner and read the engine API before editing. Adopt what exists.
2. If reusable behavior is missing or broken, fix the engine package with this game as first adopter.
3. Verify the game itself, plus a differently built second game when it applies.
4. Delete superseded game code after adoption.

**Mechanism signal.** A game module that owns a reusable mechanism (a state machine, reducer, scheduler, resource pool, pathfinder, damage or status model, spawn director) is an engine system in the wrong place when a second game would want the same code with different data. Keep it in the game and file the seam as an issue naming `packages/<pkg>/src/<file>`, the API needed and the second game that would adopt it. The second adopter builds it upstream; the first never waits.

A game's own progression is the game, not a mechanism, and stays in the game at any length: its level and price numbers, unlock order, tutorial beats, quests, recipes and content tables. Hours of content are expected to be thousands of lines; size is never the signal.

**Seam line.** `lane:close` writes the PR's `Engine seam:` line from the diff: the engine source changed beside the game, or `none - game content only`.

## Capability adoption

`capabilities.json` is generated from the engine's capabilities (`bun run gen games-ledger`, which `lane:close` runs). What a game adopts is read from its imports; nobody writes it. A game's `jgengine.json` `capabilities` section holds only `probes`: by module, the boot probes that prove an adopted system live. Name one only for a system live once play starts: the probe presses Play (the game's `capture.play`) and gives it 300 frames from there.

`bun run games:capabilities probe` boots games that name a probe and checks the system reports live counters.

## Game suite

What a game must let a player do is the engine's game suite (`packages/core/src/suite/suiteCatalog.ts`): player verbs with stable ids, by genre, each saying what proves it. The workflow:

1. Declare the game's genres in `jgengine.json`: `"suite": { "genres": ["creature-survival"] }`. Every entry those genres imply is required. `jgengine suite --genres <a,b>` lists them, with each core feature's depth (how a player finds it, what improves, what it feeds, why repeat it at hour 5, how it fails).
2. Plan a proof per entry. A `sim` entry is proven by `proofs/sim/<name>.proof.ts`: `defineProof(game, { proves, setup, play })` (`@jgengine/core/suite/suiteProof`), a deterministic headless run of the real game in game time. Setup may cheat (give items, place the player, spawn creatures, scale the clock); when it returns its context is revoked. Play gets only what a player reaches (keys through the bindings, prompts, hotbar, the command a UI control runs) and the game's own systems ticking; a command marked `cheat: true`, or named like cheat/debug/admin, fails the proof, and at least one check must be false when play starts. A `data` entry is proven by the content check: `proofs/content.ts` exports a `SuiteContent` built from the game's own catalogs (`auditSuiteContent`, on top of `validateContentProgression`).
3. `src/suite.test.ts` calls `suiteTest(dir, content)` (`games/shared/suiteTest.ts`). It runs in the game's `bun test`, so CI and `verify:fast` run every proof, writes `proofs/suite-report.json` outside CI, and fails when an entry the committed report proved stops being proven. `jgengine suite <game>` runs it and prints the score; `bun run gen` writes the score line under each README's title and a `## Suite score` section in `PLAN.md`.
4. An entry the game will never have is cut with a reason (`"cut": { "<id>": "<why>" }`), and the reason shows in the score. An entry whose logic lives in render or UI code, so no headless run can reach it, is a finding: list it under `"notSimulatable": { "<id>": "<file>" }` and fix the seam in the engine where it is general.

Browser drives and screenshots prove look and feel only; they never count toward the suite.

## Where the work is defined

A game's build order is its `PLAN.md` (root [AGENTS.md](../AGENTS.md#game-changes-improve-the-framework), step 0). Its loop is its README design checklist ([rules](README.md#design-checklist-and-loop-proofs)); keep its numbers true to the build.


Real-world numbers (a wiki's species stats, an item table) come from the page once: `bun run data-table <url> --list` numbers the page's tables, then `bun run data-table <url> --table <n> --out games/<id>/src/data/<name>.ts` writes a typed file the game imports. The page is cached for every worktree and the file names its source, so a second run fetches nothing; `--refresh` is the only way back to the network.
