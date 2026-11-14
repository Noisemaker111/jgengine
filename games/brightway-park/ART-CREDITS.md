# Hauntworks artwork

The fairground models, the haunt's props and gloom pieces, the gate sign and the UI in this game are
original artwork authored for the park (first as Brightway Park, now graded and extended for
Hauntworks). `scripts/author-models.mjs` reproduces the seventy-nine GLB meshes in
`public/art/models/` (rides, moving ride parts, coaster track pieces, stalls, facilities, gloom, scare
props, paths and spook posts) and `motion.json` using native geometry; the kit is in `scripts/models/`,
and `material()` in `scripts/models/core.mjs` grades every colour into the night palette. No
third-party models are embedded in those meshes.

## Library models (CC0)

Loaded from the engine's shared asset library and credited in the root `CREDITS.md` (Quaternius,
Kay Lousberg):

- Quaternius Ultimate Animated Characters: the living, the ghosts (washed translucent) and the spooks.
- Quaternius Stylized Nature: dead and twisted trees, toadstools, standing stones, wispy grass.
- Quaternius Fantasy Props: the Fog Cauldron, Crockery Shelf, Possessed Vase, Candelabra of Whispers,
  barrels, potions, mugs and books on the stall counters.
- Quaternius Low Poly Desert: bone piles. Quaternius Low Poly Food: pumpkins, apples, sundaes.
- Quaternius Textured Cute Monsters: the bats over the pier.
- Quaternius Lowpoly Buildings: the town behind the fence. KayKit City Builder: benches.

## Bats

The bats' fallback, if the monster pack is not provisioned, is the Dove by Poly by Google (CC-BY 3.0,
https://poly.pizza/m/2jmH3trzPFf), tinted near-black. Ground scans are ambientCG from the material
library (`foliage/grass-macro`).
