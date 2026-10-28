quadrupedStride gives a quadruped's gait, stride length, stride frequency and fore and hind duty factors at any speed from Alexander and Jayes's dynamic similarity, with walk to trot at Froude 0.35 and trot to gallop at 2.5.

### Added

- quadrupedStride gives a quadruped's gait, stride length, stride frequency and fore and hind duty factors at any speed from Alexander and Jayes's dynamic similarity, with walk to trot at Froude 0.35 and trot to gallop at 2.5.
- animalTopSpeed gives an animal's top running speed from its mass (Hirt et al. 2017), and compareQuadruped scores a game creature's walk and sprint against a real animal of its size.
- bun run games:capabilities locomotion --creatures <module>#<export> prints that comparison for a game's creature table; --validate also checks the quadruped reference.
- `ALEXANDER_JAYES_CURSORIAL` (`@jgengine/core/movement/reference/quadrupedGait`): The dynamic-similarity fits of R. Also `CreatureLocomotion`, `FroudePowerLaw`, `MAMMAL_TOP_SPEEDS`, `QUADRUPED_GAIT_TRANSITIONS`, `QuadrupedBody`, `QuadrupedComparison`, `QuadrupedGait`, `QuadrupedStride` and 7 more.

### Changed

- Part of #2767
