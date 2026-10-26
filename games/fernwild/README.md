# Fernwild

ARK: Survival Evolved, rebuilt on JGengine as close to the real game as our own models and words
allow: the same survivor stats and levelling, engrams, recipes, gathering and HUD. Start it with
`bun --cwd=games/fernwild run dev` from the repository root.

The map is ARK's The Island at 3/8 scale (30 m a map grid unit, about 2.6 km across): the same
coastline, Dead Island, South Haven and the Craggs, the volcano, the northern and southern mountain
chains, Frozen Fang and Frozen Tooth in the snow, the redwoods, the swamp, the jungle and the five
rivers, with ARK's three obelisks and caves marked. Its 231 creature spawn zones carry ARK's
species and weights per biome, and resources sit where ARK puts them: metal on the mountains,
obsidian at the volcano, crystal on the peaks, oil on the frozen shore. Survival, creatures and
thatch-to-stone building are in; death, weather, supply drops, breeding and the boss come next.

## Controls

WASD move, Shift sprint, Space jump, left click punch or swing what is in hand, E harvest a bush or
stones (or drink in water), I or Tab the inventory, 1-0 use or equip a hotbar slot, Esc pause.
At a creature: E opens a knocked-out or tamed creature's inventory (double-click your items to give
them), E rides a saddled tame and E again gets off. T whistles your tames to follow, U to stay.
Riding, WASD steers the mount and left click bites.

## Design checklist

Numbers live in `src/game/data/` (items, engrams, survivor, harvestables, species); places and
herds (`creature_spawn` markers) live in `src/editor.scene.json`. The Island is surveyed there too:
`coast` outlines, `peak` markers, `ridge` and `river` paths, `biome` outlines (engine
`terrain/surveyTerrain`); `src/world.ts` only says how the plains roll and the ground, sea and sky
are drawn.

- **Core loop.** Wake on the south beach with nothing. Punch trees for thatch and a little wood,
  pick bushes for fiber and berries, pick up stones and flint. Open the inventory (I), craft a Stone
  Pick (1 wood, 1 stone, 10 thatch) and a Stone Hatchet, and gather faster. Eat berries and drink at
  the shore while food and water drain.
- **Progression.**
  - [x] ARK's XP table to level 30 and its curve to level 105; each level gives one stat point and
    ARK's engram points (8 at level 2).
  - [x] Ten levelable stats with ARK's per-point gains (health +10, stamina +10, oxygen +20, food +10,
    water +10, weight +10, melee +5%, speed +1.5%, fortitude +2, crafting +10%).
  - [x] Engrams by ARK level and point cost: Stone Pick and Torch known at level 1, Campfire, Spear and
    Hatchet at 2, cloth at 3, thatch pieces and Storage Box at 4, Phiomia saddle at 5, Mortar and
    Pestle at 6, Wooden Club at 8.
  - [x] Tools bias the yield like ARK: the pick takes thatch and flint, the hatchet wood and stone.
  - [x] Dodo, Phiomia and Raptor with ARK's base stats, per-level gains, speeds, temperaments
    (oblivious, skittish, aggressive) and taming tables; wild levels 1-30.
  - [x] Knock-out taming: club torpor (18 hits for a level-1 raptor), torpor drain, food in its
    inventory eaten on ARK's meal clock, narcotics to keep it under, taming effectiveness and bonus
    levels; it wakes and the tame is lost if torpor runs out.
  - [x] Tames stay or follow on whistles and fight what you fight; Phiomia saddle at level 5 and
    Raptor saddle at 18 (ARK's costs) let you ride them.
  - [x] Bodies carve into meat and hide by tool (pick for meat, hatchet for hide), and herds refill
    out of sight.
  - [ ] Thatch, wood and stone building tiers with snap sockets (PR after).
- **Failure states.** Food and water drain; when either empties you lose about 1 HP every 5 seconds
  and torpor rises. Heat and cold drain them faster and hurt past the comfort band. At 0 health you
  wake back on the beach with full vitals.
- **Minute 5 -> hour 5.** At 5:00 you have a pick, a hatchet and a stack of thatch, and you are level
  3 or 4 choosing engrams. Hours in, the creature, building and biome PRs carry it: a thatch hut, a
  tamed dino and the trek inland.
- **References it is chasing.**
  - *ARK: Survival Evolved* - systems 1:1: stats, levelling, engrams, recipes, gathering yields,
    HUD layout and inventory flow. Not affiliated with Studio Wildcard; no ARK art, audio or text.
  - *The Forest* - feel: punching and chopping a dense tree line by hand.
- **Gap to target.** The coastline is fitted to about 230 known wiki map points, so bays and capes are
  close to ARK's but not exact. Every species has a free model (CC0 or CC-BY), but where no free
  model of the animal exists its nearest relative stands in at the species' size and colour: the dodo
  is a dove, the phiomia an elephant, pteranodon an eagle, argentavis a vulture, ankylosaurus and
  doedicurus armadillos, dimetrodon and megalania salamanders, allosaurus and baryonyx a generic
  tyrannosaur, carnotaurus and yutyrannus the T-Rex, dilophosaur, troodon and compy the raptor,
  pachy and iguanodon the parasaur, chalicotherium a ground sloth, paraceratherium a rhino,
  gigantopithecus a yeti, and so on (`src/game/data/creatureModels.ts` lists every one). Building has
  no metal tier, foundations snap edge to edge but not to cliffs, and storage boxes cannot be placed
  yet; no weather yet; no bolas, slingshot shots or tranq arrows yet, so a raptor is clubbed (or
  punched) at close range; a tame's inventory holds slots, not weight; drain and regen rates where
  ARK publishes none are approximate; trees are stylized stand-ins, not palms.

Loop proof: fernwild-loop, fernwild-tame, fernwild-build

`fernwild-build` proves building: craft a thatch foundation, doorframe, three walls, a door and a
ceiling at ARK's prices, place them with snapping, walk inside, roof it, hang the door and open it.
Pieces have ARK's health; wood shrugs off fists and stone tools, stone takes only metal tools and
explosives, and a piece falls when nothing connects it to the ground.

`fernwild-tame` proves the creature loop: club a raptor unconscious, feed it, saddle it, level it
and spend a point in its stat sheet, ride it and sprint on its stamina (it uses the admin `cheat`
command for levels, items, tame XP and a faster taming speed).

Tames level as in ARK: up to 88 levels past the tame level, the n-th costing 10 x n XP, from kills
(ARK's base kill XP, +10% a level) and a passive 0.66 XP a minute. Each level is a point to spend in
the tame's inventory: health +5.4%, stamina, oxygen and food +10%, weight +4%, melee +1.7%,
speed +1% of its value when tamed. Punches deal ARK's 1.75x their damage as torpor.

## Credits

Nature models: Quaternius Stylized Nature MegaKit, CC0 1.0. Creature models: Quaternius (CC0 1.0),
Poly by Google and madtrollstudio (CC-BY 3.0), each listed with its page in
`src/game/data/creatureModels.ts` and in the in-game credits. Survivor model: the engine's starter pack. Map
layout: The Island's landmark coordinates, heights and spawn regions as published on the ARK
community wiki (ark.wiki.gg), rebuilt as our own shapes; no ARK map art. See [content provenance](../CONTENT-PROVENANCE.md).
