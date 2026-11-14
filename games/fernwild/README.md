# Wildwire

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
Game suite: **67/67 proven** · `jgengine suite fernwild`
<!-- /suite-score -->

Robot-taming survival on a feral machine island, built on JGengine (folder and package id `fernwild`).
A century ago an automated colony was abandoned with its fabricators running. The robots kept
printing, repairing and rewriting each other until the island became a wild machine ecosystem with
evolved instincts. You wash up as a lone technician with a multitool and a pocket of fuses. Start it
with `bun --cwd=games/fernwild run dev` from the repository root.

The human layer is a full survival game: hunger, thirst, stamina, temperature, oxygen, spoilage,
weight, gathering by tool, schematics and crafting stations, thatch-to-stone building, farming,
storage, death and respawn. Every animal is gone: the island's 231 spawn zones hold machines.

## Machines

- **Discharge, then upload.** A Grounding Club, slingshot stones, EMP arrows or a Mag Bola drain a
  bot's battery (discharge). Once it shuts down you jack in and hold the upload: feed it firmware
  cores or biogel while its firewall resists, topping its discharge up with drain spikes. If it
  recharges it reboots wild and the upload is lost. Better feed is a faster, cleaner upload; a
  sloppy one (integrity under 80%) leaves a permanent **quirk** (Stutter Drive, Glass Jaw, Power
  Hog, Loose Wiring, Hoarder, Hothead, Devoted).
- **Seven temperaments**, readable from eye glow: Passive (green), Skittish (yellow), Territorial
  (orange), Aggressive (red), Pack (magenta, hits harder with packmates near), Ambush (violet,
  holds still until you are on top of it), Retaliator (blue, ignores you until hurt).
- **Targeting rules** per species pick who a bot goes for: the loudest (sprinting, swinging, shots),
  the brightest (a torch at night), the richest cargo, the most damaged, other machines, the last
  attacker, the biggest machine (`src/game/data/bots.ts`, scored into the engine creature driver's
  `focus`).
- **Tricks**: Ticklet swarms drain stamina, Lodestone bites can yank a metal tool from your hand,
  a Klepto steals a stack and blinks away (down it to get your things back), Arcwire lightning jumps
  to everything near and doubles through water, an Echo Mimic copies the last trick used near it,
  Choir Drones make every other wild bot near them hit harder, Rootkits stand dormant as trees until
  someone chops near them, and the Scrapper Rex hunts other machines and grows on their parts.
- **Charge and oil.** A bot's charge runs down; it refuels from biogel or berries in its
  inventory. Rain and open water rust it, hard sun overheats it (both drain it faster), a roof
  spares it.
- **Signal Storms.** From the sixth night on, some nights the Root Server broadcasts: every wild bot
  goes Overclocked (all of them hunt, 30% faster and harder) and a bot left out under the open sky
  may revert to wild. Park them under a roof.
- **Forging** (breeding): two bots' cores cure at the right temperature in a Fabricator's warmth;
  the newbuild mixes its parents' stats, and a fresh mutation rolls a **glitch**, good, bad or weird.
- **Behaviour chips**: Follow, Guard Zone, Passive, Escort and Aggressive. A Watchwing on Guard Zone
  pings hostiles near its post.
- **Bodies.** Every machine is built in code from the body-plan builder in
  `src/engine-local/creatureBody/bodyPlan.ts` with its machine style: panelled hulls, pistons, metal,
  glowing eyes, antennae, rotors, drills, saws and forks (`src/game/data/robotBodies.ts`).

The roster: Mowbot, Ticklet, Craneback, Bulldozaur, Lodestone, Mirrorcat, Watchwing, Arcwire,
Klepto, Rootkit, Thermite Beetle, Homer, Echo Mimic, Choir Drone, Lampjaw, Hoover Leviathan and the
Scrapper Rex, plus forty more machines of the wider ecosystem and the Hivemind, the queen node
summoned at the green obelisk.

## Controls

