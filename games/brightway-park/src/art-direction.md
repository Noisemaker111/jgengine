# Art direction

HAUNTWORKS: a derelict seaside fairground at midnight. A cold moon over rotting boards, the old rides
still turning on their own, lanterns burning amber where no one lit them, and the ghosts glowing teal
against the dark. Eerie but readable and a little funny - never gory, never muddy.

## Reference images
- *Luigi's Mansion* (2001, 2019): stylized ghosts with one readable personality each, glowing against
  dark rooms.
- *Ghost Master* (2003): a haunt seen from above, the living as little scurrying figures.
- *Coraline* (2009) and *ParaNorman* (2012): violet-blue night, warm practical lights, toy-like sets.
- Parkitect, for the readable low-poly park grid underneath it all.

## World palette
- `#140f2e` night sky: the zenith, the dark behind everything.
- `#3a2f66` violet horizon: haze, the far town, the shadows' fill.
- `#2f4440` moonlit turf: the ground, cold blue-green.
- `#6a6478` cobble grey: paths and plazas.
- `#2a7d74` spectral teal: ride frames, the good things, the props' reach rings.
- `#9ff5d8` ghost glow: ghosts, cold spots, half the bulbs (emissive).
- `#ffb347` lantern amber: gas lanterns, flames, the other half of the bulbs (emissive).
- `#8c2f4a` blood rose: awnings and ride cars, warnings.
- `#b1a895` bone: trims, headstones, lettering.

## Material language
- Rides, stalls, paths, gates and the haunt's own props stay original authored GLBs
  (`scripts/author-models.mjs`). The kit is written in the old fair's daylight palette; `material()`
  in `scripts/models/core.mjs` grades every colour through the night palette, so the whole park
  reads as the same fair seen decades later, after dark. Amber and teal are emissive.
- New authored pieces: gravestones, wrought-iron railings, gas lanterns, the Moving Portrait, the Cold
  Spot, the Jack-in-the-Coffin and the Flickering Lamp (`scripts/models/haunt.mjs`).
- Library pieces (Quaternius, CC0), tinted for the night in `models.ts`: dead and twisted trees,
  toadstools, standing stones and wispy grass (Stylized Nature), the Fog Cauldron, Crockery Shelf,
  Possessed Vase and Candelabra (Fantasy Props), bone piles (Low Poly Desert), pumpkin lanterns (Low
  Poly Food), bats (Textured Cute Monsters).
- The living: Quaternius Ultimate Animated Characters in night-out clothes with a pale moonlight rim
  so they read on dark ground; hunters and crews carry a red or orange rim.
- Ghosts: the same character pack washed to one translucent, emissive colour each, floating and
  bobbing round the thing they love. Spooks: a zombie, a goblin, a wizard and a stone knight, each
  with a lantern-amber rim.

## Lighting mood
- Moonlight from high in the south-west (azimuth 215, elevation 48), cold `#b8ccff`.
- Violet sky fill so shadows stay deep blue-violet, never black.
- Fog: near 140, far 620, so the far town softens into the violet horizon.
- HDRI: Poly Haven `satara_night` (`night-clear`) at intensity 0.45.
- LUT grade "night blue", vignette 0.28; bloom 0.9 at threshold 0.72 so only lanterns, bulbs, props
  and ghosts glow.

## Silhouette rules
- Every ride keeps one unmistakable top shape from the build camera: wheel, tower, loop, spinning cups,
  crooked house.
- Ghosts are the brightest things in the scene; the living are small, many and rim-lit.
- Trees are bare and branching; the only round soft shapes are toadstools and pumpkins.
- The gate arch with its glowing HAUNTWORKS sign is the tallest built thing until the player builds higher.

## UI typography
- Display: IM Fell English SC (a Victorian printer's face, OFL). Body: Nunito (OFL). Both from the
  shared font library.
- HUD: bone lettering on night-violet boards, spectral-teal borders and glow for good news, lantern
  amber for rims and highlights, rose for warnings.

## Chosen look
- `look: "cinematic"`, `mood: { preset: "night", sun: { azimuth: 215, elevation: 48, color: "#b8ccff", intensity: 1.15 }, skyColor: "#140f2e", horizonColor: "#3a2f66", groundColor: "#1d2a2c", fog: { near: 140, far: 620 } }`.
- Environment source `hdriEnvironment("night-clear", { intensity: 0.45 })`.
- Post: bloom on emissive only, the night-blue LUT, vignette 0.28.

## Pass list
1. Grade every authored GLB through the night palette; emissive lanterns and bulbs. (done)
2. Author the haunt's own props and gloom pieces. (done)
3. Translucent ghost residents and rim-lit living. (done)
4. Re-dress the authored starter haunt: toadstools and wispy grass for flowers, graves, lanterns, a Ghost Train. (done)
5. Scare-prop reach rings and fog wisps in the world overlay. (done)
6. Day-night: drive the key light from the clock so dusk and dawn read in the sky, not just the HUD.
7. Bodies for hunters, TV crews and the exorcist; a scream burst over a fleeing visitor.
8. Ambient life: bats over the pier (done), mist rolling off the sea, ride lights flickering when a ride jams.
