# Composable systems (`defineSystem`)

Single public authoring path: `defineGame({ systems, loop?, … })` from `@jgengine/shell/defineGame`. Systems are meaningful capabilities — not micro-ticks.

## Authoritative state

Use `ctx.state()` / `ctx.restore(state)` for detached whole-world persistence, including economy, clock, movement pose, possession, progression and registered system saves. These work without `persist` or a save backend. `ctx.snapshot()` / `ctx.hydrate()` remain client replication and omit save-only modules. `createRuntimeSave({ target: ctx, backend })` selects the authoritative pair automatically; existing snapshot-only targets still work.

Restore after initialization has registered every system. Missing keys in older saves retain initialized values; unavailable historical economy/progression cannot be recovered by the engine. Keep a game's legacy migration until its older saves have been converted. Simulation tick and pose-buffer state persist, but callbacks, timers and game-owned closures must be registered/reconstructed at boot or exposed through a system save module.

`ctx.sim.advance(realDt, (stepDt, tick, gameDt) => ...)` owns advancement of `ctx.time` once per simulation step. Use the third argument for scaled gameplay time and `stepDt` for movement; remove manual `ctx.time.advance` calls inside simulation callbacks. Movement prediction opts out with `{ advanceTime: false }` and must not run authoritative gameplay stages. Standalone clocks retain their explicit `advance` API.

## Portable XP and leveling

`leveling` (`@jgengine/core/game/progression`) is usable without a scheduled
system or game context. Its `LevelingStatAccess` reads and replaces two
caller-named pools in an existing store; `grantXp` writes settled XP/threshold
and level state, then emits every reached level in ascending order. State stays
in the caller's save format and round-trips as ordinary JSON. See the
[portable XP/leveling recipe](recipes/portable-xp-leveling.md).

## Coherent authored content

Keep stable ids and canonical facts for characters, factions, places, and world rules in the game's authored data. Record each chapter's prerequisites, consequences, and which facts it may introduce or change. The game's creative pillars and desired player experience come from its author; generated prose and items must serve those constraints.

Generate bounded chapter or catalog batches against those facts and existing definitions. Validate references and dependencies before merging each batch; preserve reviewed facts across batches instead of asking a model to recreate the world from memory. `QuestDef.requires` accepts completed quest ids or unlock ids, so dependency checks must include the game's declared unlocks rather than treating every requirement as a quest. Check reward quest ids and objective/item references against their owning catalogs too.

Validate dialogue structure before opening a conversation:

```ts
import { validateDialogueGraph, type DialogueGraph } from "@jgengine/core/game/dialogueGraph";

function reviewDialogue(graph: DialogueGraph) {
  const issues = validateDialogueGraph(graph);
  const errors = issues.filter((issue) => issue.severity === "error");
  return { publishable: errors.length === 0, issues };
}
```

The validator locates duplicate ids, missing start/choice targets, unreachable nodes, and nodes without a route to an ending in linear time without recursive traversal. Loops with an exit are valid. Review warnings against intended entry points and conversation behavior; unreachable nodes may be entered with `goTo`, and closed loops may be deliberate. Run validation on authored batches, outside the frame loop.

Structural validity cannot establish story coherence. Review generated content for contradictions with canonical facts, character motivations, chronology, and meaningful consequences; play representative paths and check that choices support the intended experience. Large item counts need useful distinctions, economy balance, discoverability, and bounded runtime lookup. Counting generated items or passing reference checks alone does not establish those qualities.

## API

```ts
import { defineSystem } from "@jgengine/core/game/defineSystem";
import { compileSystemSchedule, DEFAULT_FIXED_STAGES, DEFAULT_FRAME_STAGES } from "@jgengine/core/game/systemSchedule";
import { composeGameLoop, installSystems } from "@jgengine/core/game/systemRuntime";

export const combat = defineSystem({
  id: "combat",
  feature: "quest", // optional — enables ctx.game.quest without features: { quest: true }
  dependsOn: ["movement"], // optional — must also be in systems[]
  tick: {
    type: "fixed", // | "frame" | "interval" | "manual"
    rate: 60,      // fixed only (Hz); default 60
    every: 1,      // interval only (game-seconds)
    stage: "combat",
    after: "movement", // optional local order within the stage
    before: "cleanup",
  },
  create(ctx) {},
  start(ctx) {},
  update(ctx, dt) {},
  events: {
    "entity.died"(ctx, event) {},
  },
  save: { key: "combat", snapshot: () => state, hydrate: (data) => { state = data; } },
  replicate: (ctx) => ({ key: "combat-pub", snapshot: () => pub, hydrate: (d) => { pub = d; } }),
  reset(ctx) {},
  dispose(ctx) {},
});
```

`defineGame` OR-merges `feature` flags, then `composeGameLoop(systems, loop)` so systems install on `onInit` and tick before residual `loop.onTick`. Classic games migrate by moving fan-out out of `onTick` into systems while keeping boot in `loop`.

## Timing channels

| `tick.type` | When it runs |
|-------------|--------------|
| `fixed` | Accumulator at `rate` Hz (default 60); multi-subscribe OK |
| `frame` | Once per `onTick` with the frame's game `dt` |
| `interval` | Every `every` game-seconds (own accumulator per system) |
| `manual` | Installed only; call `systemsOf(ctx)?.runManual(ctx, id)` |
| *(omit)* | Event-only — handlers in `events` |

Multiple systems may share a channel. Order is stage tables + optional `before`/`after` — **never import order**. `compileSystemSchedule` validates unique ids, `dependsOn`, and cycles.

Default stages: fixed `input → movement → combat → ai → activities → cleanup`; frame includes those plus `animation → camera → effects`.

## Ownership

- **Save / replicate** — system modules register via `ctx.game.registerSave` / `registerReplicate` at install.
- **Reset / dispose** — `loop.onReset` / `loop.onDispose` (composed) run system hooks.

## Snapshot and restore on stateful handles

These handles hand back a plain JSON `snapshot()` that later ticks do not mutate, and take it back with `restore(next)`, so a host, save file or replay can rewind them bit-exactly: `game/lootTable` `createLootRegistry` (registered tables; not JSON when an entry uses `generate`), `game/toasts` `createToastQueue`, `game/vfxInstance` `createVfxInstanceStore` (restore emits `stop` then `upsert` so the renderer follows), `session/roundState` `createRoundState` (`RoundSnapshot` now carries `pendingWinner`), `input/lookChannel` `createLookChannel`, and `input/pointer` `createDragCapture` (`state()` out, `restore(state | null)` in).
