### Fixed

- Shared heightfield player movement stops jumps at blocking ceiling undersides and lands on crossed object tops, including thin bounds and full authoritative simulation steps. Blocked curb and terrain rises retain valid headroom and recheck alternate-axis wall collision instead of penetrating a roof and ejecting the player sideways.
- Heightfield descent and landing recovery now follow the accepted terrain/object support rather than prematurely landing at the previous support height. Exact-clearance contacts remain walkable at translated coordinates; explicit height and `beforeCommit` policies retain their authority.
