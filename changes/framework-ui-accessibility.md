### Added

- `ScrollRail` supplies native horizontal scrolling, visible overflow navigation, and keyboard focus reveal for caller-owned controls.

### Fixed

- Shared settings categories remain reachable on narrow screens and short sidebars; dialogs share focus trapping, Escape policy, and return focus.
- The floating joystick capture zone yields to interactive HUD panels while touch action buttons retain their layer.
- Replacing a focused action preserves a keyboard entry point into the action bar.
- `useDialogBehavior` keeps focus trapping and the original opener when an open dialog replaces its root; portalled children retain focus and return to the replacement parent.
