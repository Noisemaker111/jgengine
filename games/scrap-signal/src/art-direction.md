# Art direction

A sun-blasted desert planet drawn like a comic: ink outlines, hard cel shadows, rust mesas under a deep blue sky, scrap settlements and loot that glows by rarity. Loud and graphic, readable at a sprint through iron sights.

## Reference images
- Borderlands 2 for the ink-outlined cel look, the desert scrap settlements and rarity glow.
- Destiny 2 for clean combat readability and enemy silhouettes against open sky.
- Diablo III for loot beams and the joy of a drop.
- Film: *Mad Max: Fury Road* (2015) Wasteland for a deep blue sky over orange desert.

## World palette
- `#dba869` mesa sand: open desert and high rock.
- `#5f3c22` canyon rust: low rock, cliffs, shadow side.
- `#0f4c86` deep sky: zenith; the cool counterweight to the ground.
- `#93a0ad` scrap steel: machines, settlements, guns.
- `#ff5a2e` signal red-orange: enemy optics, the relay beacon, UI accent.
- `#9ff5d6` phosphor mint: friendly tech, terminals, shields.
- `#1a1410` ink: outlines and cel shadow.

## Material language
- Characters: Quaternius Toon Shooter Game Kit (CC0) for every human enemy and NPC: add it to the catalog. Its toon proportions take the ink outline well. The Rocketbox `human/*` cast leaves.
- Machines: Quaternius Animated Mech Pack (`quaternius-animated-mech-pack`) and `quaternius-animated-lowpoly-robot` for loaders and bots, replacing the crate-and-column kit-bash. Beasts stay `quaternius-modular-scifi` aliens.
- Environment: Quaternius only: `quaternius-modular-scifi` for settlements and the relay, `quaternius-low-poly-desert-assets` for rocks, cacti and ruins, `quaternius-stylized-nature` dead trees. The `kaykit-space-base` pieces leave (different studio, different bevel).
- Ground: ambientCG `Ground031` cracked desert, `Rock035` cliffs, `Gravel032` on roads, `Metal007` and `MetalPlates001` on scrap.
- No primitive props: the cylinder-and-torus relay and the box-built viewmodel gun become modular sci-fi and authored GLBs.

## Lighting mood
- Hard high desert noon (sun elevation 62, key `#ffe0b0`); shadows are short and graphic.
- Fill: deep blue sky, cel shading cuts shadow to two bands.
- Fog `#dcc39c`, near 300, far 2400: distant mesas go pale, the near world stays sharp.
- HDRI: Poly Haven `goegap` at intensity 0.8.
- LUT grade "sun-bleached comic": shadows `#2a2238`, midtones `#e0b27a`, highlights `#fff2d8`, saturation 1.2, contrast 1.15, tint 0.3.

## Silhouette rules
- Every enemy type has a distinct outline at 60 m: hunched husks, broad marauders, tall elites, mechs with reversed knees.
- Weapons read by barrel shape and colour of rarity glow.
- Settlements are vertical scrap stacks with antennae; the relay is the tallest shape in every zone.
- Ink outlines are thick on characters and thin on terrain, so units pop off the ground.

## UI typography
- Display: Russo One (Google Fonts, OFL). Body: Chakra Petch (Google Fonts, OFL). Both already ship; Arial Black and Segoe UI leave the fallbacks.
- HUD kit: `broadcast` (a jammed broadcast, matching the title), accent `#ff5a2e` signal red-orange.

## Chosen look
- `look: "comic"` with `mood: { preset: "day", sun: { elevation: 62, color: "#ffe0b0" }, skyColor: "#0f4c86", horizonColor: "#dcc39c", fog: { near: 300, far: 2400 } }`.
- Environment source `{ kind: "hdri", url: <goegap>, intensity: 0.8 }`.
- Post: the comic outline and cel bands, bloom for loot beams only, vignette 0.2, the LUT above.

## Pass list
1. Switch to the comic look preset; tune outline width per layer.
2. Swap the Rocketbox cast for Quaternius Toon Shooter characters.
3. Replace the kit-bashed loaders with Quaternius mechs and robots; drop kaykit-space-base.
4. Rebuild the relay and the viewmodel gun as models.
5. Dress the ground: Ground031 cracked desert, desert-pack rocks, cacti and ruins; no flat sand.
6. Set the noon mood, the HDRI and the sun-bleached comic LUT.
7. Set the broadcast kit with the red-orange accent as `uiKit`.
8. Ambient life: dust devils, scavenger birds, sparking wrecks, loot beams on the horizon.
