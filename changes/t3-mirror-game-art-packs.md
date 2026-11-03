Closes #2902

Root cause: the depth texture the depth-reading effects sample was attached to one of the composer's two ping-pong buffers, so when SSR skipped its swap the scene drew into the target whose depth it was reading, a WebGL feedback loop that zeroed the frame.

Engine seam: packages/assets/src/catalogs/grades/index.ts, packages/assets/src/catalogs/grades/sun-bleached-comic.ts, packages/assets/src/catalogs/hdris/desert-noon.ts, packages/assets/src/catalogs/hdris/highland-clouds.ts, packages/assets/src/catalogs/hdris/index.ts, packages/assets/src/download.ts, packages/assets/src/generated/index.ts, packages/assets/src/itchArchive.ts and 10 more

### Added

- `ItchDownload` (`@jgengine/assets`): A free itch.io download: the game page URL and the title of the upload to take. Also `PolyPizzaBundleDownload`.
- `ItchDownload` (`@jgengine/assets/manifest`): A free itch.io download: the game page URL and the title of the upload to take. Also `PolyPizzaBundleDownload`.
- `PolyPizzaModel` (`@jgengine/assets/polyPizzaArchive`): One model card on a Poly Pizza bundle page.
- `QUATERNIUS_HUMANOID_SCHEME` (`@jgengine/core/anim/skeletonStandard`): Quaternius humanoids (Ultimate Modular Men and Women, Toon Shooter): `Root > Body > Hips > Abdomen > Torso > Chest`, a shoulder per side the standard folds into `chest`, and `Wrist.L/.R` as the hand.
