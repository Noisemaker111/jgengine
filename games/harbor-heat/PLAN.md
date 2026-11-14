# High Tide Pizza plan

Brief: "You're the newest delivery rider for a family pizzeria in a canal city that floods every single
night. As the tide rises through a shift, streets become canals and your routes, vehicles and shortcuts
change." Redesign of Harbor Heat (folder and package id stay `harbor-heat`): reuse its city of Mainsail,
courier machinery, vehicles, race circuits, save and tests; replace the content. "Just do it, be really
creative."

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
## Suite score

What players must be able to do, proven by headless simulation in `bun test` (`jgengine suite harbor-heat`). This is the headline; the engine coverage table below only hints where the engine has a part.

| Area | Proven | Failing | Not simulatable | Missing | Cut |
| --- | --- | --- | --- | --- | --- |
| onboarding | 1/2 | 0 | 0 | 1 | 0 |
| failure | 1/1 | 0 | 0 | 0 | 0 |
| save | 0/1 | 0 | 0 | 1 | 0 |
| settings | 0/1 | 0 | 0 | 1 | 0 |
| menu | 0/1 | 0 | 0 | 1 | 0 |
| progression | 0/1 | 0 | 0 | 1 | 0 |
| content | 0/0 | 0 | 0 | 0 | 5 |
| racing | 2/5 | 0 | 0 | 3 | 0 |
| open-world | 3/3 | 0 | 0 | 0 | 0 |
| delivery | 6/6 | 0 | 0 | 0 | 0 |
| **total** | **13/21** | 0 | 0 | 8 | 5 |

<details><summary>Every required entry</summary>

Genres: open-world, racing, delivery. 13/21 proven · 5 cut · 8 missing.

| Entry | Status | What the player does | Detail |
| --- | --- | --- | --- |
| `onboarding.first-goal` | proven | A new game shows a first goal, and the first player action toward it advances it. | proofs/sim/first-goal.proof.ts |
| `onboarding.find-features` | missing | A player following the game's own guidance reaches the first use of every core feature. |  |
| `failure.lose-and-recover` | proven | The player can fail (die, lose the run, go broke) and the game puts them back into play at a stated cost. | proofs/sim/shift-over.proof.ts |
| `save.continue` | missing | Progress made by playing survives saving and continuing. |  |
| `settings.controls` | missing | The player opens settings and a change (a binding, volume, sensitivity) takes effect. |  |
| `menu.start-and-credits` | missing | The main menu starts a game and shows the credits. |  |
| `progression.runway` | missing | Something new unlocks steadily across the first five hours, up to the progression cap. | no content sheet (proofs/content.ts) |
| `content.item-source` | cut | Every item can be obtained by playing. | No crafting or item economy: the only items are first-aid kits and crash jackets sold at Mercato Fresco. |
| `content.item-use` | cut | Every item does something: crafts, equips, eats, places, feeds, sells or summons. | No crafting or item economy: first aid and crash jackets are covered by the store tests. |
| `content.recipes-reachable` | cut | Every recipe and source can actually be used: its inputs, station and unlock are all obtainable. | No recipes: pizzas are menu data, not crafted items. |
| `content.placeables-place` | cut | Every item that says it can be placed can be placed. | Nothing is placed by the player. |
| `content.weapons-have-ammo` | cut | Every weapon that fires has obtainable ammo, or needs none. | High Tide Pizza has no weapons. |
| `racing.drive-handling` | missing | Accelerate, brake and steer a vehicle that handles by its physics. |  |
| `racing.lap-timing` | proven | Laps and checkpoints are timed. | proofs/sim/tide-rush.proof.ts |
| `racing.opponents` | proven | Opponents race and finish in an order. | proofs/sim/tide-rush.proof.ts |
| `racing.unlock-vehicles-tracks` | missing | Results unlock new vehicles or tracks. |  |
| `racing.crash-recover` | missing | A crash or wrong way is recoverable. |  |
| `open-world.vehicle-enter-drive` | proven | Walk to a vehicle, get in and drive. | proofs/sim/scooter.proof.ts |
| `open-world.jobs-pay` | proven | Take a job, do it, get paid. | proofs/sim/deliver-hot.proof.ts |
| `open-world.pursuit` | proven | Breaking the rules brings pursuit the player can escape. | proofs/sim/wardens.proof.ts |
| `delivery.deliver-fresh` | proven | Load an order, carry it to its customer and get paid by how fresh it arrives. | proofs/sim/deliver-hot.proof.ts |
| `delivery.route-changes` | proven | The map changes under the player (water, weather, closures) and a route that worked stops working. | proofs/sim/tide-closes-route.proof.ts |
| `delivery.vehicle-swap` | proven | Mid-run the player swaps to a vehicle that suits the changed map, keeping the orders. | proofs/sim/swap-dock.proof.ts |
| `delivery.shop-upgrade` | proven | Earnings buy upgrades that change capacity, freshness or pay. | proofs/sim/shop-upgrade.proof.ts |
| `delivery.rival-steal` | proven | Rivals can take an order the player is carrying unless the player shakes them. | proofs/sim/crust-rider.proof.ts |
| `delivery.shift-pay` | proven | A shift closes and settles against a target with a stated consequence. | proofs/sim/shift-over.proof.ts |

