CI test shard i runs its 186 files in four lanes; the physics reference sims (bonded rock 140 s, DEM 86 s) ran one after another in a single process for 410 s

Root cause: the reference sims moved from packages/core to scripts (#2838) while the slow-file table still named their old paths, so they left shard d's lanes for shard i's single process

Root cause: the reference sims moved from packages/core to scripts (#2838) while the slow-file table still named their old paths, so they left shard d's lanes for shard i's single process; under four lanes the exit-file race in background tasks showed up

### Fixed

- CI test shard i runs its 186 files in four lanes; the physics reference sims (bonded rock 140 s, DEM 86 s) ran one after another in a single process for 410 s
- background await could report a failed task as exit 0 when it read the exit file before the code was written
