Scrap Signal's crosshair shows over the world with a dark edge; it sat under the HUD layer and its cream ticks vanished against the sand

Engine seam: packages/core/src/camera/GameFirstPersonCamera.draw.tsx, packages/core/src/camera/cameraConfig.ts, packages/core/src/camera/cameraRigs.draw.tsx, packages/core/src/combat/telegraph.ts, packages/core/src/combat/telegraphPulse.ts, packages/core/src/hud/WorldHud.draw.tsx

### Added

- a to-counters capture flow that holds aim and checks the crosshair closes, and frames an enemy's wind-up warning
- Scrap Signal's enemies wind up before they hit: a melee swing shows a red arc and lands only on a player still inside it, a gunner draws its aim line and fires where it locked, killing a fighter mid-swing calls the blow off, and a gunner the player rushes backs away
- pointInTelegraph is public, so a game can resolve its own dodgeable attack
- Scrap Signal's guns handle through the engine's weapon handling: right mouse aims down sights with a zoom and a tighter cone, crouching braces, moving widens the cone, held fire blooms it, the crosshair opens with it, and sprinting lowers the gun
- the camera's weapon hook receives the running game context, so a game reads its per-run weapon state there
- `pointInTelegraph` (`@jgengine/core/combat/telegraph`): Whether a world point stands inside a telegraph's shape, on the ground plane.

### Fixed

- Scrap Signal's crosshair shows over the world with a dark edge; it sat under the HUD layer and its cream ticks vanished against the sand
- a Scrap Signal save that lost the player's chassis no longer boots into an empty world; the chassis is rebuilt at the nearest discovered station with its level, gear, cash and missions, the rebuild fee is charged once, and a notice says what was lost
- cone and line telegraphs draw facing the way their hit test faces; they were turned by the wrong angle and mirrored
- Scrap Signal's reload key cancels a reload in flight, and the trigger cuts a reload short while rounds are still loaded
- Scrap Signal's walk speed keeps the move-speed talent after a respawn or a Power Surge