</details>
<!-- /suite-score -->

## Direction

- **Genre and references.** Open-world arcade delivery. *Crazy Taxi* for the timer pressure and one arrow
  one clock; *Kiki's Delivery Service* for a warm family delivery job in a harbour town; Venice's *acqua
  alta* for a city that floods and carries on; *Jet Set Radio* night palettes for the look.
- **Faithfulness.** Inspired by, with its own rules: the tide clock is the game's own mechanic.
- **Breadth.** In: the tide clock (five stages, district flood order, water physics per vehicle class),
  pizza orders (heat, soak, stacking, tips), eight personality customers, the family fleet (scooter →
  cargo trike → jet-ski → motor gondola → pizza blimp), swap docks, rival pizzeria riders, Tide Rush races
  on the four circuits, pizzeria upgrades (ovens, toppings, bags), reputation, MegaSlice's note. Out for
  now: a rewrite of the inherited crime story (kept running and re-labelled until a later milestone
  retires it), multiplayer.
- **Direction.** Warm neon canal city at night, chunky stylized vehicles on the real-scale coast; chase
  camera; keyboard, pad and touch; solo; desktop and phone.
- **Length.** A shift is six real minutes; the note takes roughly 15–20 shifts to pay off with upgrades
  bought along the way, so about two hours to see everything and save the shop; the shift loop stays
  replayable for its tips and races. Teaching is by doing: the pager says the one thing to do, the tide
  card names the stage and what it means.
- **Done.** A new rider loads Gus's margherita at dusk, splashes it to the docks on the scooter, comes back
  at high water, swaps to the jet-ski at the port dock with two boxes stacked, shakes a Carmine's Crust
  rider, and closes the shift over MegaSlice's quota.
- **Player promise.** The same city is a different map every hour of the night, and you are the one who
  reads the water fastest.
- **Pillars.** The tide changes the route (never cosmetic); hot and dry is the whole score; every customer
  is a person, not a pin.
- **Anti-pillars.** No combat in the pizza loop; no fail screen for a cold box (it just pays less); no
  grinding filler between shifts.
- **Falsifier.** If a player's best route at 23:00 is the same as at 18:30, the tide is decoration and the
  design has failed.

## Design brief

- Core loop (30 s): load at the oven window → choose a vehicle for tonight's water → ride the box to the
  beacon before it cools → hand it over → read the tip.
- Session loop (one sitting): one shift, 18:00 to 24:00 (six real minutes), through five tide stages,
  closed against MegaSlice's quota; then sleep to the next dusk, spend at the books, go again.
