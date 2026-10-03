# Timed away missions

Use the pure transitions in `@jgengine/core/work/expedition` to orchestrate a timed
away mission. The caller owns its clock, store, identities, authored content and
policy. Core owns event ordering and the exploring → returning → home / dead
lifecycle, not a scheduler, genre preset or persistence backend.

All `*Ms` fields and log `at` timestamps are epoch milliseconds. Persist the entire
`ExpeditionState`, including `cursor`, supplies, carried rewards and the completed
tick frontier. `settleExpedition(config, state, nowMs)` uses `accrueSince` and
`steppedCatchUp`; a multi-day gap follows the same loot → hazard → ordered supplies
→ death → capacity recall sequence as incremental calls. Each callback is pure
and receives the state at that event's time, with the persisted RNG stream.

```ts
import { createLootPipeline } from "@jgengine/core/game/lootPipeline";
import { timeScaledRarity } from "@jgengine/core/game/lootModifiers";
import {
  dispatchExpedition, settleExpedition, recallExpedition, returnExpeditionNow,
  type ExpeditionConfig, type ExpeditionState,
} from "@jgengine/core/work/expedition";
import { defineStore } from "@jgengine/core/store/defineStore";
import { defineSystem } from "@jgengine/core/game/defineSystem";

const rewards = createLootPipeline<{ elapsedMs: number }>({
  id: "survey-rewards",
  stages: [{ id: "survey", table: {
    id: "survey-pool", entries: [
      { item: "sample", count: 1, weight: 9 },
      { item: "artifact", count: 1, weight: 1 },
    ],
  }, modifiers: [timeScaledRarity({
    id: "survey-depth",
    ramp: (entry, hours) => entry.item === "artifact" ? 1 + hours : 1,
  })] }],
});
const survey: ExpeditionConfig<{ elapsedMs: number }> = {
  tickMs: 20 * 60_000,
  loot: rewards,
  lootCtx: state => ({ elapsedMs: state.elapsedMs }),
  maxHp: state => Math.max(1, 100 - state.exposure),
  hazard: (_state, rng) => ({ damage: rng() < 0.25 ? 4 : 1, exposure: 1 }),
  supplies: [
    { key: "filter", when: state => state.exposure >= 10, clearExposure: 10 },
    { key: "medicine", when: state => state.hp < 30, restoreHp: 25 },
  ],
  returnFraction: 0.5,
  carryCap: 100,
  maxTicksPerSettle: 1000,
  logLimit: 200,
  describe: event => `Survey: ${event.kind}`, // Replace with authored/localized prose.
};

export function awayMission(nowMs: () => number) {
  const mission = defineStore<ExpeditionState | null>("away-mission", null);
  const dispatch = () => dispatchExpedition({
    id: "surveyor", startAtMs: nowMs(), hp: 100,
    supplies: { medicine: 5, filter: 2 }, seed: "caller-campaign:surveyor",
  });
  const system = defineSystem({
    id: "away-mission", tick: { type: "frame" },
    create(ctx) { mission.write(ctx, dispatch()); },
    update(ctx) { mission.update(ctx, state => state === null ? null : settleExpedition(survey, state, nowMs())); },
    reset(ctx) { mission.write(ctx, dispatch()); },
  });
  return { mission, system, recallExpedition, returnExpeditionNow };
}
```

Install the returned system with `defineGame({ systems: [system] })`. Store writes
and `ctx.state()` / `ctx.restore()` keep the ordinary native save boundary; no
expedition-specific backend is required. A caller-owned store may instead call
the same pure transitions and atomically persist each returned value. Decode and
validate your saved schema at that boundary. Keep policy callbacks free of side
effects; a rejected policy transition does not write through the pure API.

A courier composition can use a parcel-only loot pipeline, no exposure,
`maxHp: () => 20`, rations restoring health, and `returnFraction: 0.25`. Both
compositions use the same orchestration. Item names, encounter notices, quality
curves, hazard magnitudes, immunity and supply thresholds are authored data and
callbacks; they are not SDK content presets. `timeScaledRarity` multiplies weighted
odds or independent chances (clamped to one) and preserves the loot pipeline's
original/effective odds and modifier ids. There is no built-in rarity taxonomy.

`carryCap` counts **item units**, not drop records. Rolled item quantities are
admitted in pipeline order up to the remaining cap; currency does not consume
item capacity and is carried in full. Carried counts merge by identity. Each loot
event's `drops` contains accepted quantities, while `loot` contains the full rolled
resolution and provenance, including quantities excluded by capacity. Core starts
auto-return at the event time that filled capacity. Returning never rolls rewards,
consumes supplies or takes hazard damage. Arrival is recorded at its exact deadline
even when one offline call observes it much later. Dead missions never revive.

`maxTicksPerSettle` bounds work without dropping elapsed ticks. If the budget runs
out, the completed frontier remains behind `nowMs`. Recall and instant return use
that same settlement pipeline and postpone the transition while due ticks remain;
repeat at the same target until caught up. The caller owns instant-return payment
and authorization. Count-bound `appendFeed` keeps the newest log events without
discarding carried rewards or RNG progress. Supply rules run in array order and
spend one unit only when restoration/cleansing changes a vital; health can recover
from zero during that tick before the death decision.

Configuration is runtime policy, never saved into state. Retuning applies the
current policy to unsettled ticks; a changed cadence anchors at the last completed
tick. Persist a policy/version id alongside your state if historical policy must
be replayed exactly. A lower carry cap preserves already-owned rewards and recalls
after the next due event (or immediately when no tick is due). Monotonic settlement
does not replay time when the caller's clock moves backward.
