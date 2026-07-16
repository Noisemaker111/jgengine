# Composable systems (`defineSystem`)

Single public authoring path: `defineGame({ systems, loop?, … })` from `@jgengine/shell/defineGame` (or core). Systems are meaningful capabilities — not micro-ticks.

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

## Cartridge path

Cartridge remains a convenience wrapper. Express the same shape as ordinary systems (`runFlow`, wave director, combat) under `defineGame({ systems })` when you outgrow the cartridge schema — one authoring model, no rewrite cliff.

## Ownership

- **Save / replicate** — system modules register via `ctx.game.registerSave` / `registerReplicate` at install.
- **Reset / dispose** — `loop.onReset` / `loop.onDispose` (composed) run system hooks.