- Long loop (hours): tips → ovens, toppings, bags, vehicles; happy deliveries → reputation stars → new
  customers (the lighthouse, the wedding, the submarine); payments → the note → the shop saved.
- Second 0: 17:30 at Vell's with the starter scooter at the kerb and the oven window in front of you. The
  first verb is "wait for the dough / sleep till dusk" at the window, which teaches where orders come from
  in one press.
- Onboarding: the pager points at the oven window; the first call is always a short ride (Gus or the twins);
  the tide card announces each stage with what it means for your vehicle.
- Pace: a new call every 30 s at the start (15 s with all ovens); a new tide stage every ~75 s; a new
  customer every reputation star.
- Longest cycle: MegaSlice's pressure across shifts.
- Minutes to see everything: about 120.

### First 10 minutes

- 0:00 Vell's at dusk; press E at the oven window (sleep till 18:00) or wait half a minute.
- 0:30 The shop opens; Gus calls. Load the box, ride the scooter to the dock office. Teaches load → ride →
  hand over and the heat bar.
- 1:30 First tip lands with its receipt lines (heat, speed). Second call; the docks are wetting (wet feet):
  splashing soaks the box. Teaches soak.
- 2:00 Canal hour: Port Carmine is a canal, the scooter drowns there. Teaches the swap dock at the port.
- 3:30 High water: the boulevard and Vell's own street go under; balcony drops start. Two calls on the
  board, one oven: choose.
- 5:00 King tide: everything but the Heights is water. Last orders at 6:00; the shift card shows the
  quota made or missed and MegaSlice's pressure.
- 6:30 Sleep till dusk; open the books: the first oven (1,200) is in reach after two good shifts.
- 8:00 Second shift: with a second oven, stacking two boxes draws the first Carmine's Crust rider; at one
  reputation star Ida Faro calls from the lighthouse at the far end of the map.

### Start state

Cash 250, no vehicle owned but the family scooter at the kerb, oven/toppings/bag tier 1, debt 12,000,
MegaSlice pressure 20, reputation 0, clock 17:30, tide out.

### Content budget

8 customers, 8 pizzas, 5 tide stages, 3 flood districts (Heights stays dry), 3 swap docks, 4 Tide Rush
circuits, 3 upgrade tracks (4/4/3 tiers), 5 fleet vehicles plus the rival scooter, 2 landmarks
(lighthouse, submarine), 3 catering contracts.

### Systems

- Tide clock — probe: `harbor.tide` stage index rises through a shift; `tide_sheet_*` objects exist.
- Shift orders — probe: `harbor.shift` delivered and takings grow; bag empties on delivery.
- Heat and soak — probe: a bag box's heat falls and soak rises while splashing.
- Fleet water physics — probe: telemetry `water` reads ENGINE DROWNED / BEACHED; a hull's y sits above
  the street.
- Rival riders — probe: `crust_rider` entity spawns with a stacked bag; `lost` increments.
- Pizzeria — probe: `harbor.pizzeria` oven/toppings/bag tiers, debt and pressure change.

## Features

- Tide model (levels, stages, sills, water effects, drop floors) — game-local `src/game/tide/tide.ts`
- Flood sheets and water queries — game-local `src/game/tide/tideRuntime.ts` on `ctx.scene.object`
  (`place`/`move` with `visual.scale`)
- Hull and wheel water physics — `@jgengine/core/physics/drivableVehicle` (`groundHeight` hook) +
  game-local medium rules [partial: hulls use the car sim floated on the water surface, not
  `@jgengine/core/physics/boatPlaning`]
