### Migrate

- One exported name, one definition. React views that shared a name with their core model are renamed:
  - `Codex` component → `CodexPanel` (`@jgengine/react/codex`); `Codex` stays the core model type.
  - `TalentTree` component → `TalentTreePanel` (`@jgengine/react/talentTree`).
  - `DragState` in `@jgengine/react/dragLayer` → `DragLayerState`.
  - `usePresence` in `@jgengine/react/presence` (mount/exit timing) → `useMountPresence`; `usePresence` is the social-presence hook in `@jgengine/react/hooks`.
- `SlotGrid` and `ProximityPrompt` are removed from `@jgengine/react/components`; use `InventoryGrid` or `Hotbar`, and `InteractionPrompt`.
- `easeOutCubic` is no longer exported from `@jgengine/react/tweenNumber`; import it from `@jgengine/core/anim/easing`.
