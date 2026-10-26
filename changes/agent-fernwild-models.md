Every one of Fernwild's 55 species now has a real animal model instead of a duck or boar stand-in. Fourteen are Quaternius' animated CC0 animals and dinosaurs (raptor, T-Rex, triceratops, stegosaurus, parasaur, apatosaurus, wolf, stag, horse, sheep, yeti, spider, frog, snake). The rest are free Poly by Google animals (CC-BY 3.0) that ship without a skeleton, so the engine now rigs them: it finds the legs, neck, tail and wings from the mesh, weights the skin, and gives them idle, walk, run, attack and death clips. Where no free model of the animal exists, its nearest relative stands in at the species' size and colour (the dodo is a dove, the phiomia an elephant, the pteranodon an eagle, the ankylosaurus a giant armadillo); `games/fernwild/src/game/data/creatureModels.ts` lists every one with its source page, and the in-game credits are generated from that table.

`games/fernwild/scripts/bake-creatures.ts` downloads each model, rigs the static ones and makes the animated ones matte (their authors' metalness read near black under the island's sky).

Engine seam: packages/core/src/creatureBody/ (new glbRead.ts, autoRig.ts, gait.ts; glbWrite.ts gains UVs, vertex colours, skins and embedded images; bodyPlan.ts now shares gait.ts)

Prevention: autoRig tests check a static body gets four legs at its corners, a neck in front and a tail behind, every vertex fully weighted with feet on their own leg and the snout on the neck, a model facing +x turned to +z, a biped's two legs, and a skinned GLB that reads back. Fernwild's creature-model test fails if a species has no model, a model file is missing, or a downloaded model is worn by nobody.

### Added

- `readGlbModel(bytes)` in `@jgengine/core/creatureBody/glbRead`: a binary glTF's meshes baked into model space (positions, normals, UVs, colours, indices), its materials and embedded images.
- `autoRig(model, { shape, facing?, head?, tail?, ... })` in `@jgengine/core/creatureBody/autoRig`: give a static quadruped, biped, flyer, bug or serpent a skeleton, skin weights and gait clips, ready for `encodeGlb`.
- `gaitClips(rig)` in `@jgengine/core/creatureBody/gait`: the Idle, Walk, Run, Attack and Death clips for any limb-and-tail rig, shared by generated bodies and rigged models.
- `encodeGlb` writes UVs, vertex colours, skins (joints, weights, inverse bind matrices) and embedded base-colour images.