- Pizza orders, tips, stacking — game-local `src/game/pizza/orders.ts`
- Customers and menu — game-local `src/game/pizza/menu.ts`, drops as editor markers
- Pizzeria upgrades and MegaSlice's note — game-local `src/game/pizza/pizzeria.ts`
- Shift runtime, prompts, swap docks, rival riders — game-local `src/game/pizza/shift.ts`
- Session boundaries for catering contracts — `@jgengine/core/run/sessionLoop`, `@jgengine/core/mission/mission`
- Tide Rush races — game-local `src/game/race/` on editor `route` paths
- Pizza blimp flight — `@jgengine/core/world` rigid aircraft (rotorcraft rig)
- Radio tide bulletins — `@jgengine/core/audio/radio`
- Save — `@jgengine/core/save/saveDocument` + whole-world snapshot (`harbor.shift`, `harbor.pizzeria`)
- UI — Rune (`@jgengine/core/ui/rune`), game theme `src/game/ui/theme.ts`
- Clock — `defineGame({ time })` with one `DAY_SECONDS` constant in `src/game/clock.ts`

## Gaps

- Water surface feature: a rising, district-clipped flood plane with ripples and wakes belongs in
  `packages/core/src/water/` (beside `seaState`) as a "tidal sheet" adopters can raise; High Tide Pizza is
  the first adopter (the flood sheets are game-local authored discs for now). Second adopter moves it up.
- Boats on the planing model: hull vehicles should drive on `@jgengine/core/physics/boatPlaning` with
  buoyancy instead of a floated car sim; seam: the `medium === "water"` branch in
  `src/game/driving/driving.ts`.
- Delivery-order primitive: heat/soak/tip settlement could become `packages/core/src/delivery/` once a
  second game delivers perishables; seam: `src/game/pizza/orders.ts`.
- Asset provisioning in sandboxed environments: library street props 403 without the mirror.

## Milestones

- [x] 1. The tide clock and the pizza shift: flood sheets over the docks, boulevard and downtown; hulls
  float, engines drown, boxes cool and soak; eight customers; load, deliver, tip; swap docks; Crust riders;
  ovens/toppings/bags; MegaSlice's note and the midnight close; the family fleet, shop, drops, lighthouse,
  submarine and festoon lights authored; HUD tide card, order cards, shift card and the books.
- [x] 2. Re-theme pass: title, menus, catering contracts, rival pizzeria labels, Tide Rush circuit names,
  rival riders, radio tide bulletins, README and art direction.
- [x] 2b. Depth round: flooded districts and pizza pins on the chart, impatient callers, first-time
  lessons, splash spray and doorstep thanks, the delivery slip, hot streaks, cred from deliveries,
  menu and quota rebalance.
- [ ] 3. From-zero flow (`proofs/flows/from-zero.flow.ts`): new game → first delivery → first swap → shift
  close, played through real input; suite proofs under `proofs/sim/`.
- [ ] 4. Retire the crime layer: Marco's story becomes the Vell family's (MegaSlice's buyout as acts), the
  turf war becomes delivery-zone contests between the rival pizzerias, HHPD heat becomes the canal
  wardens' speeding tickets, the gun counter and fronts leave.
- [ ] 5. Blimp line and rooftop drops: a mooring mast on the Heights, rooftop customers only the blimp
  reaches at the king tide, bridges as foot routes.
- [ ] 6. Boats on the planing model and a wake/ripple flood surface (the engine gaps above).

## Handoff

- Done: milestones 1, 2 and 2b. Game tests pass (`bun run test games/harbor-heat`), check-types clean.
  verify:fast passes everything it can run here; the asset-provision step fails on the sandbox proxy (403),
  so its boot probe never starts.
- Screens: Rune UI PNGs in `proofs/high-tide/` (title, shift HUD at high water, phone HUD, books, shift
  card), rendered with the native-png example. The 3D canal screenshot (`bun run shoot harbor-heat --mode
  play --state flood`) is not captured yet: this machine has no WebGPU adapter and the shared render slot
  was held by another worktree.
- Next: capture `--state flood` and `--state king-tide` on a machine with a GPU and check the flood sheets'
  edges against the kerbs; milestone 3 (from-zero flow, proofs/sim); milestone 4 (retire the crime layer:
  starter pistol, gun counter, HHPD).
