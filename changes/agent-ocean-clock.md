Oceans run on the game's clock and follow the sky's sun.

### Changed

- `Ocean` (`@jgengine/shell/water`) animates its waves on the game clock (`ctx.time.advancedSeconds()`), so the sea stops when the game pauses, follows slow motion and lines up with the water surface buoyancy samples. Before any game time has passed (a title screen), or with no game (an editor preview), it runs on real time.
- Ocean glints follow the sun the mounted `Sky` placed, through the day-night cycle, and fade out once the sun sets; without a sky they keep the fixed day heading. `syncOceanMaterial` takes the sun direction as an optional fourth argument.
