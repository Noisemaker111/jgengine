### Added

- `pointer.select` modifiers: Shift+click toggles an entity, Shift+drag adds the box to the selection, and double-click or Ctrl+click selects every on-screen entity of the same `pointer.selectKind(id)`.
- `pointer.controlGroups` (`true` or `ControlGroupOptions`): Ctrl/Cmd+digit binds the selection, Shift+digit appends, a digit recalls (dropping dead or filtered ids), a second tap centres the camera. While on, digit keys no longer reach `game.input` action bindings.
- `ctx.scene.entity.controlGroups`, the `SelectionBookmarks` store those keys write; a despawned entity drops out of every group.
- `ctx.camera.panTo({ x, z })` queues a one-shot jump of the `rts` rig's pan center (clamped to `rts.bounds`) for minimap clicks and group focus.
- `resolveControlGroupIntent` takes `appendModifier` and returns an `append` intent.
