# Art direction

A family home at night, seen by someone an inch tall. The furniture is landscape: a chair leg is a
tree trunk, the kitchen counter is a granite plateau sixty times your height, the coffee table is a
roof over a red woven plain. It is cozy and it is dangerous at the same time: warm lamp pools and the
moon through the window, and two green eyes in the dark.

## Reference images
- *Arrietty* (Studio Ghibli) for the Littles' scale, their improvised gear and the cozy wall burrow.
- *It Takes Two* (the giant-household chapters) for furniture as level geometry.
- *Grounded* for small-scale threat readability: a spider is a monster at this size.
- *The Borrowers* illustrations for found-object craft: thimbles, spools, matchboxes, buttons.

## World palette
- `#1a120d` night cocoa: fog, unlit space, the edge of every lamp pool.
- `#b07a45` oak and `#5c3b22` dark oak: floors, chair legs, shelves.
- `#efe4cf` cream enamel: cabinets, baseboards, appliances.
- `#8e3b2e` faded rug red and `#5f6f8a` carpet blue: the big soft plains.
- `#f2c46d` candle gold: the burrow, UI accents, prompts and way-out markers' warm doors.
- `#7dffb0` exit green: ways out of the house.
- `#d7ff5e` cat-eye green and `#ff7a5c` danger red: hunters and harm.

## Material language
- Recognisable household props are CC0 catalog models (KayKit furniture, Quaternius food, props
  and clutter) scaled so a Little sees a loaf as a hill and a mug as a tower.
- Everything else is original procedural geometry built from the editor scene's authored volumes, with
  canvas-painted detail (wood grain, tile grout, rug weave, carpet pile, cardboard flutes) projected
  in world space so a chair leg and a floorboard share one grain at giant scale. No model downloads,
  never Kenney.
- Finds are small original meshes at true size beside a Little: a sugar cube is knee-high, a coin
  is a millstone, a needle is a spear.
- Hunters are chunky readable bodies: the Cat's glowing eyes and swishing tail, the Roomba's blue
  LED and spinning brush, the spider's red eyes and floor web, the dog's collar and floppy ears.

## Lighting mood
- Night everywhere: low warm ambient, cool moon hemisphere, and per-room practicals (nightlights,
  oven clocks, a porch light through the mail slot, the TV standby LED). When someone gets up for
  water the big light snaps on and every hunter can see further. At dawn every light is on.
- Fog `#1f1510`, near 40, far 210. Bloom catches lamp beads, cat eyes and the candle torch.
- Grade: `warm-filmic` LUT, ACES, vignette 0.34.

## Silhouette rules
- The Cat is long, low and swishing; the dog is a hill; the Roomba a disc; the spider tiny and
  many-legged. Each reads from outline alone.
- Doors on are gold rings; the way back is blue; a way out of the house is green with a tall beacon.
- Open finds lie in plain sight; hidden ones are a lint pile. Pip's food and Dot's curios glint.

## UI typography
- Display: Fredoka (OFL). Body: Nunito (OFL). Both from the engine font library.
- Rune UI, cocoa panels with candle-gold actions, rounded 12-14 px corners.

## Chosen look
- `look: "cinematic"`, mood night, fog 40-210, exposure 1.05.
- Reflection HDRI `night-clear` at 0.18; post ACES, bloom 0.32 / threshold 0.82, AO, vignette 0.34,
  LUT `warm-filmic`.
