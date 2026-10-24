### Added

- `RuntimeSave.peek(slot)` (`@jgengine/core/runtime/runtimeSave`) reads another slot's stored world as a `RuntimeSaveSlot` (`{ world, savedAt }`) without hydrating, switching slots, writing or changing status, so a save-select pane can show a slot it is not on. The `world` is the exact document `load()` of that slot would apply, migrated through the same `migrate`. `GameSave.peek` already answered this; `ctx.game.save` did not.
- `RuntimeSave.deleteSlot(slot)` removes one inactive slot's bytes and its slot-index entry, leaving the others readable. It resolves `false` for a slot holding nothing and refuses the active slot: the live world is that slot's state, so an autosave would write it back seconds later. `clear()` owns the active slot.

### Changed

- `RuntimeSave.clear()` cancels a pending autosave. A debounced write armed before the clear used to fire afterwards and recreate the save the game had just deleted.
