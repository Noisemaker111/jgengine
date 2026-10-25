### Changed

- Move the probe games into this repo's `games/` folder
- Games run engine source from the same commit, so `jgengine-games`, its engine pin and the cross-repo bump workflows are gone. CI's `games` job checks only the games a change reaches.
- `jgengine create`'s agent rules point at the repo's lowercase `games/*` folder.
