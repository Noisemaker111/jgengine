# Art direction

A sun-baked coastal city at golden hour sliding into neon night: pastel stucco, palm-lined boulevards, wet asphalt, a teal bay and a sky going pink. The one game in the repo with realistic human proportions; everything around them is built to the same scale.

## Reference images
- GTA: Vice City for the pastel art-deco coast, palms and pink sunsets.
- Crazy Taxi for bright, readable streets at speed.
- Need for Speed: Most Wanted (2005) for the warm filtered grade and wet road shine.
- Film: *Miami Vice* (2006) and *Drive* (2011) for sodium streetlight, neon and teal water.

## World palette
- `#f2c9a8` stucco peach: building walls, plazas.
- `#7fd1c4` art-deco mint: trims, awnings, lifeguard huts.
- `#155462` harbour teal: the bay, shadows on water.
- `#ffb020` sodium amber: streetlights, HUD, cash pickups.
- `#ff4f8b` neon pink: signs, sunset sky, nightlife.
- `#3a3a40` asphalt: roads, wet at night.
- `#071d25` night: sky above the neon, deep shadow.

## Material language
- Characters: Microsoft Rocketbox humans (`human/*` in the model library), the whole cast and police. Harbor Heat is the only game that keeps them.
- Vehicles: the library `vehicle/sports-car` family and the authored bus, all at real-world scale.
- Environment: the authored city blocks with ambientCG facade scans (`Facade018A`, `Facade019A`, `Facade020A`, `Facade006`), library `city/*`, `park/*` and `industrial/*` props, the authored palms. All real-world proportion.
- The KayKit pieces leave: `kaykit-space-base` landers as aircraft, cargo containers, `kaykit-dungeon` banners as signs and `kaykit-city-builder` traffic lights are toy-scale and break the scale. Use library `city/*` signals, `industrial/*` containers, authored emissive signs, and a CC0 seaplane and helicopter pulled through the library's Sketchfab source.
- Ground: ambientCG `Asphalt012` roads (wet variant at night), `Concrete034` sidewalks, `Ground033` beach, `PavingStones070` plazas.

## Lighting mood
- Golden hour as the hero time (sun azimuth 260, elevation 12, key `#ffb27a`), running into a neon night through the day cycle.
- Fill: warm sky by day; at night sodium streetlights and neon carry the city.
- Fog `#f0b8a0` at dusk, `#0e2c38` at night, near 150, far 700.
- HDRI: Poly Haven `small_harbour_sunset` at intensity 1.0.
- LUT grade "neon sunset": shadows `#1e3a4a`, midtones `#f0b08a`, highlights `#ffe0c8`, saturation 1.15, contrast 1.1, tint 0.35.

## Silhouette rules
- Palms line every boulevard: tall thin trunks with a burst top, the city's signature shape.
- Buildings stay low and wide on the coast and rise to a tower cluster downtown, so the skyline tells you where you are.
- Police cruisers have a light bar; every other car keeps a clean roof line.
- Pickups and mission markers are vertical light pillars, not floor circles.

## UI typography
- Display: Bangers (Google Fonts, OFL). Body: Barlow (Google Fonts, OFL). Both already ship; the Cascadia Mono / Consolas stack in `screens.css` becomes Barlow tabular figures.
- HUD kit: `ink`, accent `#ffb020` sodium amber.

## Chosen look
- `look: "cinematic"`, `mood: { preset: "golden", sun: { azimuth: 260, elevation: 12, color: "#ffb27a" }, horizonColor: "#f0b8a0", fog: { near: 150, far: 700 } }`, with the day cycle reaching `night`.
- Environment source `{ kind: "hdri", url: <small_harbour_sunset> }`.
- Post: ACES, bloom 0.3 / threshold 0.85 so neon blooms, screen-space reflections on wet roads at high tier, the LUT above.

## Pass list
1. Remove every KayKit piece; swap in library signals, containers, authored neon signs and pulled aircraft.
2. Dress the ground: Asphalt012 roads with lane paint, Concrete034 sidewalks, beach sand; no flat vertex-colour districts.
3. Line boulevards with palms and streetlights; fill lots with library street props.
4. Set the golden mood, the sunset HDRI and the neon sunset LUT.
5. Make the night: sodium streetlights, neon signage, wet road shine.
6. Vary the traffic with more library vehicles in the palette.
7. Ambient life: pedestrians on sidewalks, gulls at the harbour, boats in the bay, a passing helicopter.
