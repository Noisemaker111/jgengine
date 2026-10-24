### Changed

- `bun run land:batch <branch ...>` lands several finished, independent branches as one push: it merges each onto the growing `beta` tip in order, verifies every merge, skips a branch that conflicts or fails with the reason, and pushes the survivors once so CI runs once instead of once per branch.
- `bun run land:batch --explain` reads the recorded batch and names the commit a red tip most likely came from.
