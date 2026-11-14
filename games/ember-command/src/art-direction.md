# Art direction

LAWN ORDER: a suburban backyard at high summer noon, seen from an ant's height. Grass blades are a
forest, clover leaves are umbrellas, a dropped strawberry popsicle is a pink lake of sugar, the garden
hose is a green river and the patio stones are grey plateaus. Bright, saturated and a little toy-like,
readable from a high RTS camera.

## Reference images
- *A Bug's Life* (1998) and *Antz* (1998) for heroic ant scale and oversized, readable bug silhouettes.
- *Pikmin 3* for a real garden photographed as a giant world: saturated greens, crisp sunlight.
- *Grounded* (Obsidian) for backyard landmarks as level geography (hose, patio, sprinkler).
- *SimAnt* for the pheromone-trail and red-vs-black colony framing.

## World palette
- `#4f9a2c` lawn green low, `#7cc23c` sunlit blade tips: the ground and grass forests.
- `#d42a1c` red colony: every red ant body, nest flags, the HUD action colour.
- `#26222b` black colony, `#4b2a6b` its violet flags and health bars.
- `#ff3d6e` popsicle pink, `#e0a95a` cookie crumb, `#6cbf3a` leaf pulp.
- `#2f9e3a` hose rubber with a `#ffd23f` stripe; `#cdc6b8` patio concrete.
- `#ffb02e` pheromone amber (additive glow on the ground).
- `#fff6d6` seed-packet cream for UI cards, `#3f7a24` leaf green frames.

## Material language
- Ants, beetles, wasps, chambers, food and dressing are stylized procedural meshes (`world/bugMeshes.ts`):
  vertex-coloured, glossy chitin (roughness 0.4), matte soil mounds, shiny popsicle and dew. No asset
  pack has ants, and a hand-built body gives each caste its silhouette.
- Plants: Quaternius stylized nature (`quaternius-stylized-nature`: Grass_Wispy_Tall, Clover, Fern,
  Flower groups, mushrooms, pebbles) scaled to tower 3–10 m over 2 m ants, swaying in the gust field.
- Bees over the flowers: the Quaternius cute-monster Bee.
- Ground: ambientCG macro grass and macro dirt scans (`foliage/grass-macro`, `ground/dirt-macro`).
- The hose, the mower lane and the patio stones are authored scene studios drawn from the document.

## Lighting mood
- Blazing noon: sun high in the south-east (azimuth 150, elevation 58), key `#fff1c4`.
- Fill: the clear-noon HDRI at 0.9, so shadows stay green and blue rather than grey.
- Haze `#cfe9b0`, near 95, far 230: the lawn dissolves into summer air past the fence.
- LUT grade "tropical lush" for saturated greens, vignette 0.24.
- Night (a hazard, not a mood): a deep-blue HUD wash ramps over the lawn.

## Silhouette rules
- Each caste has one shape cue: worker (even, small), scout (long legs, long glowing antennae, small
  gaster), soldier (huge head and jaws), spitter (swollen green-tipped gaster curled over its back),
  tank beetle (navy dome, rhinoceros horn, red stripe), Marshal (big head, gold crest), black major
  (biggest jaws on the field), paper wasp (hovering, striped yellow-black, glassy wings).
- Team colour is the whole body: red ants are red, black ants are black; health bars are sunflower
  gold over the red colony and violet over the enemy, so they read against green.
- Chambers are soil mounds wider than tall, each with one top feature: nest (flags, two entrances),
  barracks (thorn ring), fungus garden (mushroom caps), nursery (eggs), granary (seeds), acid mound
  (glowing green bulb), brood mound (grey eggs on dark soil).
- Grass forests form solid walls at the field edges; the play field stays open lawn with clutter.

## UI typography
- Display: Lilita One. Body: Nunito. Both from the engine font library (OFL).
- HUD kit: seed-packet cream cards with rounded leaf-green borders, moss command tokens, red-ant
  action buttons and sunflower highlights.

## Chosen look
- `mood: { preset: "bright", sun: { azimuth: 150, elevation: 58, color: "#fff1c4" }, horizonColor: "#cfe9b0", fog: { near: 95, far: 230 } }`.
- Environment source `hdriEnvironment("clear-noon", { intensity: 0.9 })`.
- Post: ACES, SMAA, AO 1.2, bloom 0.22, LUT `tropical-lush`, vignette 0.24.

## Pass list
1. Procedural caste bodies with walking tripods and carried loads. (done)
2. Backyard studios: hose tube with brass couplings, mower lane with flags, patio pavers. (done)
3. Grass forests, clover patches, flowers and pebbles from the stylized-nature pack. (done)
4. Hazard visuals: sprinkler head and droplet arc, red push mower, lens beam and burning spot, rain. (done)
5. Shade canopies over the authored shade spots (giant leaves casting real shadows), popsicle-stick bridges at the hose crossings. (done)
6. Splash particles where the jet lands; grass clippings behind the mower.
