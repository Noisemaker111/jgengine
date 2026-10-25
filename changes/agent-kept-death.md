### Added

- `OnDeathSpec.keep`: an entity whose game owns its death (a downed window, a revive in place) stays in the scene on a lethal hit; `entity.died` fires with `kept: true`, drops and commands still run. `deathRemovesEntity(event)` tells presentation whether the body left, and ragdolls, the dead flag and the death clip skip a kept death.

### Fixed

- A hit is lethal only when it empties the target's last pool, not when it lands on a pool already at its floor.