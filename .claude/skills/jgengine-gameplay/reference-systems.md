# Composable systems (`defineSystem`)

Single public authoring path: `defineGame({ systems, loop?, … })` from `@jgengine/shell/defineGame`. Systems are meaningful capabilities — not micro-ticks.

## Authoritative state

Use `ctx.state()` / `ctx.restore(state)` for detached whole-world persistence, including economy, clock, movement pose, possession, progression and registered system saves. These work without `persist` or a save backend. `ctx.snapshot()` / `ctx.hydrate()` remain client replication and omit save-only modules. `createRuntimeSave({ target: ctx, backend })` selects the authoritative pair automatically; existing snapshot-only targets still work.

Restore after initialization has registered every system. Missing keys in older saves retain initialized values; unavailable historical economy/progression cannot be recovered by the engine. Keep a game's legacy migration until its older saves have been converted. Simulation tick and pose-buffer state persist, but callbacks, timers and game-owned closures must be registered/reconstructed at boot or exposed through a system save module.

Declare `persist: { version, migrate(data, fromVersion) }` to convert incompatible
older whole-world saves before restoration. Raw payloads use version 0; matching
versions bypass the hook. Throw to reject a missing historical runtime module:
load returns false, leaving the initialized world and stored
save untouched. A version number alone preserves compatible mismatch loading;
it is not a rejection gate. Migration exceptions retain the save store's existing
decode fallback to initial data with idle status; they are not backend errors.
Explicit context `save` options override `persist`.

`ctx.sim.advance(realDt, (stepDt, tick, gameDt) => ...)` owns advancement of `ctx.time` once per simulation step. Use the third argument for scaled gameplay time and `stepDt` for movement; remove manual `ctx.time.advance` calls inside simulation callbacks. Movement prediction opts out with `{ advanceTime: false }` and must not run authoritative gameplay stages. Standalone clocks retain their explicit `advance` API.

## Portable XP and leveling

`leveling` (`@jgengine/core/game/progression`) is usable without a scheduled
system or game context. Its `LevelingStatAccess` reads and replaces two
caller-named pools in an existing store; `grantXp` writes settled XP/threshold
and level state, then emits every reached level in ascending order. State stays
in the caller's save format and round-trips as ordinary JSON. See the
[portable XP/leveling recipe](recipes/portable-xp-leveling.md).

## Coherent authored content

Keep stable ids and canonical facts for characters, factions, places, and world rules in the game's authored data. Record each chapter's prerequisites, consequences, and which facts it may introduce or change. The game's creative pillars, story voice, content palette, and desired player experience come from its author; generated prose, items, art, and assets must serve those constraints. Reuse constrained generation and validation code across games while each game owns its content and visual identity; do not fill catalogs from default genre kits or mass generic content.

Generate bounded chapter or catalog batches against those facts and existing definitions. Validate references and dependencies before merging each batch, giving humans and agents precise repair locations early to reduce failed retries and speed up game creation. Preserve reviewed facts across batches instead of asking a model to recreate the world from memory. `QuestDef.requires` accepts completed quest ids or unlock ids, so dependency checks must include the game's declared unlocks rather than treating every requirement as a quest. Check reward quest ids and objective/item references against their owning catalogs too.

Use `validateQuestCatalog` (`@jgengine/core/game/questCatalog`) before registering quest batches. Declare unlocks supplied by other systems with `externalUnlocks`, and quest grants that bypass acceptance with `externallyStartedQuests`. Catalog reward unlocks are recognized automatically. `hasReference` optionally checks item, target, inventory, and currency ids against caller catalogs. Duplicate ids, missing references, and invalid quantities are errors; blocked prerequisites and dependency cycles are warnings under a model where any eligible quest may be accepted and its objectives completed. External grants can change actual reachability. Follow the [quest authoring recipe](recipes/quest-authoring.md) and `npx jgengine recipe quest-authoring` for SDK-typechecked bounded generation and repair locations.

For repeated authoring and repair, follow the [narrative authoring recipe](recipes/narrative-authoring.md). It freezes a reviewed canon revision, bounds dialogue batches and checks explicit character/fact/event-order claims before an injected semantic reviewer approves. New canon is a separate author decision.

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

Quest item rewards use a whole-batch grant before XP, currency, and unlocks. `ctx.game.quest` stages every item against the declared inventories and commits only when all fit, including cumulative capacity in one bag. Capacity/kind/unknown-inventory rejections leave inventories and quest status unchanged, so the player can make room and retry. Inventory commits still notify subscribers synchronously; this does not roll back thrown observer exceptions or arbitrary callback side effects.

Custom `createQuestJournal` dependencies and `applyQuestRewards` appliers must supply `grantItems` for multiple item rewards. The callback grants the entire batch or returns a rejection without writes; implement staging or a transaction in the owning store. Legacy `grantItem` remains supported for a single reward. Multiple rewards without `grantItems` reject before any grant. Keep callbacks nonthrowing; external stores own exception handling and durable transaction boundaries.

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

## Staffed production

`stationOutputRate` (`@jgengine/core/work/staffedStation`) converts a plain staffing
snapshot to cycles per game-second: `(base + perStat * sum(worker.stat)) * efficiency`.
Only the first `floor(slots)` workers contribute, in caller order. Empty staffing
keeps base output; set `base: 0` to require workers. Efficiency defaults to one and
clamps to 0…1. Negative/nonfinite contributions are zero, nonfinite slots admit no
workers, and nonfinite efficiency or an overflowing result returns zero.

The caller owns unique worker ids, assignment/release policy, stat selection,
modifiers, happiness, and tuning. Resolve numeric contributions from your stat
store before writing staffing: one station might read `stats.get("strength")`,
another `stats.get("agility")` with equipment modifiers. Invalid contributions
still occupy their ordered slot; the function does not promote overflow workers,
allocate collections, or mutate saved staffing.

```ts
import { stationOutputRate, type StaffedStation } from "@jgengine/core/work/staffedStation";
import { createProductionState, productionBuilding, tickProduction, type ProductionState } from "@jgengine/core/crafting/production";
import { defineStore } from "@jgengine/core/store/defineStore";
import { defineSystem } from "@jgengine/core/game/defineSystem";

const room = defineStore<{
  staffing: StaffedStation;
  efficiency: number;
  production: ProductionState;
}>("workshop", () => ({
  staffing: { stationId: "workshop", slots: 2, workers: [] },
  efficiency: 1,
  production: createProductionState(),
}));
const recipe = productionBuilding({
  id: "workshop", outputs: [{ itemId: "supplies", count: 1 }], rate: 0,
});
export const staffedProduction = defineSystem({
  id: "staffed-production",
  tick: { type: "fixed", rate: 4 },
  update(ctx, dt) {
    room.update(ctx, previous => ({ ...previous,
      production: tickProduction({ ...recipe,
        rate: stationOutputRate(previous.staffing, {
          base: 0, perStat: 0.5, efficiency: previous.efficiency,
        }),
      }, previous.production, { dt }),
    }));
  },
  reset(ctx) { room.clear(ctx); },
});
```

Install the system via `defineGame({ systems: [staffedProduction] })`; write the
caller-resolved worker snapshot with `room.update`. Production input buffers,
output counts, partial-cycle seconds, staffing, and efficiency remain plain data
in the same store. `ctx.state()`/`ctx.restore()` save and replace that data; reset
restores the declared initial room. Persist progress, not just staffing, to avoid
restarting an in-flight batch. Input reservation and power gating continue to use
`feedProduction` and `tickProduction({ ...recipe, rate }, state, { dt, powered })`.
