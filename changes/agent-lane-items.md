### Added

- `rollDrop` (`@jgengine/core/loot/drop`) rolls one deterministic item from a seed and `compareToEquipped` turns it into per-stat deltas against worn gear with a weighted verdict a HUD can render.
- `createRunHaul` (`@jgengine/core/loot/haul`) gates carried loot by weight through the shared encumbrance rules, banks what the persistent stash fits, and discards the run's haul when the game calls `fail`.
- `salvageItem` and `createItemLedger` (`@jgengine/core/loot/salvage`) break an item down for the currency its level and rarity say and claim the instance, so a salvaged item cannot be salvaged, equipped or sold again.
- `stockVendor` and `createVendorRotation` (`@jgengine/core/loot/vendor`) fill a `ShopStock` with rolled items priced through the economy wallet, with a run-count restock rule the game authors.

### Changed

- Loot bases and affixes take `minLevel`, so `rollLoot` only draws from entries at or below the item level. Loot bases take `mass`; rolled items carry it for carry checks.
