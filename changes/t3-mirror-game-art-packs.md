Closes #2902

Root cause: the depth texture the depth-reading effects sample was attached to one of the composer's two ping-pong buffers, so when SSR skipped its swap the scene drew into the target whose depth it was reading, a WebGL feedback loop that zeroed the frame.

Engine seam: packages/assets/src/catalogs/grades/index.ts, packages/assets/src/catalogs/grades/sun-bleached-comic.ts, packages/assets/src/catalogs/hdris/desert-noon.ts, packages/assets/src/catalogs/hdris/highland-clouds.ts, packages/assets/src/catalogs/hdris/index.ts, packages/assets/src/download.ts, packages/assets/src/generated/index.ts, packages/assets/src/itchArchive.ts and 10 more

Bends: Scrap Signal's credits test now names each of the six Quaternius packs the game ships in one loop (six checks where one regex stood) and drops KayKit and Rocketbox, which its look pass removed from the game.

### Added

- Asset sources can download Poly Pizza bundles and free itch.io uploads; Quaternius Toon Shooter, Modular Men and Women, Animated Animals and Dinosaurs and KayKit Forest join the catalog, each CC0, and the packs release mirrors them for cloud sessions.
- Scrap Signal's look pass: comic look at desert noon, Quaternius Toon Shooter crews, mechs and robot, desert props, cracked ground, sun-bleached grade and the broadcast kit in signal orange.
- Beacon Bastion's look pass: KayKit Adventurers raiders with weapons in hand, Medieval Hexagon towers and keep, KayKit Forest trees and rocks, golden highland light, warm filmic grade and the parchment kit in beacon ember.
- Quaternius humanoid bone mapping; Fernwild's survivors are Quaternius Modular Men and Women, and purlovia, allosaurus, baryonyx and diplodocus wear Quaternius models.

### Fixed

- Post effects that read depth sample the scene pass's own target, so a frame never writes into the depth it reads and the 3D view no longer boots black (#2902).
- Terrain scans and streamed cell models load through the asset base, so a game served from its folder gets its ground textures instead of an HTML page.
- A hidden or attached node whose name a multi-primitive mesh's loader-named part also uses resolves to the authored node instead of failing as ambiguous.
- Fernwild's Quaternius survivors keep the engine's jump, swim, punch, swing and gather actions on top of their own idle, walk and run.
- Beacon Bastion's forest is tinted toward highland moss and sized like the old pines; the keep and towers stand tall enough to read from the defense camera.
- The KayKit Medieval Hexagon pack is listed in the asset library once, from its measured pack index.
- The curated HDRI count allows the two new skies (cap 16 to 18, as each earlier look pass raised it for its own skies).

### API

- `ItchDownload` (`@jgengine/assets`): A free itch.io download: the game page URL and the title of the upload to take. Also `PolyPizzaBundleDownload`.
- `ItchDownload` (`@jgengine/assets/manifest`): A free itch.io download: the game page URL and the title of the upload to take. Also `PolyPizzaBundleDownload`.
- `PolyPizzaModel` (`@jgengine/assets/polyPizzaArchive`): One model card on a Poly Pizza bundle page.
- `QUATERNIUS_HUMANOID_SCHEME` (`@jgengine/core/anim/skeletonStandard`): Quaternius humanoids (Ultimate Modular Men and Women, Toon Shooter): `Root > Body > Hips > Abdomen > Torso > Chest`, a shoulder per side the standard folds into `chest`, and `Wrist.L/.R` as the hand.
