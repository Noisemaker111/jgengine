# Crumb Run plan

Brief: "First-person extraction game. You're one of the Littles — people an inch tall who live in the
walls of a family home. Each run you slip out of a crack in the baseboard into a giant house,
scavenge, and extract before you're caught." Direction update: "people with different things they
can find, room after room procedural, cool things to pick up, extraction based per run."

The package id stays `deepward`; the game is Crumb Run. Deepward's Rune UI architecture (native JSX
on `@jgengine/core/ui/rune`, game-owned screens, the shared menu flow, save slots, notices) is kept:
this game is still the engine's Rune UI testbed.

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
## Suite score

What players must be able to do, proven by headless simulation in `bun test` (`jgengine suite deepward`). This is the headline; the engine coverage table below only hints where the engine has a part.

| Area | Proven | Failing | Not simulatable | Missing | Cut |
| --- | --- | --- | --- | --- | --- |
| onboarding | 2/2 | 0 | 0 | 0 | 0 |
| failure | 1/1 | 0 | 0 | 0 | 0 |
| save | 1/1 | 0 | 0 | 0 | 0 |
| settings | 1/1 | 0 | 0 | 0 | 0 |
| menu | 1/1 | 0 | 0 | 0 | 0 |
| progression | 1/1 | 0 | 0 | 0 | 0 |
| content | 5/5 | 0 | 0 | 0 | 0 |
| extraction | 4/4 | 0 | 0 | 0 | 0 |
| **total** | **16/16** | 0 | 0 | 0 | 0 |

<details><summary>Every required entry</summary>

Genres: extraction. 16/16 proven.

| Entry | Status | What the player does | Detail |
| --- | --- | --- | --- |
| `onboarding.first-goal` | proven | A new game shows a first goal, and the first player action toward it advances it. | proofs/sim/first-goal.proof.ts |
| `onboarding.find-features` | proven | A player following the game's own guidance reaches the first use of every core feature. | proofs/sim/find-features.proof.ts |
| `failure.lose-and-recover` | proven | The player can fail (die, lose the run, go broke) and the game puts them back into play at a stated cost. | proofs/sim/caught.proof.ts |
| `save.continue` | proven | Progress made by playing survives saving and continuing. | proofs/sim/save-continue.proof.ts |
| `settings.controls` | proven | The player opens settings and a change (a binding, volume, sensitivity) takes effect. | proofs/sim/rebind-pack.proof.ts |
| `menu.start-and-credits` | proven | The main menu starts a game and shows the credits. | proofs/sim/menu-credits.proof.ts |
| `progression.runway` | proven | Something new unlocks steadily across the first five hours, up to the progression cap. | content check |
| `content.item-source` | proven | Every item can be obtained by playing. | content check |
| `content.item-use` | proven | Every item does something: crafts, equips, eats, places, feeds, sells or summons. | content check |
| `content.recipes-reachable` | proven | Every recipe and source can actually be used: its inputs, station and unlock are all obtainable. | content check |
| `content.placeables-place` | proven | Every item that says it can be placed can be placed. | content check |
| `content.weapons-have-ammo` | proven | Every weapon that fires has obtainable ammo, or needs none. | content check |
| `extraction.enter-run` | proven | Go into a run with chosen gear. | proofs/sim/enter-run.proof.ts |
| `extraction.carry-limit` | proven | What can be carried out is limited by space or weight. | proofs/sim/carry-limit.proof.ts |
| `extraction.extract-bank` | proven | Reaching an exit banks what was carried. | proofs/sim/extract-bank.proof.ts |
| `extraction.die-lose-carried` | proven | Dying in a run loses what was carried. | proofs/sim/caught.proof.ts |

</details>
<!-- /suite-score -->

## Direction

