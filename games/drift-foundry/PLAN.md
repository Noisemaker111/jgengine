# Cleanup on Aisle 9 — plan

Physics racing in shopping carts through a mega-store at closing time (package id stays `drift-foundry`).
The design and what the build runs now are in `README.md`; the look in `src/art-direction.md`.

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
## Suite score

What players must be able to do, proven by headless simulation in `bun test` (`jgengine suite drift-foundry`). This is the headline; the engine coverage table below only hints where the engine has a part.

| Area | Proven | Failing | Not simulatable | Missing | Cut |
| --- | --- | --- | --- | --- | --- |
| onboarding | 2/2 | 0 | 0 | 0 | 0 |
| failure | 1/1 | 0 | 0 | 0 | 0 |
| save | 1/1 | 0 | 0 | 0 | 0 |
| settings | 1/1 | 0 | 0 | 0 | 0 |
| menu | 1/1 | 0 | 0 | 0 | 0 |
| progression | 1/1 | 0 | 0 | 0 | 0 |
| content | 5/5 | 0 | 0 | 0 | 0 |
| racing | 5/5 | 0 | 0 | 0 | 0 |
| **total** | **17/17** | 0 | 0 | 0 | 0 |

<details><summary>Every required entry</summary>

Genres: racing. 17/17 proven.

| Entry | Status | What the player does | Detail |
| --- | --- | --- | --- |
| `onboarding.first-goal` | proven | A new game shows a first goal, and the first player action toward it advances it. | proofs/sim/first-goal.proof.ts |
| `onboarding.find-features` | proven | A player following the game's own guidance reaches the first use of every core feature. | proofs/sim/find-features.proof.ts |
| `failure.lose-and-recover` | proven | The player can fail (die, lose the run, go broke) and the game puts them back into play at a stated cost. | proofs/sim/lose-recover.proof.ts |
| `save.continue` | proven | Progress made by playing survives saving and continuing. | proofs/sim/save-continue.proof.ts |
| `settings.controls` | proven | The player opens settings and a change (a binding, volume, sensitivity) takes effect. | proofs/sim/rebind.proof.ts |
| `menu.start-and-credits` | proven | The main menu starts a game and shows the credits. | proofs/sim/menu-credits.proof.ts |
| `progression.runway` | proven | Something new unlocks steadily across the first five hours, up to the progression cap. | content check |
| `content.item-source` | proven | Every item can be obtained by playing. | content check |
| `content.item-use` | proven | Every item does something: crafts, equips, eats, places, feeds, sells or summons. | content check |
| `content.recipes-reachable` | proven | Every recipe and source can actually be used: its inputs, station and unlock are all obtainable. | content check |
| `content.placeables-place` | proven | Every item that says it can be placed can be placed. | content check |
| `content.weapons-have-ammo` | proven | Every weapon that fires has obtainable ammo, or needs none. | content check |
| `racing.drive-handling` | proven | Accelerate, brake and steer a vehicle that handles by its physics. | proofs/sim/drive-handling.proof.ts |
| `racing.lap-timing` | proven | Laps and checkpoints are timed. | proofs/sim/lap-timing.proof.ts |
| `racing.opponents` | proven | Opponents race and finish in an order. | proofs/sim/opponents.proof.ts |
| `racing.unlock-vehicles-tracks` | proven | Results unlock new vehicles or tracks. | proofs/sim/unlock.proof.ts |
| `racing.crash-recover` | proven | A crash or wrong way is recoverable. | proofs/sim/crash-recover.proof.ts |

</details>
<!-- /suite-score -->

## State

- Built: carts with weight-driven handling, shelf grabs, five power-ups, style meter, self-checkout
  receipt, six departments (five under a warehouse roof with back walls, the Garden Centre outdoors in
  bounded rain), per-department lighting zones (dark showroom, sodium dock, cold frozen aisle),
  late-shopper rivals with lines, pennants and Officer Dale, shutters + floor scrubber, cart corral,
  12 mods, onboarding tips folded into one banner, juice, world-save fallback, original procedural art.
- Proven: 227 unit tests, 17/17 game-suite proofs (save.continue brings back the basket, its
  value, power-ups and cleared shelves), boot capability probe, screenshots of every department.

## Next

1. Lighting zones are rectangles; the Toy Aisle and Produce could take their own (pastel spill, a
   misted green cooler) once the art asks for it.
2. The ceiling tube rows stay emissive in the dark showroom; an emissive scale per zone would let
   Electronics' house lights read as properly off.
3. `proofs/flows/mid-run-reload.flow.ts` (browser) checks the basket across a real reload; it has
   not been run in this environment.
