# Art direction

A cosy alien household on a lilac moon: soft round furniture, enamel-bright appliances, mint plants and a pastel dusk that never quite ends. Small, warm and a bit silly; the habitat is a dollhouse seen from above.

## Reference images
- The Sims 2 for the cut-away house, readable rooms and characters you can read at a glance.
- Animal Crossing: New Horizons interiors for chunky, rounded furniture and soft light.
- RimWorld for the colony layout seen from above.
- Film: *Lilo & Stitch* (2002) and *WALL-E* (2008) for pastel skies and lovable alien forms.

## World palette
- `#5a4f72` moon lilac: the ground outside.
- `#2a2545` dusk zenith: sky top and deep shadow.
- `#fff0d6` enamel cream: walls, appliances, UI paper.
- `#f6a6cf` bubblegum: accents, doors, bonds, UI accent.
- `#9fe0c4` mint: plants, healthy needs, alien flora.
- `#ffd98a` butter: lamps, windows, warm interior light.
- `#5b3a6e` plum: furniture shadow side, ink.

## Material language
- Characters: Quaternius Textured Cute Monster Pack (`quaternius-textured-cute-monster-pack`: Alien, Alien_Tall, Cyclops and kin) for the household, tinted per body plan. They replace the `quaternius-modular-scifi` aliens and the capsule fallback.
- Environment: KayKit only, one rounded proportion: `kaykit-space-base` for the habitat shell, airlocks, turbines and outdoor structures; `kaykit-furniture` for every room. The `quaternius-modular-scifi` walls and props leave; their hard sci-fi panels fight the cosy shapes.
- Flora: `quaternius-stylized-nature` rocks and mushrooms retinted mint and pink.
- Ground: ambientCG `Gravel022` tinted lilac outside, `WoodFloor041` and `Tiles074` indoors.
- No primitive props: the capsule-and-sphere alien and every shell-primitive furniture fallback go; a missing model is a provisioning bug, not a look.

## Lighting mood
- Permanent pastel dusk: sun low (azimuth 135, elevation 16), key `#ffdca6`.
- Fill: lilac sky `#b9a2dc`; interiors lit by butter-yellow lamps that read through windows.
- Fog `#716c87`, near 160, far 700.
- HDRI: Poly Haven `kiara_9_dusk` at intensity 0.6, tinted lilac by the mood.
- LUT grade "pastel dusk": shadows `#3a2f55`, midtones `#e6c3d8`, highlights `#fff1dc`, saturation 1.05, contrast 1.02, tint 0.4.

## Silhouette rules
- Aliens are round, big-headed and short; each body plan has one odd feature (one eye, tall neck, antennae).
- Furniture is rounded and chunky; nothing sharp-cornered in a room.
- The habitat reads as a cluster of domes and tubes against the sky.
- Walls cut away toward the camera so rooms stay visible.

## UI typography
- Display: Comfortaa (Google Fonts, OFL). Body: Quicksand (Google Fonts, OFL). Both already ship; Trebuchet MS and Segoe UI leave the fallbacks.
- HUD kit: `signal` (enamel plates), accent `#f6a6cf` bubblegum. Set it as `uiKit` so menus and HUD share the enamel fiction.

## Chosen look
- `look: "cinematic"`, `mood: { preset: "dusk", sun: { azimuth: 135, elevation: 16, color: "#ffdca6" }, skyColor: "#393850", horizonColor: "#d8b8dd", fog: { near: 160, far: 700 } }`.
- Environment source `{ kind: "hdri", url: <kiara_9_dusk>, intensity: 0.6 }`.
- Post: ACES, bloom 0.3 for lamps and windows, AO 1.6, the LUT above in place of the hand lift and gain.

## Pass list
1. Swap the aliens to the Quaternius cute monster pack; delete the capsule fallback.
2. Rebuild the habitat shell from KayKit Space Base; retire the modular sci-fi walls.
3. Furnish every room from KayKit Furniture; wood and tile floors.
4. Dress the outside: lilac gravel, mint flora clusters, rocks and mushrooms.
5. Set the dusk mood, the HDRI and the pastel dusk LUT; warm window light.
6. Set the signal kit with the bubblegum accent as `uiKit`.
7. Delete the unused deepward GLBs from `public/models/imported/`.
8. Ambient life: drifting spores, a second moon rising, blinking habitat lights.