- **Genre and references.** First-person extraction (*Escape from Tarkov*'s way-out tension and
  grid packing), giant-household scale (*Arrietty*, *It Takes Two*, *Grounded*), roguelite room
  chains (*Spelunky*, *Hades*' door previews).
- **Player promise.** Every night the house is different, and every door is a bet: go one room
  deeper for better finds, or get home with what you have before the Cat, the Roomba or the dawn.
- **Pillars.** Scale you can feel (furniture as cliffs, finds you hug with both arms). A house that
  hunts by sound and sight, with tells you can read. Choices about what to carry.
- **Anti-pillars.** No combat power fantasy (the needle stings, it does not kill a cat). No grind
  wall: every run banks something unless you are caught.
- **Falsifier.** If players stop deciding at doors (always deepest, or always straight home), the
  depth curve is wrong.
- **Done.** From a new burrow: run, extract, build the larder and map room, chart the kid's bedroom,
  unlock Wren, and bring home a full set.

## Design brief

- **Core loop (30 s).** Enter a room, read the hunters, sneak to a spot, rummage, decide: on, back,
  or out.
- **Session loop (one run, 3-7 min).** Slip out at 3 AM, go room after room through doors, cables,
  climbs and drops, fill the pack, extract through a way out before dawn (6 AM) or be caught.
- **Long loop (hours).** Bank finds, build the burrow (workbench, larder, map room, satchel loft,
  trophy shelf), craft gear, chart new zones (kid's bedroom, garage, attic), move in new Littles,
  complete the five sets.
- **Second 0.** You stand in the burrow facing the glowing crack; E slips you out. The first verb is
  "go", because the house is the game.
- **Onboarding.** The burrow card always shows the next goal (`nextGoal`), prompts name every verb,
  doors read what they are ("Climb the drawer pulls"), and the first room is never deep.
- **Pace.** Something new every run in the first hour: a new room template, a new hunter, a new
  find; an upgrade every one to two runs.

### First 10 minutes
- 0:00 Burrow; the goal card says slip out. E at the crack.
- 0:20 Under the kitchen cabinets: crumbs by the cat bowl, a tea towel to hide under. First find.
- 1:30 First door: the drawer pulls up to the counter, or the gap under the pantry door.
- 2:30 First hunter (the Cat on the counter, a mousetrap in the pantry). The noticed meter teaches sneaking.
- 4:00 Back through the crack with three or four things: first extraction, caps and stash.
- 5:00 Workbench: build the larder (two crumbs and a raisin) or save for the map room.
- 6:00 Second run as Bolt: traps show, disarm one for a spring.
- 8:30 A two-handed cheese cube: slow, no running, worth it?

### Start state
`home: 1, caps: 0, stash: 0, littles: 2, zones: 2, upgrades: 1`.

### Content budget
18 room templates in 5 zones plus the burrow; 43 item kinds (8 food, 10 parts, 16 curios, 7 gear,
bottle caps) in 6 sets; 6 Littles; 7 threats (Cat, Roomba, spider, mousetrap, Kid, dog, lights);
6 connector kinds; 4 exit kinds; 5 burrow upgrades, 5 recipes, 3 charts.

### Systems
- Procedural house (`runGen.ts`): probe `depth`, `rooms`, `deepest`.
- Threats (`threats.ts`): probe `threats`, `hunting`.
- Pack and haul (`state.ts`, `haul.ts`): `carried`, `packMass`, `packRoom`.
- Burrow (`burrow.ts`): `caps`, `stash`, `upgrades`, `zones`, `littles`, `sets`.
- Night clock: `elapsed`, `dawn`.

## Features

- Procedural room chain — game-local `src/game/runGen.ts` over `crumb-room` templates in `editor.scene.json` [gap: no engine room-graph generator; this is the first adopter].
- Seeded randomness — `@jgengine/core/random/rng` (`hashUnit`).
- Loot rolls, rarity and affixes — `@jgengine/core/loot/lootGen`, `loot/drop`.
- Run boundary — `@jgengine/core/run/sessionLoop`; haul bank/fail — `@jgengine/core/loot/haul`.
- Trade ledger — `@jgengine/core/loot/salvage`.
- Save documents and slots — `@jgengine/core/save/saveDocument`, `save/saveSlots`.
- UI — `@jgengine/core/ui/rune` primitives, `dialog/modalStack`, settings controller.
- Movement — shell first-person rig with `movement.beforeCommit` and `canSprint`.

## Gaps

- Seeded room-graph generator over authored templates: candidate `packages/core/src/generator/roomGraph.ts`; Crumb Run is the first adopter, lift it when a second game needs rooms-from-templates.
- Small-creature hunter behaviours (stalk by sound, pounce, schedule sweeps) are game-local in `threats.ts`; the engine's `ai/temperament` + `sensor/perception` could host them when a second adopter appears.

## Milestones

- [x] 1. Core loop: burrow, procedural rooms, finds, pack, extraction through the crack, caught screen, save.
- [x] 2. Six Littles with distinct senses and finds; gear that works from the pack; sets; burrow upgrades, crafting, charts.
- [x] 3. Threats with tells (Cat wiggle, Roomba whirr, dog bark, kid looking, lights on), dawn clock, varied exits.
- [ ] 4. Polish rounds: playtested balance, more templates per zone, juice, from-zero flow and suite proofs.

## Handoff

Done: the whole game layer is replaced (see README): 18 room templates over 5 zones, seeded
room-after-room runs with seven kinds of night, 43 finds in 6 sets, 7 gear effects, 6 Littles (traps
hide from everyone but Bolt; food glints for Pip, curios for Dot; Wren reads doors ahead), 7 hunters
with on-screen tells, 4 exit kinds with their own conditions, burrow upgrades, crafting, charts, the
kid's toy box, a night report on extraction, footsteps and heartbeat audio.

Onboarding: a burrow's first night opens safe under the kitchen cabinets with the larder's cost on
the floor, and for the first three nights a firefly floats over whatever the guidance points at.

Balance (headless sims over seeded rooms, straight-line bot that never dodges): a find six rooms in
is worth about three times one at the crack; lethal risk per room ramps from 0% at the crack to about
17% five rooms deep; the Littles' finds differ by category (Pip 60% food, Bolt 37% parts, Dot 47%
curios). Tests: `bun run test` in the package (44); suite 16/16; flow `proofs/flows/first-night.flow.ts`.

On screen (software WebGPU capture, `apps/dev` runner, `?state=`): `proofs/look/` holds the burrow,
the first-night kitchen with its glinting crumbs and the firefly guide, the Cat's crouch tell, the
kitchen counter six rooms deep, the living-room rug and the night report. Visual passes so far: an
interior light rig with no sky dome, far walls round floor-level rooms, calmer lamps, bloom and haze,
no LUT (it turned the house orange), arrival a few paces into the room looking toward the way on,
backed HUD text and hunter tells, the Cat dropping its head when it crouches, short find names.
Capture states: `burrow`, `first-room`, `mid-run`, `cat-tell`, `room-counter`, `room-rug`,
`room-toys`, `room-attic`, `report`, `stash`, `workbench`, `nook`.

Look round 4: every find stands in a coloured light column with a ring and a twinkle (gold food, blue
parts, pink curios, green gear, red caps) and the one E takes gets an outline and lifts; CC0 household
models at inch-high scale (KayKit couch, armchair, lamp, rug, kid's bed; Quaternius bread, mug, jars,
cutlery, plates, chest, books, boxes, cans, tyres); props are slid out of doorways; an 82 degree view
and soft floor shadows under the Cat and dog. Every room has a capture state, `room:<template>`.

Next: room overviews still land beside a giant prop in dense rooms (dining table, rug); the Cat and dog
are procedural (a library dog model exists but is unanimated); ten rooms have had no model pass yet
(kitchen cabinets, under the fridge, bookshelf, front hall, under the bed, bathroom, laundry, both
garage shelves rooms beyond a few cans); UI sheets beyond the workbench were not inspected.
