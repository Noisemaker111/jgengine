# Art direction

HIGH TIDE PIZZA is a warm neon canal city at night. Mainsail floods every evening: the streets turn to
black glass that doubles every sign, festoon lights sag between the lamp posts, and a red scooter with a
top-box of pizza cuts a wake through it. The world keeps the coast's real-world scale; the family fleet is
chunky, round and toy-bright on purpose, so the rider always reads against the wet dark.

## Reference images
- *Kiki's Delivery Service* (1989) for the warmth of a family delivery job in a harbour town.
- Venice's *acqua alta* nights for streets that become canals and people carrying on above the water.
- *Crazy Taxi* for bright, readable streets at speed and one arrow, one clock.
- *Jet Set Radio* and *Hotline Miami* night palettes for saturated neon over deep teal.
- The original Harbor Heat coast (GTA: Vice City's pastel deco) stays underneath: the city blocks, palms
  and facades are the same, now lived in after dark.

## World palette
- `#0d3442` flood water: the canal sheets, glossy and slightly see-through.
- `#071d25` night: sky above the neon, deep shadow.
- `#ffcf7a` festoon warm: string-light bulbs, the oven's glow, the drop beacon.
- `#ff4f8b` neon pink: signs, swap-dock chevrons, the jet-ski's stripe.
- `#6ff2e0` neon teal: the shop sign's tubes, alternate festoon bulbs.
- `#d93a2f` Vell's red: the pizza boxes, the blimp's bands, the awning stripe.
- `#fff1d6` box cream: the boxes, the scooter's trim, the order cards.
- `#f2c9a8` stucco peach and `#7fd1c4` deco mint: the old city underneath.

## Material language
- The family fleet (`scripts/author-tide.mjs`): the Vespetta scooter (rounded red shell, cream top-box),
  the cargo trike (teal frame, wooden crate of boxes), the jet-ski (amber hull with a pink waterline),
  the motor gondola (black lacquer, gold trim, a ferro, festoon lights and an outboard) and the pizza
  blimp (cream envelope, red bands, a glowing slice on each flank). Rival Carmine's Crust riders ride
  the same scooter in black.
- The shop: Vell's counter is a striped awning over a brick oven whose mouth glows, under a neon slice;
  the street sign is a tall pole with a lit slice. Catering drops are poles with a slice in a ring.
- The flood: one authored unit disc (`tide-water.glb`) the tide scales to each district and lifts with
  the level; low roughness and high metalness so the HDRI and the neon reflect.
- Landmarks: the Gull Point lighthouse (white and red bands, a lit lamp room) on the north headland, and
  the submarine *Sardine* surfaced in the bay with its portholes lit.
- Characters: Microsoft Rocketbox humans from the model library, as before.
- Environment: the authored city blocks with ambientCG facade scans and library `city/*`, `park/*` props.
  No Kenney or KayKit pieces.

## Lighting mood
- Dusk as the opening (17:30) running into a neon night; every shift ends at midnight under the king tide.
- Fill: sodium streetlights, festoon lights and neon carry the city; the flood doubles them.
- Fog `#0e2c38` at night, near 150, far 700.
- HDRI: Poly Haven `small_harbour_sunset` at intensity 1.0 for the golden opening minutes.
- LUT grade "neon sunset", ACES, bloom 0.3 / threshold 0.85 so the emissive bulbs and tubes bloom.

## Silhouette rules
- The rider is always a small bright shape against dark water: red scooter, amber jet-ski, cream blimp.
- Landmarks read from across the map: the lighthouse is the tallest thing on the north coast, the blimp
  the only thing in the sky after ten.
- Order drops are vertical light pillars topped by a glowing box, lifted to the floor the customer leans
  out of (door, balcony, rooftop) as the water rises.
- Festoon lights run along every walk the camera follows; never a bare street after dark.

## UI typography
- Display: Bangers (Google Fonts, OFL). Body: Barlow (Google Fonts, OFL). LCD readouts use Rune's mono.
- Rune theme: `harborTheme` in `src/game/ui/theme.ts`, accent `#ffb020`; the shop's books use the
  pizzeria board look (`#7a2a20` board, cream edge).
- The tide card: five stage pips that fill mint then flood-blue, the stage name in display type, and
  each box as a card with a heat bar that runs oven-red to amber to cold blue below the customer's limit.

## Pass list
1. Done: flood sheets per district, the family fleet, the shop, drops, lighthouse, submarine, festoon
   lights, swap docks and the shop sign authored and placed.
2. Next: a ripple/wake shader on the flood sheets (an engine water-surface feature, filed as a gap).
3. Next: neon signs on the canal-side facades and reflections of them on the water at high tier.
4. Next: rain on the bay that comes inland with the king tide.
5. Next: a lit pizza-box prop on the rider's back while on foot.
