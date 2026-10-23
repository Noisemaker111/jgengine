### Added

- `GameSave.deleteSlot(slot)` and `SaveStore.deleteSlot(slot)` remove one slot's payload and drop it from the slot index; they resolve `true` when a document was removed and `false` for an unknown slot. Deleting the active slot resets the live state to the initial document. `load()` no longer lists a slot that holds nothing, so a deleted slot cannot return.
- `HudPanel` takes `lane` (`@jgengine/react`): blocks naming the same anchor and lane stack without overlap, lanes in one anchor sit side by side, and `resolveHudLanes` resolves the rectangles. A moved panel leaves its lane and keeps its authored placement.
- `hudBlockOverlaps` and `formatHudOverlapReport` (`@jgengine/react`) name every pair of rendered HUD blocks whose rectangles intersect, with both ids and the viewport; `HudCanvas` warns with that report in a dev build.

### Fixed

- `HudCanvas` resolved its host with `canvas.parentElement`, which is `HudThemeRoot`'s `display: contents` element and measures 0x0 — the boundary overlay, the HUD-fit measurement and the new overlap report never ran under the standard HUD root. It now uses the nearest ancestor with a real box.
- The HUD boundary check returned early whenever nothing overflowed, so a later report in the same pass could never run.