WASD move, Shift sprint, Space jump, left click punch or swing what is in hand, E harvest a bush or
stones (or drink in water), I or Tab the inventory, 1-0 use or equip a hotbar slot, Esc pause.
At a bot: E opens a downed or uploaded bot's inventory (double-click your items to give them), E
rides a rigged bot and E again gets off. T whistles your bots to follow, U to Guard Zone. Riding,
WASD steers the mount and left click bites.

## Design

Numbers live in `src/game/data/` (items, schematics, technician, harvestables, species); places and
herds (`creature_spawn` markers) live in `src/editor.scene.json`. The Island is surveyed there too:
`coast` outlines, `peak` markers, `ridge` and `river` paths, `biome` outlines (engine
`terrain/surveyTerrain`); `src/world.ts` only says how the plains roll and the ground, sea and sky
are drawn.

- **Core loop.** Wake on the south beach with nothing. Punch trees for thatch and a little wood,
  pick bushes for fiber and berries, pick up stones and flint. Open the inventory (I), craft a Stone
  Pick (1 wood, 1 stone, 10 thatch) and a Stone Hatchet, and gather faster. Eat berries and drink at
  the shore while food and water drain.
- **The Technician's path.** Top left, one step at a time, with a star on the map at its target: the
  first tree, stones, the Stone Pick, the hatchet, berries, a drink, a mowbot uploaded, a stat point, a
  campfire, biogel hunted and cooked, a spear, a thatch hut, the Craneback rig, a craneback uploaded and
  ridden, an explorer note, drain spikes, a club, a lodestone, a cave artifact, the three artifacts, and the
  Hivemind. `Skip tutorial` hides it.
