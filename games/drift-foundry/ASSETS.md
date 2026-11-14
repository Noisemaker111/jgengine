# Cleanup on Aisle 9 art

Shopping carts, shoppers, cart mods, products, store fixtures, the shutter and floor scrubber and the
tugger train in `src/game/art/` are original procedural geometry authored for this game. Regenerate
them with `bun --cwd=games/drift-foundry run author-models`. Every product label is invented; no real
brands appear.

Pack pieces keep their catalog source credits (the in-game credits are generated from
`src/game/assets.ts`): Kay Lousberg's KayKit City Builder, Space Base and Forest packs, Quaternius'
Toon Shooter Game Kit and Low Poly Animals, and the ambientCG Terrazzo005, Tiles007, Plastic006,
Concrete025 and CorrugatedSteel009 materials. Local `public/models/` and `public/materials/` are
provisioned copies of the engine's licensed asset files.
