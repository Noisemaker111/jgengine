The dispatch booth, parcel towers, coconut palm, Islander bus, HHPD light bar and Mainsail poster are original Harbor Heat art authored for this repository. The GLBs use geometry, flat PBR materials and vertex colours; they contain no external textures or third-party meshes. `node scripts/author-harbor.mjs` rebuilds every one of them from the readable source, with copyright metadata embedded. The repository license applies.

Each authored model is merged to one mesh per material, so detail costs triangles, not draw calls: the palm is three primitives (bark, leaves, coconuts) where it used to be 38, the bus ten and the light bar four.

`mainsail-palm-far.glb` is the level Harbor Heat draws past 60 m. `author-harbor.mjs` builds it from the same parameters as the near palm (same trunk curve, frond angles and lengths), with fewer trunk rings, 11 leaflet pairs per frond instead of 30, and three coconuts instead of seven, so the silhouette holds while the triangle count drops from about 5,100 to about 940.

`islander-bus.glb` is the Islander's body: a 10.4 m midi city bus on the vehicle's 7.2 m wheelbase, front at +Z. `hhpd-lightbar.glb` sits on the library's concept car (`vehicle/sports-car`, CC-BY, credited in game) to make the HHPD cruiser, which `src/game/world/models.ts` resprays navy with white upper panels.

`city-block.glb` is the unit building block (1 m cube, base at y = 0) every city building draws: `node scripts/author-city-block.mjs` rebuilds it. Its sides carry the material `facade` and its top `roof`; each placement stretches it to its lot with `visual.scale` and lays an ambientCG facade scan (brick red, grey and brown, blue and mirror glass, all CC0) over `facade` at real-world tile size. It has no textures of its own.

Street furniture comes from the engine's realistic model library (CC0 scans from Poly Haven), pulled by `bun run games:provision harbor-heat` into `public/models/library/`; `src/game/world/props.ts` maps each prop to its library name and builds the credits from the same names. Every model's source, author and license lives on its library entry, which is what the credits read.

Existing KayKit, Quaternius and ambientCG assets retain their original credits and licenses. These additions do not replace those attributions.
