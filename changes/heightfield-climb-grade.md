### Added

- Heightfield walking supports an optional `movement.maxClimbGrade` uphill rise/run limit, with axis sliding and accepted-position foot grounding. `movement.climbGradeHeight` preserves game-specific terrain sampling independently of effective ground height. Omitted configuration leaves existing movement unchanged.

### Fixed

- Shared grade constraints resolve travel before foot height, avoiding the rejected-neighbor height retained by game-level position interceptors. The restriction also applies during jumps while preserving the vertical arc.
