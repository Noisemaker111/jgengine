HUD panels place themselves without overlapping at phone, tablet and desktop sizes.

### Migrate

- `HudPanel` no longer takes `lane` or `compact`. Every flowing panel is placed by one solver: drop `lane`, replace `compact="hide"` with `priority="tertiary"` (it folds into a toggle when there is no room), and drop `compact="keep"` and `compact="chip"`.
- `HudCanvas` no longer takes `compactScale`; the canvas picks the zoom.
- `resolveHudLanes`, `HudLaneSlot`, `HudLanePlacement`, `HudLaneConfig` and `HudLaneLayout` (`@jgengine/core/hud/hudLanes`) are gone. Use `arrangeHudPanels` (`@jgengine/core/hud/hudPanelLayout`).
- `HudLanesPreview` is now `HudAutoLayoutPreview` (`@jgengine/core/hud/hudPanelLayoutPreview.view`).
- Pick one `anchor` per panel. A game that switched anchors by screen size can drop the switch.

### Added

- `arrangeHudPanels` (`@jgengine/core/hud/hudPanelLayout`) places HUD panels by anchor, order and priority so none overlap: stacked panels slide to the nearest free spot, lower priorities fold into a toggle, and the HUD shrinks only when nothing else fits.
- `HudPanel` `chip` names the toggle a panel folds into on any display. Opening the toggle shows the panel beside it.
- `useRegisterLayoutRegion` takes a `placement` key; a new key re-measures a region that moved without resizing.

### Changed

- `HudCanvas` places every panel with `arrangeHudPanels` instead of nine independent anchor regions, so panels in different anchors no longer run into each other on phone and tablet screens.
- Beacon Bastion, Deepward, Harbor Heat, Odd Orbit and Scrap Signal declare one anchor and a priority per panel; their per-size placements are gone.
