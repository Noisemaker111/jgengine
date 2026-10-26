# Fernwild

ARK: Survival Evolved, rebuilt on JGengine as close to the real game as our own models and words
allow: the same survivor stats and levelling, engrams, recipes, gathering and HUD. Start it with
`bun --cwd=games/fernwild run dev` from the repository root.

This is the survival slice. Dinosaurs, building, the full biome map and the late game land in the
PRs after it, in that order.

## Controls

WASD move, Shift sprint, Space jump, left click punch or swing what is in hand, E harvest a bush or
stones (or drink in water), I or Tab the inventory, 1-0 use or equip a hotbar slot, Esc pause.

## Design checklist

Numbers live in `src/game/data/` (items, engrams, survivor, harvestables); places live in
`src/editor.scene.json`.

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
  - [ ] Dinosaurs, knock-out taming and saddles (next PR).
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
- **Gap to target.** No dinosaurs, building, caves, weather or other biomes yet; drain and regen
  rates where ARK publishes none are approximate; trees are stylized stand-ins, not palms.

Loop proof: fernwild-loop

## Credits

Nature models: Quaternius Stylized Nature MegaKit, CC0 1.0. Survivor model: the engine's starter
pack. See [content provenance](../CONTENT-PROVENANCE.md).
