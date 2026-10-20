### Fixed

- `sim_advance` (`@jgengine/shell` agent bridge) yields to the browser every simulated second, so models for entities spawned mid-advance mount as in play; a 30 s advance through Beacon Bastion's first wave previously left every raider with health bars but no model.
