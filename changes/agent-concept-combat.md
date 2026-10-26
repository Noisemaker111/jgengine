### Migrate

- The damage pipeline lives in `combat/damage/`: `@jgengine/core/combat/{damageTable,damageMatchup,receivedDamage,damageResolution,damageRuntime,damageInterceptors,resistance}` → `@jgengine/core/combat/damage/<same name>`.
- New `landDamage(ctx, runtime, hit)` and `landAreaDamage(ctx, runtime, blast, prepare?)` (`@jgengine/core/combat/damage/landDamage`) resolve a hit through a damage runtime and land it as the world's `damage` effect (optional `item` credit and `round`). Harbor Heat and Scrap Signal drop their hand-written copies of that glue.
- Drop tables live in `loot/` with item generation: `@jgengine/core/game/{lootTable,lootPipeline,lootFilter,lootModifiers}` → `@jgengine/core/loot/<same name>`; `@jgengine/core/game/worldItem` → `@jgengine/core/loot/groundItem`.
- `WeaponStats` from `combat/weaponSystem` (the lifetime fire/reload counters) is now `WeaponCounters`; `WeaponStats` is only the item stat reader in `item/weapon`.
