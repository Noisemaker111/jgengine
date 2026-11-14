# Crumb Run

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
Game suite: **13/16 proven · 3 missing** · `jgengine suite deepward`
<!-- /suite-score -->

You are one of the Littles: people an inch tall who live in the walls of a family home. Every night
you slip out of a crack in the kitchen baseboard into a giant house, go room after room, fill your
pack and get home before you are caught. Every night the house is different.

The package id is still `deepward`. Run `bun --cwd=games/deepward run dev` from the repository root.

## How it plays

- **Room after room.** A run is a seed. Every room is a path from the crack ("0", then "0-1" for the
  second door out of it), and the room's template, its finds, its hunters and its exits are a pure
  function of the seed and that path (`src/game/runGen.ts`). The house is built from twelve
  editor-authored room templates in `src/editor.scene.json` (under the kitchen cabinets, the counter,
  the pantry shelf, under the fridge, under the bookshelf, under the couch, the living-room rug, the
  front hall, the toy corner, under the bed, the garage workbench, the attic). Deeper rooms roll
  better finds and more hunters. The seed is saved, so a reload resumes the same house.
- **Doors.** Rooms join by gaps, drawer-pull climbs, counter-edge drops (bring a napkin parachute),
  charger-cable ziplines, the toy train (wait for it) and vents. Going back is usually slower.
- **Ways out.** The crack you came from, and, deeper in, a mail slot (only if you travel light), a
  heating vent (only while the heating is off) and the dog door or cat flap (heavy: a grapple or
  Tuck). Dawn comes at 6 AM; half an hour later the family is up and you are caught.
- **The Littles.** Pip the Forager smells food and carries it at half weight. Bolt the Tinkerer sees
  and disarms mousetraps for springs. Wren the Scout is half as loud and reads every door ahead.
  Tuck the Brute carries two-handed finds without slowing. Dot the Collector sees shiny curios a
  rarity finer. Old Fennel the Night Owl keeps a longer night. Two live in the burrow; the others
  move in as it grows.
- **Finds.** 37 kinds with flavour: food, parts, curios and gear. Gear works while it rides in your
  pack: thimble helmet, sewing-needle spear (F), napkin parachute, paperclip grapple, button shield,
  birthday-candle torch, rubber-band slingshot (G). Five sets (Sewing Basket, Junk Drawer, Midnight
  Feast, Treasure Hoard, Toy Box) pay a bonus when carried home together. Size and weight are real:
  a cheese cube or a coin needs both arms and slows you.
- **The house hunts.** The Cat prowls, listens, stalks what it heard, crouches with a wiggle and
  pounces where you stood; hide under a towel or dodge. The Roomba sweeps lanes on a schedule and
  swallows what it rolls over. Spiders web the corners. Mousetraps snap. A restless Kid sits up and
  looks; held in sight, they pick you up and keep your pack in the toy box, which you can raid on a
  later night. The dog barks and wakes everything. Someone getting up for water turns the light on.
- **The burrow.** Bank finds in the matchbox stash, trade for bottle caps, build the larder, map
  room, satchel loft and trophy shelf, craft gear at the workbench and chart the kid's bedroom, the
  garage and the attic.

Controls: WASD, Shift to run, C or Ctrl to sneak, E to interact, Tab for the pack, F to jab, G to
fling, Esc to pause.

## Where things live

- `src/world.ts` reads the authored templates; `scripts/author-house.ts` rebuilds them through the
  editor session.
- `src/game/runGen.ts` (procedural house), `threats.ts` (hunters), `loot.ts` (finds and sets),
  `littles.ts`, `burrow.ts`, `state.ts` (home and run), `save.ts` (one save document per burrow),
  `controls.ts` (commands, tick, movement rule).
- Art: `houseArt.tsx`, `houseMaterials.ts`, `itemArt.ts`, `threatArt.ts`; UI in `src/game/ui/`.

See [credits](CREDITS.md) and [the plan](PLAN.md).

Loop proof: runLoop.test
