### Changed

- A free placement (`place(kind, at, { free: true })`) is still worth its price: selling it refunds the kind's share; cancelling it mid-build returns nothing.

### Fixed

- `defineGameSpec` reports `onReady` for a build that stood before the first frame when the game has no `onRestored`.
