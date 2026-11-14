# Art direction

**Do Not Disturb**: a Saturday-morning-cartoon small town on a bright morning. Lawns, cartoon houses,
a diner, lamp posts and a columned town hall line one street; ordinary working people in work
clothes stand on the sidewalk; and goofy, glowing technology — earbuds, phones with faces, smart
fridges, graphics cards, a humming data center — marches down Main Street from two cell towers.
Everything reads at the tower-defense zoom: from 40 m up you see who a worker is, what a gadget is,
and whether a worker is looking at their phone.

## Reference images
- *Two Point Hospital* / *Two Point Campus*: cartoon working people with readable jobs and comedic tone.
- *Plants vs. Zombies*: goofy enemies with faces, a clear small-to-massive ramp, a lawn as the battlefield.
- *Kingdom Rush*: chunky, bright units readable at a high camera.
- Saturday-morning cartoons: flat saturated colour, big shapes, nothing grim.

## World palette
- `#5a9a3e` / `#8cc254` lawn greens: terrain and grass.
- `#55555c` asphalt: Main Street and the side street.
- `#d8d4c8` sidewalk concrete with a `#f6c84a` "hire here" disc: open plots.
- Worker colours: each trade has its own work-mat colour under its feet (`TowerDef.color`).
- Tech glow: screens and LEDs in electric blue `#5ab8ff`, mint `#6affb0`, magenta `#ff4ad8`. Only technology glows.
- `#ff2a2a` cell-tower beacon red and `#ff3a3a` Flock-camera red: the source of the march, and "you are being watched".
- `#cfe6f2` morning haze on the horizon.

## Material language
- Workers: Quaternius Animated Characters Pack (`quaternius-animated-characters-pack`), one chibi family:
  Chef (Barista), Worker (Construction, Plumber tinted blue), Cowboy (Farmer), Old Classy (Grandma),
  Suit (Teacher, Lawyer), Casual (Electrician, Librarian, Janitor, Mail Carrier), Kimono (Monk),
  Casual Bald (IT Guy), Blue Soldier tinted red (Firefighter). Tints keep two trades on one body apart.
- Buildings: Quaternius Low Poly Buildings (houses, shop, flat, the Bank as the town hall) and KayKit
  City Builder shops and street furniture (lamps, hydrants, benches, dumpsters, parked cars), placed as
  `building` markers in `editor.scene.json`.
- Trees: KayKit Forest round trees tinted to a sunny lawn green.
- Technology: no models. Every kind is a few procedural three.js primitives (`render/techMesh.ts`):
  a phone is a rounded slab with a glowing screen and a face; a GPU is a slab with spinning fans; a
  data center is a big humming box with blinking LED rows, rooftop fans and a power cord. Kenney
  assets are never used.
- Status reads in the world, not only in the HUD: a glowing phone floats over every distracted worker,
  a red ring sits under a spotted one, purple (Librarian) and orange (Monk) circles show the auras,
  cardboard parcels sit on blocked plots, and "Installing Update…" draws a progress bar over the tech.

## Lighting mood
- `mood: { preset: "bright", sun: { azimuth: 210, elevation: 52, color: "#fff2d8" }, horizonColor: "#cfe6f2" }`.
- HDRI `partly-cloudy` at 0.9; LUT `sunny-postcard`, saturation 1.08, vignette 0.14, a little bloom so screens glow.

## Silhouette rules
- Workers stand 2.7 m, upright people on coloured mats; tech is low and wide (vacuums, scooters, GPUs) or
  slab-shaped (phones, fridges, server racks), so the two sides never read alike.
- Tech scales small to massive: earbuds 0.6, phone 1.0, fridge 1.4, server rack 1.8, data center 2.6.
- Cell towers at the road mouths are the tallest objects; the town hall is the tallest building.

## UI typography
- Display: Lilita One (OFL). Body: Nunito (OFL). Both ship in `src/art/fonts/`.
- The HUD is a diner and its noticeboard: teal diner signs, a chalkboard worker card, sticky-note wave
  previews, tomato-red buttons and the hot-pink DO NOT DISTURB door hanger for the big calls and the pause.
