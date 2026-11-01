# Art direction

A hot, rusting scrapyard at the end of the day: oil-black ground, slag glow, hazard-yellow steel and a compactor that fills the sky behind you. Fast and readable at speed; chunky toy-scale buggies against a heavy industrial backdrop.

## Reference images
- Trackmania for track readability at speed: clear edges, bold markers, no clutter on the racing line.
- Trials HD for the industrial obstacle-course staging and silhouettes against a bright sky.
- Mad Max (2015 game) for rust, dust, scrap piles and an orange-amber sky.
- Film: *Mad Max: Fury Road* (2015) for the bleached orange and teal grade.

## World palette
- `#232019` oil black: track surface and shadow.
- `#8a3a1e` rust: scrap piles, walls, wrecks.
- `#f2c230` hazard yellow: barriers, track edges, the buggy's body. The racing line reads in this colour.
- `#ff5a14` slag: molten river, furnace light, exhaust glow.
- `#5de0ce` coolant teal: pickups, ghost, boost. The only cool colour on track.
- `#ece3cc` sun cream: sky haze and dust.
- `#2c3134` gunmetal: machinery and the compactor.

## Material language
- Vehicles (the character family): the Foundry buggies and their bolt-on parts, re-authored with bevels, panel lines and the palette in the same chunky toy proportion as KayKit.
- Environment: KayKit only, one proportion and gradient shading: `kaykit-city-builder` (wreck cars, watertower, dumpsters, streetlights) and `kaykit-space-base` (drill structures, cargo, tall structures, pipes) for the foundry and the compactor. The `kaykit-dungeon` walls, barriers and torches leave: stone dungeon pieces read as a castle, not a scrapyard.
- Ground: ambientCG `Ground025` packed dirt on the yard, `Asphalt012` on the racing line, `Rust007` and `CorrugatedSteel009` on facades, `Gravel022` on run-off.
- No primitive props: anything still box-built (barriers, jump cue, pickup stations) is re-authored or swapped for KayKit pieces.

## Lighting mood
- Late golden hour, low sun behind the compactor (azimuth 250, elevation 14), key `#ffb066`.
- Fill: dusty warm sky; shadows go brown, not blue, except under the slag glow.
- Fog `#c98a52`, near 60, far 320: the yard fades into dust.
- HDRI: Poly Haven `industrial_sunset_02_puresky` at intensity 0.9.
- LUT grade "bleach bypass, warm": shadows `#1c2a2c`, midtones `#c99868`, highlights `#ffe0b0`, saturation 0.88, contrast 1.22, tint 0.4. Per-track weather keeps its own mood; the LUT stays.

## Silhouette rules
- The buggy is wide and low with oversized wheels; each bolt-on part changes the outline.
- The compactor is the largest shape in every frame of a chase: a flat-fronted wall with teeth.
- Track edges are continuous hazard-yellow lines; scrap piles stay off the racing line.
- Rival karts differ by colour and one roof shape each.

## UI typography
- Display: Saira Stencil One (Google Fonts, OFL). Body: Barlow Condensed (Google Fonts, OFL). Both come from the shared font library (`libraryFontPairing`).
- HUD kit: `signal`, accent `#f2c230` hazard yellow.

## Chosen look
- `look: "cinematic"`, `mood: { preset: "golden", sun: { azimuth: 250, elevation: 14, color: "#ffb066" }, horizonColor: "#ff9d3d", fog: { near: 60, far: 320 } }`.
- Environment source `{ kind: "hdri", url: <industrial_sunset_02_puresky>, intensity: 0.9 }`.
- Post: ACES, bloom 0.34 / threshold 0.78 for slag and exhaust, grain 0.024, the LUT above in place of the hand gain.

## Pass list
1. Retire the kaykit-dungeon compactor and props; rebuild the compactor from kaykit-space-base structures and steel.
2. Re-author the buggy and its parts with bevels and panel lines; rivals get distinct roof shapes.
3. Dress the ground: Asphalt012 racing line, Ground025 yard, oil stains and tyre marks as decals.
4. Pile the wreck walls high with KayKit city-builder cars and dumpsters so no flat ground shows past the barriers.
5. Set the golden mood, the HDRI and the warm bleach-bypass LUT.
6. Ambient life: sparks from the compactor, smoke columns, slag heat shimmer, gulls over the dumps.
