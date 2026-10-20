### Added

- `ctx.scene.entity.selection` (`@jgengine/core`): the player's selected entities as a reactive `SelectionSet`. The shell pointer (`pointer.select` click / marquee) now writes it instead of private component state, so game HUDs can show the selected unit's card or a "3 units selected" summary and can set the selection themselves (select-all, control groups); the selection ring follows either way. Despawned ids drop out.