- **Progression.**
  - the genre's XP table to level 30 and its curve to level 105; each level gives one stat point and
    the genre's schematic points (8 at level 2).
  - Ten levelable stats with the genre's per-point gains (health +10, stamina +10, oxygen +20, food +10,
    water +10, weight +10, melee +5%, speed +1.5%, fortitude +2, crafting +10%).
  - Schematics by ARK level and point cost: Stone Pick and Torch known at level 1, Campfire, Spear and
    Hatchet at 2, cloth at 3, thatch pieces and Storage Box at 4, Craneback rig at 5, Mortar and
    Pestle at 6, Wooden Club at 8.
  - Tools bias the yield like ARK: the pick takes thatch and flint, the hatchet wood and stone.
  - Farming like the genre's Small Crop Plot (level 15): picking berry bushes now and then gives a Mejoberry
    Seed; planted in a plot it grows only while the plot has water (rain, or a waterskin poured in) and
    fertilizer (ground at the mortar from spoiled biogel and thatch), ripening in ten minutes; E picks ten
    mejoberries and it grows the next.
  - Mowbot, Craneback and Lodestone with the genre's base stats, per-level gains, speeds, temperaments
    (oblivious, skittish, aggressive) and uploading tables. Danger rises with distance: zones near the
    south beach roll wild levels up to 5, a level more every 50 m out, the full 30 from 1250 m.
  - Knock-out uploading: fists land 1.75x their damage as discharge, a club 20 a hit (9 hits for a level-1
    lodestone); discharge drains, food in its inventory is eaten on the genre's meal clock, drain spikes keep it
    under, upload integrity and bonus levels; it wakes and the bot is lost if discharge runs out.
  - Bots stay or follow on whistles and fight what you fight; Craneback rig at level 5 and
    Lodestone rig at 18 (the genre's costs) let you ride them.
  - Bodies carve into biogel and salvage by tool (pick for biogel, hatchet for salvage), and herds refill
    out of sight. Raw biogel spoils in 10 minutes and gel rations in 20, into spoiled biogel, which the
    mortar grinds with narcoberries into drain spikes.
  - Firmware, the genre's uploading food. Wild female core-layers drop an unfertilized core beside them now and
    then (two at most lying near one; mammals lay none), sized to the body: a mowbot's extra small, a
    lodestone's small, up to extra large. E picks one up. A Cooking Pot (level 10) cooks five tiers of
    firmware, each from an core of its size plus berries, biogel and fiber. Every species prefers one tier,
    the wiki's where it names one (lodestone Simple, scrapper Exceptional) and by body size otherwise; on that
    tier or higher it bots about five times faster than on raw biogel or berries and far cleaner, and a
    lower tier is worse than its plain food. Cores rot in 30 minutes and firmware in two hours.
  - Thatch, wood and stone building tiers with snap sockets.
- **Explorer notes and the dossier.** 21 notes lie at cave mouths, obelisk feet and summits; E reads
  one, opens it on screen and gives XP the first time. The Dossier tab (I) lists every species, "???"
  until met, which you have uploaded, and the notes you have read. The map in the corner shows the
  island's ground from above with unread notes, obelisks, cave mouths and your bots on it.
- **Weather and climate.** A long blue day and a short dawn and dusk on the genre's hour-long day. Each
  biome has its own air (the south coast hottest, the redwoods cool, the snow below freezing at
  night), colder with height and at night. Showers, storms, a heatwave and a cold snap come round on
  a four-hour schedule; the same storm falls as rain on the lowlands and as snow in the snow biome,
  greys the sky and dims the sun. Rain soaks and chills you under open sky; a roof keeps it off, and
  a campfire warms whoever stands by it. The HUD shows the weather and the air above the vitals.
- **Supply drops.** Crates come down at 38 drop sites across the island, the colour by place as in
  ARK: white and green on the south beaches, blue in the jungle and redwoods, purple and yellow in the
  highlands, yellow and red in the snow and on the volcano. Each falls for two minutes under a canopy
  from 150 m up, with a beam of its colour to find it by, and lasts twenty minutes once down. Only a
  technician of the colour's level opens it (white 3, green 15, blue 25, purple 35, yellow 45, red 60);
  inside are resources, gear and rigs that grow with the colour. An emptied site sends the next
  crate 10 to 30 minutes later (timings approximate).
- **Forging.** Every bot is born male or female with its levels spread over health, stamina,
  oxygen, food, weight and melee. Turn mating on in a bot's panel and leave a female and a male of a
  kind side by side: they mate for about a minute and she lays a fertilized core, or carries her young,
  on the ARK wiki's times for every species that breeds (the sterile Coilcobra, siphon, Ticklet
  and Choir Drone do not). An core boots up only inside its kind's temperature (a lodestone 20-28 °C, a scrapper
  32-34 °C) and loses health outside it, so a campfire or the shade decides it. Babies boot at a
  quarter size with each stat whole from one parent (55% the higher), a 2.5% chance per roll of a
  glitch adding two levels, and now and then twins or triplets. A newbuild eats from its own inventory
  and starves without biogel or berries in it, grows to full size over its maturation time, and every
  eight hours asks for a cuddle, a walk or food; each answered request adds calibration, which lifts its
  health, food, weight and melee by up to 20%. The mother waits 18 to 48 hours before mating again.
  `cheat breedingSpeed` sets the genre's boot, maturation and mating multipliers at once (mating time,
  core health and newbuild food are approximate).
- **The Hivemind.** E at the Green Obelisk's foot opens its terminal: Gamma (level 30, the Clever,
  Hunter and Massive artifacts), Beta (level 50, plus 5 each of Homer Talon, Arcwire Skin,
  Sauropod Vertebra and Coilcobra Venom) and Alpha (level 70, 10 of each). The trophies are on the
  bodies of the bots that carry them: E on a dead Homer, Arcwire, Hoover Leviathan, Pylon Walker or
  Coilcobra opens it. Paying the tribute opens a portal for 25 seconds; then everyone within 30 m of
  the obelisk, up to 10 technicians and 20 bots (riders pulled off), goes to her lair, a walled islet in
  the far south-east sea. She has the wiki's health (324k, 648k, 972k), melee and discharge, and is never
  shut down. She opens with a spit of acid and web that burns, drugs and slows, spits again every
  few seconds, and calls Hive Drone out of the walls at full health, two thirds and one third. Kill her
  and each technician gets Element (20, 56, 148), a Spider Flag and her trophy, then a minute later is
  sent back to where they stood. If every technician dies the fight is lost and the bots left inside
  die with it. `cheat hiveHealth` sets her health for proofs. Her spit, hive sizes, speeds and the
  trophy odds (one per body) are approximate.
