### Added

- `rollLoot` (`@jgengine/core/loot/lootGen`) rolls a named item from a caller `LootCatalog`: bases with mount slots, parts, affix pools, weighted rarity tiers, manufacturer personalities and a `levelScale` curve. Stats are `base × rarity.statScale × levelScale`, then part stats/multipliers, maker `bias`/`scale`, then additive and multiplicative affixes; additive affix rolls scale with level, multiplicative ones do not.
- `createLootRoller` wraps a validated catalog with roll counts per rarity, `snapshot()`/`restore()`/`reset()` and an optional devtools probe; `assertLootCatalog` rejects duplicate ids, unresolvable pools, empty item slots and a non-ascending level curve at construction.
- `validateLootItem` returns coded issues (`unknown-base`, `manufacturer-base`, `missing-slot-part`, `part-category`, `unknown-affix`, `empty-name`, …) and `compareLootItems` returns sorted per-stat deltas plus a weighted score with caller-named `lowerIsBetter` stats.
- `lootWeaponDefinition` (`@jgengine/core/loot/lootWeapon`) projects a rolled item onto a `WeaponDefinition` through a caller stat map, so a generated gun runs in `createWeaponSystem` after `assertWeaponDefinition`.

### Numbers

- Test catalog (60/25/10/4/1 rarity weights) over 10,000 drops at level 20, fixed seed: common 59.41% (target 60%), uncommon 25.66% (25%), rare 9.58% (10%), epic 4.20% (4%), legendary 1.15% (1%); every tier inside its 4σ binomial bound. All 10,000 items validated with zero issues and composed names (e.g. `Voss Rare Long Keen Lightframe of Reach`, `Tallow Long Lightframe`, `Voss Snub Lightframe of Steadying`).
- Level curve `[[1,1],[15,1.6],[30,2.4],[60,4]]`: a level-60 roll's base and additive affix values are 4× the same seed at level 1; maker personalities move the same roll (`Voss` +power/−cadence, `Tallow` the reverse).
- A rolled epic projects to a hitscan `WeaponDefinition` (rate, damage, integer magazine capacity, spread, range), passes `assertWeaponDefinition`, and its first `tick` fires one shot and one impact through `createDamageRuntime` with the rolled capacity spent.
