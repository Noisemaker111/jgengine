# Art direction

A sunny seaside fair on a postcard: candy-striped rides, cream paths, a busy crowd of little people, the sea always in view. Bright, clean and toy-like, never neon.

## Reference images
- Parkitect for the clean low-poly park, readable paths and tidy queue lines.
- RollerCoaster Tycoon 2 for crowd density and the pleasure of a full park.
- Planet Coaster for scenery dressing between rides.
- Film: the pastel seaside of *Moonrise Kingdom* (2012): flat colour, sunlit, a little old-fashioned.

## World palette
- `#7fb05a` lawn: the park grass.
- `#f2e3c2` promenade cream: paths and plazas.
- `#77b8c8` sea: the bay, water rides, sky haze.
- `#247f83` fair teal: ride frames, fences, staff uniforms.
- `#ef7059` coral: awnings, ride cars, entrance booths.
- `#edbc5c` brass gold: finials, signs, coins.
- `#fff4da` paper white: stripes, trims, UI paper.

## Material language
- Characters: Quaternius Ultimate Animated Characters (`quaternius-animated-characters-pack`: `Casual_*`, `Casual2_*`, `Casual3_*`, `Worker_*`, `Chef_*`) for guests and staff, tinted from the palette per role. They replace the script-authored guest boxes.
- Environment: Quaternius in the same flat-colour low-poly shading: `quaternius-lowpoly-modular-street-pack` (benches, lamps, bins, signs), `quaternius-low-poly-food-pack` (stall counters and food), `quaternius-stylized-nature` (trees, hedges, flowers), `quaternius-lowpoly-buildings-pack` for the town behind the fence.
- Rides and stalls stay the game's own authored GLBs, re-authored with bevelled edges, stripes and the palette; no flat-faced boxes.
- Ground: ambientCG `Grass004` lawn, `PavingStones070` promenade, `Gravel022` on queue lines, `Ground054` on bare build land.
- No primitive props: the entrance pillars, booths, fence and raised land boxes become authored entrance GLBs, a `fence_*` street-pack fence and terrain.

## Lighting mood
- Late morning in summer, sun high in the south-east (azimuth 135, elevation 52), warm white key `#fff1d6`.
- Strong sky fill so shadows stay light blue, never black.
- Fog `#bfe0e6`, near 260, far 900: only the far town and sea horizon soften.
- HDRI: Poly Haven `kloofendal_43d_clear_puresky` at intensity 1.0.
- LUT grade "sunny postcard": shadows `#3d6a78`, midtones `#f3e2c0`, highlights `#fff6e2`, saturation 1.12, contrast 1.04, tint 0.3.

## Silhouette rules
- Every ride has one unmistakable top shape from the build camera: wheel, tower, loop, spinning cups, maze block.
- Guests are small and many; staff carry one bright teal shape (cap or apron) so they read in a crowd.
- Trees stay round and soft; nothing spiky.
- The entrance arch is the tallest built thing until the player builds higher.

## UI typography
- Display: Lilita One (Google Fonts, OFL). Body: Nunito (Google Fonts, OFL). Both already ship in `src/art/fonts/` and need wiring through `useGameFonts`; Georgia and system-ui leave the kit and theme.
- HUD kit: `paper`, accent `#24535b` deep teal.

## Chosen look
- `look: "cinematic"`, `mood: { preset: "bright", sun: { azimuth: 135, elevation: 52, color: "#fff1d6" }, horizonColor: "#bfe0e6", fog: { near: 260, far: 900 } }`.
- Environment source `{ kind: "hdri", url: <kloofendal_43d_clear_puresky> }`.
- Post: bloom only on the ride bulbs (threshold 0.95), the LUT above, vignette 0.12.

## Pass list
1. Swap the authored guests and staff for Quaternius Ultimate Animated Characters.
2. Dress the ground: Grass004 lawn, PavingStones070 paths, Gravel022 queues; flowerbeds and hedges along every path edge.
3. Replace the primitive entrance, fence and raised-land boxes with authored and street-pack pieces.
4. Replace the procedural town boxes with Quaternius lowpoly buildings and street props.
5. Re-author rides and stalls with bevels, stripes and the palette; food-pack props on stall counters.
6. Set the bright mood, the HDRI and the sunny postcard LUT.
7. Wire Lilita One and Nunito into the kit and HUD theme.
8. Ambient life: gulls, sea glints, bunting and flags in the wind, ride lights at dusk.