- **Failure states.** Food and water drain; when either empties you lose about 1 HP every 5 seconds
  and discharge rises. Heat and cold drain them faster and hurt past the comfort band. At 0 health you
  wake back on the beach with full vitals.
- **Minute 5 -> hour 5.** At 5:00 you have a pick, a hatchet and a stack of thatch, and you are level
  3 or 4 choosing schematics. Hours in, the bot, building and biome PRs carry it: a thatch hut, a
  uploaded machines and the trek inland.
- **References it is chasing.**
  - *ARK: Survival Evolved* - systems 1:1: stats, levelling, schematics, recipes, gathering yields,
    HUD layout and inventory flow. Not affiliated with Studio Wildcard; no ARK art, audio or text.
  - *The Forest* - feel: punching and chopping a dense tree line by hand.
- **Gap to target.** The coastline is fitted to about 230 known wiki map points, so bays and capes are
  close to the genre's but not exact. Every machine is a procedural body (no artist models yet), so
  silhouettes are blocky and animation is the shared gait. Building has
  no metal tier, foundations snap edge to edge but not to cliffs, and the Storage Box and Preserving Bin are
  the only containers (no larger boxes, and the bin burns no fuel); rain drops are thin streaks; shots from the slingshot (stones) and the bow (stone and EMP
  arrows) hit instantly along the aim, with no arrow flight, drop or pickup, and the bow always reaches for
  EMP arrows first; no bolas or traps yet; firmware recipes stand berries, biogel and fiber in
for the genre's crops, which do not grow yet, and wild laying times, the pot's schematic and spoil times are
approximate; a bot's inventory holds slots, not weight; drain and regen rates where
  ARK publishes none are approximate; trees are stylized stand-ins, not palms. The Hivemind's lair is
an open-sky walled islet rather than the genre's enclosed jungle cave, she is an enlarged hive-drone body, the portal has no drag-weight limit, and the single-player boss damage cut is not applied.

Loop proof: fernwild-loop, fernwild-tame, fernwild-build

`from-zero` plays a new game with keys and mouse only, no cheats, for about 19 minutes of game
time: gathers, crafts the pick and hatchet, drinks, bots a mowbot with fists and berries, spends a
stat point, builds a campfire, hunts and cooks, crafts a spear, builds the thatch hut piece by piece,
bots, rigs and rides a craneback, reads a note, grinds drain spikes and crafts a club.

`fernwild-build` proves building: craft a thatch foundation, doorframe, three walls, a door and a
ceiling at the genre's prices, place them with snapping, walk inside, roof it, hang the door and open it.
Pieces have the genre's health; wood shrugs off fists and stone tools, stone takes only metal tools and
explosives, and a piece falls when nothing connects it to the ground.

`fernwild-tame` proves the bot loop: club a lodestone unconscious, feed it, rig it, level it
and spend a point in its stat sheet, ride it and sprint on its stamina (it uses the admin `cheat`
command for levels, items, bot XP and a faster uploading speed).

Bots level: up to 88 levels past the bot level, the n-th costing 10 x n XP, from kills
(the genre's base kill XP, +10% a level) and a passive 0.66 XP a minute. Each level is a point to spend in
the bot's inventory: health +5.4%, stamina, oxygen and food +10%, weight +4%, melee +1.7%,
speed +1% of its value when uploaded. Punches deal the genre's 1.75x their damage as discharge.

## Credits

Nature models: Quaternius Stylized Nature MegaKit, CC0 1.0. Machines: built in code from the
body-plan builder, no external models. Technician model: the engine's starter pack. Map
layout: The Island's landmark coordinates, heights and spawn regions as published on the ARK
community wiki (ark.wiki.gg), rebuilt as our own shapes; no ARK map art. See [content provenance](../CONTENT-PROVENANCE.md).
