# Brightway Park artwork

The seaside fairground models, visitor figures, entrance sign and UI in this game
are original artwork authored for Brightway Park. `scripts/author-models.mjs`
reproduces the eighty GLB meshes in `public/art/models/` (rides, moving ride parts, coaster track pieces,
shops, facilities, scenery, paths and people) and `motion.json` using native geometry; the kit is in `scripts/models/`.
No third-party models are embedded in those meshes.

The existing published asset catalogs remain configured for editor compatibility.
The existing KayKit and Quaternius catalog references, ambientCG material catalog,
and provisioned asset-pack credits are preserved. The live park uses the local
original meshes and a procedural terrain palette. Park buildables and visitors
load locally; surrounding host scenery still uses the published catalogs.

## Gulls

The catalog has no gull, so the gulls over the gate and shore use the nearest bird: the Dove by Poly by Google
(CC-BY 3.0, https://poly.pizza/m/2jmH3trzPFf), tinted white. Lawn, promenade, service-path and back-lot ground
are ambientCG scans from the material library (`foliage/grass`, `paving/plaza`, `ground/gravel-fine`, `ground/dirt-road`).
