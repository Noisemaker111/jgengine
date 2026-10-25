### Fixed

- `gameFrameVars()` installs the frame stylesheet itself. An element dressed by hand used to show up bare when no `GameFrame` had mounted yet, for example a HUD in a game that starts straight in play with no menu before it.
