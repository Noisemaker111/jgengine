# Art direction

A municipal salvage shift inside a sealed industrial vault. Marrow's receiving rail is the safe, legible home; Bellwether's corridors feel worked, patched and abandoned. The Fitter is recognizable machinery, never a fantasy monster. Dark corridors, pools of lamp light, cyan rail gear and amber warnings.

## Reference images
- Alien: Isolation for worn, chunky, analogue industrial interiors lit by practical lamps.
- Prey (2017) Talos I engineering decks for patched municipal machinery and signage.
- Hunt: Showdown's grade for heavy shadow and warm lamp pools.
- Film: *Alien* (1979) Nostromo corridors: steam, grilles, colour-coded service markings.

## World palette
- `#0b171b` vault black: unlit space, fog, the edge of the lamp pool.
- `#34444b` deck slate: floors and lower walls.
- `#82918b` worn steel: machinery, rails, frames.
- `#cca46c` brass: fittings, salvage marks, stash hardware.
- `#84e8d0` rail cyan: rail equipment, route markers, safe lamps.
- `#eab379` warning amber: hazards, prompts, oxygen alarms.
- `#ee7361` danger red: the Fitter's optics, critical states.

## Material language
- Characters: the original Deepward rigs only (the Fitter and the service weapons in `public/models/imported/deepward/`). The fauna ("hand", "courier", tank-crawler) are authored as rigged GLBs in the same pipeline and proportion as the Fitter; no library humans, no KayKit or Quaternius stand-ins.
- Environment: the original Deepward machinery GLBs (rotary press, salvage printer, ink recovery, stash cabinet, service desk, receiving portal, rail transfer) plus library `industrial/*` clutter.
- Surfaces: ambientCG scans as today: `PaintedMetal006` walls, `DiamondPlate005A` and `MetalPlates001` decks, `Rust007` on Bellwether, `Concrete025` in shafts, `Terrazzo005` in Marrow's office.
- No primitive props: the box and cylinder architecture in `src/game.tsx`, `stationArt.tsx` and `strataArt.tsx` becomes modular authored wall, column, pipe and gantry GLBs.

## Lighting mood
- No sky. Darkness is the default; every lit area has a visible lamp.
- Key: practical lamps per floor (vault `#a4ded2`, cold `#bcd8ff`, wells `#c9b8e6`, choir `#ff6a52`). Fill: a dim cool hemisphere at a third of today's 0.72 ambient.
- Fog `#0b171b`, near 12, far 48, with volumetric beams under each lamp.
- HDRI: Poly Haven `industrial_pipe_and_valve_01` for reflections only, intensity 0.25.
- LUT grade "cold teal": shadows `#0e2a30`, midtones `#7f9a96`, highlights `#ffd9a0`, saturation 0.92, contrast 1.18, tint 0.4. Warm highlights keep amber and brass alive.

## Silhouette rules
- The Fitter is tall, asymmetric and top-heavy, with one lit optic; nothing else in the vault has that shape.
- Fauna are low and wide; the player reads "machine" or "creature" from outline alone.
- Interactables have a lit edge (cyan for safe, amber for warn) that cuts through the dark.
- Corridors keep a clear floor line; clutter sits against walls.

## UI typography
- Display: Share Tech Mono (Google Fonts, OFL). Body: Rajdhani (Google Fonts, OFL). Both already ship in `src/art/fonts/`; the `:root` Inter / Segoe UI stack goes.
- HUD kit: `terminal`, accent `#e2bd6e` brass amber.

## Chosen look
- `look: "cinematic"` with no sky (`hasWorldSky` false, interior backdrop), mood `{ preset: "night", fog: { near: 12, far: 48 }, exposure: 0.9, contrast: 1.1 }`.
- Environment source `{ kind: "hdri", url: <industrial_pipe_and_valve_01>, intensity: 0.25 }`.
- Post: ACES, bloom 0.18 / threshold 0.9 so lamps glow, AO on, vignette 0.28, the LUT above.

## Pass list
1. Cut the ambient light to a third and let practical lamps carry every room; fog in close.
2. Set the night mood, the reflection HDRI and the cold teal LUT.
3. Replace the box and cylinder architecture with modular authored walls, columns, pipes and gantries.
4. Author the three fauna as rigged GLBs; retire the sphere and cylinder creatures.
5. Re-skin pale walls and floors with the ambientCG metal and concrete scans, with grime on Bellwether.
6. Add steam, drips and sparks from damaged machinery; flicker on Bellwether lamps.
7. Stencil large floor and wall markings (line numbers, hazard chevrons) as decals.
