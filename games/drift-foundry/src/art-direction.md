# Art direction

A gigantic big-box store at closing time: bright fluorescent strip lights, glossy tile, endless
shelving packed with colourful store-brand packaging, and the grey security shutter coming down
behind a yellow floor scrubber. Exaggerated, toy-proportioned and readable at speed.

## Palette
- `#f2eee6` tile white: the aisles and floor. `#2f6fd6` store blue: signage, floor tape, UI plates.
- `#ffd21e` sale-tag yellow, `#e8303a` sale red, `#ff4fa0` pink jump arrows, `#5de0ce` teal ghost/boost.
- Packaging mix on the shelves: red, blue, yellow, teal, orange, purple, green, white.
- `#aeb6bf` shutter grey; the scrubber is safety yellow with amber beacons.

## Models
- Original procedural geometry for carts, shoppers, mods, products, shelving, freezers, TV walls,
  racking, ceiling lights, signage, checkout lane, shutter and scrubber, tugger train
  (`scripts/author-models.mjs`). Pack pieces only where a pack has the thing: KayKit Forest trees and
  shrubs, KayKit City Builder lamp posts, KayKit Space Base conveyor slabs, Quaternius Toon Shooter
  cardboard and cones, Quaternius animals as pigeons. Never Kenney.

## Light
- One strip-light rig for the store: a high near-white key, warm-white fill, indoor HDRI
  `interior-industrial`, exposure 0.85; per-department sky and fog bands behind it.
- Engine lighting zones (`rendering.lighting.zones`, built in `src/game/world/lighting.ts`) re-light
  that rig per department: Electronics a dark showroom (key 0.12, fill 0.22, blue spill) lit by its TV walls,
  the Loading Bay sodium orange, Frozen Foods cold blue, the Garden Centre an overcast sky.
- The Garden Centre is the one outdoor department and the only one with weather: its rain is bounded
  to its own band, so it never falls indoors.
- Grade: `vivid-pop` LUT reined in to 0.88 saturation, light bloom on tubes and screens.

## UI
- Lilita One for signage and numbers, Nunito for text. Navy price-strip HUD plates, receipt-paper
  sheets on a blue customer-service counter, wet-floor stripes.
