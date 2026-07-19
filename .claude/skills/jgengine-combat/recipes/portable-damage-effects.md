# Apply damage to caller-owned resources

Use this recipe when an existing JavaScript/TypeScript game wants JGengine's
damage math, ordered interceptors, status resolution, shield spillover, and
lethal result without adopting `GameContext`, the entity store, renderer, React,
or JGengine's game loop.

## Install and focused imports

```sh
bun add @jgengine/core
```

```ts
import {
  createEffectSystem,
  type ReceiveMap,
} from "@jgengine/core/combat/effects";
import {
  createDamageClamp,
  resolveDamage,
} from "@jgengine/core/combat/damageInterceptors";
import { resolveDamageHit } from "@jgengine/core/combat/damageResolution";
import {
  createStatPool,
  type StatPool,
  type StatPoolAccess,
} from "@jgengine/core/stats/statPool";
import { seededRng } from "@jgengine/core/random/rng";
```

## Caller-owned state and adapter

This example uses an immutable store-shaped object. A Redux, Zustand, ECS, or
custom store can implement the same two methods without copying its entities
into JGengine.

```ts
interface UnitState {
  pools: Record<string, StatPool>;
  receive: ReceiveMap;
  statuses: Record<string, unknown>;
}

interface ExistingSave {
  units: Record<string, UnitState>;
}

let save: ExistingSave = {
  units: {
    enemy_7: {
      pools: {
        shield: createStatPool({ current: 25, max: 25 }),
        vitality: createStatPool({ current: 80, max: 80 }),
      },
      receive: { damage: { order: ["shield", "vitality"] } },
      statuses: {},
    },
  },
};

const statPools: StatPoolAccess = {
  get(ownerId, statId) {
    return save.units[ownerId]?.pools[statId] ?? null;
  },
  set(ownerId, statId, next) {
    const unit = save.units[ownerId];
    if (unit === undefined) return false;
    save = {
      ...save,
      units: {
        ...save.units,
        [ownerId]: { ...unit, pools: { ...unit.pools, [statId]: next } },
      },
    };
    return true;
  },
};
```

`set` receives a complete plain replacement pool. The SDK never asks for the
store itself and never mutates an entity object behind the adapter.

## Build the effect committer

```ts
const existingEventQueue: unknown[] = [];
const existingEvents = {
  emit(name: string, payload: unknown) {
    existingEventQueue.push({ name, payload });
  },
};

const effects = createEffectSystem({
  resolveReceive: (unitId) => save.units[unitId]?.receive,
  statPools,
  getStat: (_itemId, _statId) => null,
  spatial: {
    inRadius: (_center, _radius) => [],
    hasLineOfSight: (_from, _to) => true,
    positionOf: (_unitId) => undefined,
  },
  onLethal(unitId, context) {
    existingEvents.emit("unit-defeated", { unitId, context });
  },
});
```

The spatial adapter is only used by area effects. Connect those three methods
to the existing project's spatial index and line-of-sight query when needed;
single-target effects do no world scan.

## Resolve and apply a hit

Keep resolution and commitment explicit. The pure stages return provenance and
status state; authority decides what to persist and then routes final
applications into the structural effect committer.

```ts
const seededRandom = seededRng("shot-2048");
const simulationNowMs = 4_000;

const hit = resolveDamageHit({
  channel: "arc",
  impact: 40,
  source: "player",
  target: "enemy_7",
  targetTraits: ["shielded"],
  status: { status: "charged", chance: 0.35, durationMs: 2_000 },
  rng: seededRandom, // caller-owned deterministic stream
});

const intercepted = resolveDamage(
  [createDamageClamp({ id: "per-hit-cap", maxPerHit: 30 })],
  {
    source: "player",
    target: "enemy_7",
    amount: hit.impact,
    tag: hit.channel,
  },
  { nowMs: simulationNowMs }, // caller-owned deterministic clock
);

for (const application of intercepted.applications) {
  effects.applyEffect({
    from: application.source,
    to: application.target,
    effect: "damage",
    via: { amount: application.amount },
  });
}

if (hit.status?.instance !== null && hit.status?.instance !== undefined) {
  save.units.enemy_7!.statuses[hit.status.instance.status] = hit.status.instance;
}
```

`intercepted.provenance` records each ordered policy decision. `hit.matchup`,
`hit.received`, and `hit.status` retain the pure resolution evidence. The effect
result lists exact per-pool deltas in the receive order and reports lethality
when the final pool reaches its minimum.

## Save and restore

The authoritative pools and returned status instances are already plain data:

```ts
const encoded = JSON.stringify(save);
save = JSON.parse(encoded) as ExistingSave;
```

Recreate the small adapters over the restored store. Interceptor functions and
catalog rules are configuration, so re-supply them rather than serializing
closures. Persist any stateful interceptor records separately when their API
exposes serializable state.

## Ownership

The existing project retains entity identity, resource names, store updates,
save schema, status collection, authority, spatial queries, death/despawn,
events, clock, RNG, content, presentation, and its update loop. JGengine owns
the pure resolution stages, bounded ordered interception, pool spillover math,
and inspectable results.

## Common traps

- Use positive effect magnitudes to drain pools and negative magnitudes to
  restore them; the receive rule determines which named pools participate.
- Put shields or other absorbers before the final lethal pool in `order`.
- Pass final interceptor applications to `applyEffect`; do not apply the
  pre-interceptor impact as well.
- Persist the returned status `instance`; `resolveDamageHit` is intentionally
  pure and does not hide a status store.
- Use a bounded spatial index for `inRadius`; do not add a full-world scan per
  area effect.
- Keep audio, particles, hit flashes, animations, camera shake, and models in
  the existing project. Drive them from the returned results and provenance.
