# Make a new game

```sh
bun run games:new "zombie survival: scavenge by day, fortify your safehouse, nights get harder"
bun --cwd=games/<id> run dev          # play it
```

One sentence in, a playable game out, in 3 to 10 seconds. The generator reads which genre the idea
is (`scripts/new-game/kinds/index.ts`), lets that kind read the idea into its data and lay out a
dressed world, and writes a full game folder. Every kind is a real genre with its own loop,
progression, save and screens; there is no fallback starter.

| Kind | The idea says | What you get | Example |
| --- | --- | --- | --- |
| **survival** | survival, zombie, horde, tame, night, dinosaur... | gather by day, build, hold the night; nights get harder; tame animals | `hold-the-line/`, `fernwild/` |
| **racer** | race, drift, circuit, car, street... | a career of dusk races against rivals; win cash, tune the car | `apex-nights/` |
| **builder** | city builder, castle builder, tycoon, kingdom, medieval... | place homes and workplaces on a grid, grow tiers from hamlet to castle town | `briarcrown/` |
| **defense** | tower defense, turrets, waves, siege, orbital... | build towers on pads along the lanes, survive numbered waves | `orbit-watch/` |
| **farm** | cozy, farming, fishing, harvest, village life... | plant, water and sell crops, fish the lake, grow the farm | `saltwick/` |
| **shooter** | shooter, third person, guns, mech, aliens... | clear enemy outposts, earn credits per kill, buy better guns | `outpost-zero/` |
| **colony** | colony, RTS, settlers, mars, crew... | select crew, gather, build modules, hold off raids | `red-frontier/` |
| **explorer** | explore, adventure, ruins, relics, dragon... | an open world of landmarks; find relics that unlock glide and double jump | `the-sunken-crown/` |

A named genre wins; between equal genres, what the idea talks about breaks the tie. An idea that
names no genre goes to the closest one by its words (a castle is built, a dragon is explored), and
an idea with no clue at all starts as an open world to explore.

Flags: `--name "My Name"` names it, `--kind farm` overrides the choice, `--force` rebuilds an
existing folder, and `--print` shows the kind it reads, why, and the idea data, writing nothing.

## Change it

Almost everything is in **one file**: `<id>/src/game/idea.ts`. It holds the names, words, costs,
enemy stats, models, look, mood and UI kit. Places live in `<id>/src/editor.scene.json`: press F2,
then E, in the running game, move things, and save with Ctrl+S. Code never holds coordinates.

## The building blocks, and the lines that use them

**Game rules: `defineWorldModel` declarations run by `defineGameSpec`.** The world's facts, actions,
costs and story beats are plain data. The spec runs them, saves them, and puts built things in the scene.

```ts
export const world: WorldModelDecl = { kinds, things, actions, events, jobs };          // src/game/spec.ts
export const camp = defineGameSpec({ id: idea.spec, world, hooks, show: { structure: { role: "prop" } }, autoStart: true });
```

`show` makes each built barricade or palisade appear in the world, and a loaded save rebuilds it.
`autoStart` plays the story beats one after another with no quest giver. In the racer, upgrades are
actions whose cost goes up each stage: `scaleBy: "stage"`.

**Look and mood presets.** Pick them as words in `idea.ts`. The game config passes them on as is:

```ts
look: idea.look, mood: idea.mood,          // "cinematic" + "overcast", "cinematic" + "night", ...
```

**UI kit.** One word re-skins every menu and the HUD (`terminal`, `parchment`, `arcade`, ...):

```ts
uiKit: idea.kit,                                                       // src/game.config.ts
<KitPanel variant="hud" eyebrow={idea.name}><KitMeter label="You" value={hp} max={max} /></KitPanel>
```

The title, pause, briefing, controls and credits screens (`src/game/ui/Menus.tsx`) and the end screen
(`KitResultScreen`) are all kit parts, so they match the HUD.

**Models: the model library, plus packs on disk.** A bare name comes from the realistic model
library. A path is a file the game serves itself; the generator copies pack models into
`public/models/imported/`.

