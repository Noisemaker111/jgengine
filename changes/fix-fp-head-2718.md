in first person, walking, running and jumping no longer show the player's own neck, hair or collar; the body slides so its folded head stays under the camera

Root cause: the camera sits at a fixed eye height over the entity, but walk and run clips lean the torso forward, so the neck stump and collar swung out in front of it

Closes #2718

Engine seam: packages/core/src/camera/firstPersonBody.draw.ts, packages/core/src/model/useModelInstance.draw.ts

### Added

- fernwild-first-person-walk flow shoots first person mid-walk, mid-run and mid-jump
- `keepHeadUnderEye` (`@jgengine/core/camera/firstPersonBody.draw`): Slides `body` across the ground so its folded head sits straight under the `eye` camera, from `rest` (the body's own position before any slide).

### Fixed

- in first person, walking, running and jumping no longer show the player's own neck, hair or collar; the body slides so its folded head stays under the camera
