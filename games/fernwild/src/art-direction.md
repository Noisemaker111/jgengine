# Art direction

A lush, dangerous tropical island: white beaches, turquoise shallows, dense jungle and cliffs, dinosaurs moving in herds across open meadows. Stylized low-poly survival, bright at noon and properly dark at night.

## Reference images
- ARK: Survival Evolved's The Island for layout, biome bands and the beach-to-jungle climb.
- Valheim for low-poly forms under rich lighting and fog.
- Len's Island for a clean stylized survival island palette.
- Film: *Jurassic Park* (1993) Isla Nublar: humid haze, ferns, the first sight of a herd.

## World palette
- `#3f7a3a` jungle green: canopy and undergrowth.
- `#8fb85a` meadow: open grassland where herds graze.
- `#efe1b8` beach sand: shoreline and dunes.
- `#3fd0c9` shallows teal: lagoon water and the sea's near edge.
- `#0b4f78` deep sea: open water and night sky tint.
- `#8a6a43` hide brown: survivor gear, thatch, tamed saddles.
- `#e7c84a` supply gold: drops, obelisk glow, loot. The only warm glow in the jungle.

## Material language
- Characters: Quaternius Ultimate Modular Men and Ultimate Modular Women (CC0). Add both to the catalog: they swap outfits by part, which the character creator and the cloth tiers need, and they match the creature proportions. The Rocketbox `human/man-casual` and `woman-casual` bodies leave.
- Creatures: Quaternius only. Keep the 14 Quaternius creatures; add Quaternius Animated Dinosaurs and Ultimate Animated Animals to replace the 27 Poly by Google stand-ins, which have a different shading and scale.
- Environment: `quaternius-stylized-nature` for grass, ferns, flowers, rocks and trees; the engine's grown plants and rock generators keep their shapes but take the palette above.
- Base pieces: modular thatch, wood and stone walls, floors and roofs authored in the Quaternius proportion; `quaternius-lowpoly-survival-pack` for campfires, storage and crafting stations.
- Ground: ambientCG `Ground033` beach, `Grass005` meadow, `Ground020` jungle floor, `Rock035` cliffs.
- No primitive props: supply drops, obelisks, cave crystals, eggs, bodies and every base piece stop being boxes, spheres and cones.

## Lighting mood
- Day: tropical late morning, high sun (elevation 58), warm white key `#fff0d0`, strong blue sky fill.
- Night: moonlit blue `#7f9bd0`, dark enough that a torch matters.
- Fog `#b8dcd8` by day and `#0c1d2c` by night, near 180, far 900; jungle valleys hold a low haze.
- HDRI: Poly Haven `kloofendal_38d_partly_cloudy_puresky` at intensity 0.9, faded to the night sky by the day cycle.
- LUT grade "tropical lush": shadows `#1f3b3a`, midtones `#c9d39a`, highlights `#fff2cf`, saturation 1.14, contrast 1.06, tint 0.3.

## Silhouette rules
- Each species has one defining outline at 100 m: crest, horns, sail, neck length, wing span. Tints never stand in for a missing shape on a dangerous species.
- The survivor is slim beside every creature over dodo size.
- Obelisks are the tallest built things on the island and glow at their tips.
- Trees: palms on the coast, broad canopies inland, conifers on the peaks.

## UI typography
- Display: Oswald (Google Fonts, OFL). Body: Source Sans 3 (Google Fonts, OFL). Ship both as files in `src/art/fonts/`; Georgia and the engine stack leave.
- HUD kit: `holo`, accent `#3fd0c9` shallows teal: the implant-style HUD of the reference.

## Chosen look
- `look: "cinematic"`, `mood: { preset: "day", sun: { elevation: 58, color: "#fff0d0" }, horizonColor: "#b8dcd8", fog: { near: 180, far: 900 } }`, with the existing day cycle driving the moon at night.
- Environment source `{ kind: "hdri", url: <kloofendal_38d_partly_cloudy_puresky>, intensity: 0.9 }`.
- Post: ACES, bloom 0.25 for obelisks and torches, AO on, vignette 0.12, the LUT above.

## Pass list
1. Swap the Rocketbox survivor bodies for Quaternius Ultimate Modular Men and Women; cloth tiers become part swaps.
2. Replace the Poly by Google creatures with Quaternius dinosaurs and animals.
3. Replace primitive supply drops, obelisks, crystals, eggs and bodies with authored or pack models.
4. Rebuild base pieces as modular thatch, wood and stone kits; survival-pack stations.
5. Dress the ground: Ground033 beaches, Grass005 meadows, Ground020 jungle floor; dense ferns at the jungle edge.
6. Set the day mood, the HDRI, a dark moonlit night and the tropical lush LUT.
7. Build a real HUD and menu on the holo kit with Oswald and Source Sans 3; credits in game.
8. Ambient life: birds and pteranodons overhead, fish in the shallows, insects and dust in jungle light shafts.
