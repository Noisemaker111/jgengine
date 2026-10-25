### Fixed

- The shell's settings dialog now draws inside the game's HUD theme and UI kit. It takes the kit's colours and type, or the game's `hudTheme`, and it sits above notices and the result screen. The selected tab, toggles and hairlines read on light kits.
- Continue and Saves panes on a kit:
  - The save name, eyebrow, saved time and Resume button read on every kit, using the kit's accent ink.
  - On a short pane the picture shrinks first, so Resume stays on screen.
  - Save cards grow instead of clipping their Load button.
  - Long chips trim on phone cards.
  - The pane scrolls inside the kit panel, and its heading stays put.
- Ink and paper panel heads keep the aside (distance, count) on the title's row. A long eyebrow pushes the title under it, and titles wrap only between words.
- The `KitObjective` direction arrow has a shaft, so it reads as pointing where it points.

### Added

- `UiKitMenuPreview` fixtures for the Continue and Saves panes on every kit (`UiKitMenu-<kit>-continue`, `-saves`).
