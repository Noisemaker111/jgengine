### Added

- `createEquipment` (`@jgengine/core/inventory/equipment`) wears gear by slot: slot defs declare accepted kinds and the slots they block, item defs declare the slots an item may occupy, a filled slot swaps and hands back the replaced item, and a two-handed item and the slot it blocks cannot both be filled. `state()` / `restore()` round-trip the worn set; a devtools probe reports filled slots.
- `characterLoad` and `canCarry` (`@jgengine/core/inventory/carryLoad`) weigh carried inventories plus worn gear against a capacity and hand back the shared encumbrance bands (tier, `moveMultiplier`, sprint/jump gates, `remaining`), so a stash left out of `carried` adds no weight.
- `fitShapedItem` (`@jgengine/core/inventory/shapedGrid`) places a shaped item at its first fit or names why not: `too-large` (with both sizes), `no-space`, `budget-exceeded`.
- `InventorySet.snapshot()` / `restore()` / `reset()` (`@jgengine/core/inventory/inventoryModel`) save and reload every declared inventory as detached plain data, so a bag and a stash never share live slots.
- `splitStack` takes an optional stack `limit`, rejecting `over-stack` instead of merging past the max stack.
