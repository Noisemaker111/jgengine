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
- Mood `bright` with a high near-white key (elevation 62), indoor HDRI `interior-industrial`, warm
  white fog; per-department sky bands (Electronics dark blue, Toy Aisle pastel, Garden Centre rain).
- Grade: `vivid-pop` LUT reined in to 0.88 saturation, light bloom on tubes and screens.

## UI
- Lilita One for signage and numbers, Nunito for text. Navy price-strip HUD plates, receipt-paper
  sheets on a blue customer-service counter, wet-floor stripes.