```ts
{ "model": "city/street-lamp", "height": 5 }                                  // library
{ "model": "/models/imported/kaykit-city-builder/building_B.glb" }             // pack copy
```

`src/game/models.ts` turns either form into a model config with `libraryModel(name, { targetHeight })`.
A `tint` repaints a model, so one rigged body can make several enemies.

**World and layout: the editor scene, laid out by the kind.** Each kind's `scene()` places its
world with `scripts/new-game/world/layout.ts` (seeded, so the same idea lays out the same world) and
dresses it with `world/dress.ts`:

- `town()`: a city volume from the engine's city studio (village, coastal, ruin, town, downtown,
  farmland or outpost look) on a levelled pad.
- `forest()`, `grove()`, `patch()`, `meadow()`: woods and brush in clumps, never grids.
- `lake()`: water 4 m deep with a carved bed and a shore pad. `trail()`: dirt or gravel paths.
- `cluster()`: crates, ruins or barriers piled around a spot. `wilds()`: woods, outcrops and drifts
  out to the world edge.

Terrain, sky and time of day come from the idea: `world.relief`, `world.sky` (preset, `cycle`,
`dayLength`, `startHour`), and `time` in `src/world.ts`. Survival starts at 7:00 with a day twice the
calm, so each wave lands at dusk.

```ts
const authored = environmentContentFromDocument(editorLayers, { minBounds: { w: 480, d: 480 } });   // src/world.ts
roads: [road({ path: loop, width: circuit.width, markings: true, sidewalk: { width: 3 } })],         // racer
```

**HUD.** `src/game/ui/HudFrame.tsx` gives every kind a compact HUD from UI kit blocks: corner
panels 248 px wide, one `Counts` row for resources, and no drop-shadow filters over the canvas.

**Enemies and pets.** Enemies are spawned with the engine's chase-and-attack behaviour. A tamed animal
uses the same behaviour, held to its owner:

```ts
behaviors: [pursue({ aggroRadius: 400, reach: 1.6, speed, attack: { effect: "damage", amount, intervalSec: 1.1 } })]
pursue({ anchor: ctx.player.userId, hunts: threatNames, ... })         // heels at ~2.5 m, fights only threats
```

**Driving and racing.** The racer's car, rivals and laps are engine parts:

```ts
car = createKinematicVehicle(BASE, { position, heading });  tickDrivableVehicle(car, dt, axis, modifiers);
state.race = createRaceState({ track: trackOf(circuit, race.laps) });     // checkpoints read off the circuit path
camera: { rig: "chase", chase: { distance: 7.5, fov: { base: 66, max: 84, speedForMax: 40 } } }
```

**Save.** The game saves on its own: every 30 seconds of play, at each dawn and after each race. Continue on the title screen
loads the save.

```ts
persist: { mode: "manual" },                         // src/game.config.ts
void ctx.game.save?.checkpoint();                    // src/game/flow.ts, waves.ts, race.ts
```

## Prove it

Each game ships two routes, which `bun run drive` plays in a real browser:

```sh
bun run drive <id> --game-dir <path-to-game> --flow <id>-loop      # the whole first loop, asserted
bun run drive <id> --game-dir <path-to-game> --state wave --flow <id>-clip --record clip   # a ~35 s clip
```

`new-game` prints the exact clip command for the kind (its `clipState`). `capture.probe` in
`game.config.ts` names the numbers the routes check (wave, built, towers, people, cash...). Click
steps are pixels in a 1600x900 view, so keep them off the starting building.

## Add a new kind of game

1. Add `scripts/new-game/kinds/<kind>.ts` exporting `kind: KindModule` (`read`, `scene`, `readme`,
   `loopFlow`, `clipFlow`, `genre`), and its genre and lean words in `kinds/index.ts`.
2. Add `scripts/new-game/template/<kind>/` with `src/game/kindShape.ts` (its `Idea`), the game, HUD
   and screens. `template/common` is copied first, so share what you can there.
3. When a game needs something the engine cannot do, fix the engine, not the game.
