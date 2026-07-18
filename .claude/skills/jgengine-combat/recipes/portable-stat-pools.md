# Use JGengine stat pools with an existing save model

Use this recipe when a project already owns its entities and persistence but
needs deterministic bounded resources such as shields, energy, stamina, XP, or
durability. Resource names and meaning remain caller data; the portable
contract has no privileged health field.

## Install

```sh
bun add @jgengine/core
```

Import the focused, renderer-free module:

```ts
import {
  applyStatPoolDelta,
  createStatPool,
  type StatPool,
  type StatPoolAccess,
} from "@jgengine/core/stats/statPool";
```

`@jgengine/core` has no runtime dependencies and does not require a JGengine
entity store, game loop, renderer, React provider, or backend.

## Minimal adapter

Suppose the existing project saves resources inline on its own units:

```ts
interface UnitSave {
  id: string;
  resources: Record<string, StatPool>;
}

interface WorldSave {
  units: Record<string, UnitSave>;
}

const world: WorldSave = {
  units: {
    rover: {
      id: "rover",
      resources: {
        energy: createStatPool({ current: 8, max: 10 }),
        durability: createStatPool({ max: 40 }),
      },
    },
  },
};

const resources: StatPoolAccess = {
  get(ownerId, statId) {
    return world.units[ownerId]?.resources[statId] ?? null;
  },
  set(ownerId, statId, next) {
    const unit = world.units[ownerId];
    if (unit !== undefined) unit.resources[statId] = next;
  },
};
```

The adapter performs structural reads and complete replacement writes. It does
not expose the caller's store implementation or hand mutation authority to the
engine.

## Apply a resource change

```ts
const spent = applyStatPoolDelta(resources, "rover", "energy", -3);

if (spent.status === "ok") {
  console.log(spent.pool.current); // 5
  console.log(spent.applied);      // -3 (after clamping)
  console.log(spent.hitMin);       // false
}
```

Positive amounts increase a pool and negative amounts decrease it. The result
records the previous and next values, the exact clamped amount, and whether a
bound was reached. Missing owners or stat ids return a rejected result without
writing.

For reducer-style stores, call the pure `changeStatPool(pool, amount)` or
`patchStatPool(pool, patch)` transition inside the project's existing action
and commit the returned `pool` through that store's normal update path.

## Save and restore

`StatPool` is plain JSON data, so keep it in the project's existing save:

```ts
const serialized = JSON.stringify(world);
const restored = JSON.parse(serialized) as WorldSave;
```

After restore, point the same adapter at `restored`. There is no second JGengine
snapshot to reconcile, no registry to rebuild, and no required migration away
from the caller's schema. If the existing schema uses different field names,
translate only at `get`/`set`.

## Ownership

The existing project owns resource ids, entity ids, storage layout,
persistence, replication, authority, UI, scheduling, and the decision to apply
a change. JGengine owns normalization, clamping, pure transitions, and the
small structural access contract. Native JGengine entity stats implement the
same portable behavior through their existing API.

## Common traps

- Do not copy caller resources into a parallel `StatValueMap`; adapt the state
  where it already lives.
- Do not mutate the object returned by `get`. Commit the complete returned
  `pool` through `set` or the caller's reducer/action.
- Pool changes are signed: positive restores/fills, negative spends/drains.
- Keep formulas, regeneration schedules, damage meaning, and resource names in
  caller code. A stat pool only enforces bounds.
- Persist `current`, `max`, and `min` together so a restored value is clamped
  against the same bounds.
