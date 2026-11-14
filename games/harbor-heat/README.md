# High Tide Pizza

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
Game suite: **13/21 proven · 5 cut · 8 missing** · `jgengine suite harbor-heat`
<!-- /suite-score -->

You are the newest delivery rider at Vell's, a family pizzeria in Mainsail, a canal city that floods
every single night. Each shift runs dusk to midnight while the tide climbs: the docks drown first, then
the beach boulevard, then downtown. Scooter routes close, boat routes open, deliveries move up to
balconies and rooftops, and at the king tide only boats, bridges and the pizza blimp still work. Keep the
boxes hot and dry, stack orders when you dare, shake the rival riders, and earn enough in tips to save
the shop from MegaSlice, the chain that bought the family's note.

The folder and package id stay `harbor-heat` (the game grew out of Harbor Heat's coastal city). Run
`bun run dev`, `bun run check-types` and `bun run test` from this directory. `bun run vite build`
produces the standalone build. Provision the licensed asset sources declared in `src/game/assets.ts`
with the published assets CLI before launching a fresh checkout; the original models are bundled from
`src/art/`. The design plan is [PLAN.md](PLAN.md); the look is [src/art-direction.md](src/art-direction.md).

## Playing a shift

- **Second 0.** 17:30 at Vell's on the boardwalk, the red Vespetta scooter at the kerb. Press **E** at
  the oven window to sleep till the doors open, or wait: at 18:00 Vell's opens and the first order rings.
- **Take orders** at the oven window (**E**). Each call loads its boxes into the bag, up to the ovens'
  capacity (one box with Nonna's old oven, four with the conveyor line). Take another call before you
  leave to stack the run.
- **Deliver** at the glowing box beacon over the customer's door, balcony or rooftop: stop and press
  **E**. The pager points at the box that is cooling fastest.
- **Heat and soak.** Every box cools on the road (faster up in the blimp) and soaks when you splash
  through ankle water, wade, or spray off a fast jet-ski. The customer always pays the menu price; the tip
  scales with heat, dryness and speed against their par time, plus a balcony or rooftop bonus and a stack
  bonus. Below a customer's cold limit there is no tip at all.
- **The tide clock** (top-left card) shows the stage: low tide, wet feet, canal hour, high water, king
  tide. On a flooded street a scooter or trike drowns (ENGINE DROWNED), a jet-ski or gondola floats, and
  a hull on dry stone runs aground (BEACHED). The bay past the beach is always water.
- **Swap docks** (pink chevrons at the boardwalk, the port and downtown): pull in on either vehicle and
  press **E** to jump between the family scooter and the family jet-ski mid-run, boxes and all.
- **Rival riders.** With two or more boxes in the bag, a Carmine's Crust rider comes out of a side street
  and shadows you; stay within reach and they snatch the hottest box. Lose them past 70 m or let a canal
  drown their scooter.
- **Patience and streaks.** A call left 150 s on the board walks to Carmine's Crust (the pager counts it
  down). Great drops in a row build a hot streak: +6% on the tips per drop, up to five, until a bad box.
  Every happy box also pays 15 cred (a plain one 4); the jet-ski needs cred 2, the gondola 3, the blimp 4.
- **Tonight's special.** Each shift draws a special from the menu; every box of it pays a quarter of its
  price again. The tide card names it.
- **Lessons.** The first drowned engine, beached hull, stacked bag, cold box and upstairs drop each explain
  themselves once. The chart tints each flooded district and pins the oven, the swap docks and every door
  in the bag; after a hand-over the tide card shows the paid slip line by line.
- **Midnight.** Last orders: boxes still out go cold, the night's takings meet MegaSlice's quota, and
  you sleep till the next dusk.
- **The books** (**E** at the oven window when no call waits): buy ovens (capacity and faster calls),
  toppings (bigger tips) and thermal bags (slower cooling), and pay down the note.

Controls: **WASD** ride or walk, **Shift** sprint, **E** interact, **F** leave a vehicle, **T** phone,
**R** radio, **P** pause. In the blimp the arrow keys are the collective, **Z/C** yaw.

## Design checklist

Read from `src/game/tide/` (the tide model and its runtime), `src/game/pizza/` (menu, customers, orders,
the pizzeria and the shift), `src/game/entities/vehicles/catalog.ts` (the fleet) and `src/game/city.ts`.
Numbers are what the build does now.

- **Core loop (30 s).** Load at the oven window, ride the box to the beacon before it cools, hand it over,
  read the tip. Every run asks two questions: which vehicle for tonight's water, and how many boxes to risk.
- **Session loop (one sitting).** One shift is six real minutes (the day is `DAY_SECONDS` = 1440 s, so
  18:00 to 24:00 is 360 s). The tide rises through five stages, so the same order is a scooter run at
  18:30 and a jet-ski or blimp run at 23:00. The shift closes against MegaSlice's quota.
- **Long loop (hours).** Tips buy the kitchen: ovens 1,200 / 3,000 / 6,500 (capacity 1→4, calls every
  30→15 s, boxes leave at 92→100°), toppings 900 / 2,400 / 5,200 (tips ×1.25 / 1.5 / 1.8), bags 700 /
  2,000 (cooling ×0.72 / 0.5). Reputation stars (0–5 at 4, 10, 18, 30, 45 happy deliveries) unlock
  customers: Theo the DJ and Ida at the lighthouse at 1, the bridge club and the rooftop wedding at 2,
  Captain Brine's submarine at 3. Vehicles from the lot: scooter 600, cargo trike 1,500, jet-ski 3,200,
  motor gondola 5,000, pizza blimp 12,000. The note starts at 12,000.
- **MegaSlice.** Pressure starts at 20%. A shift that meets the quota (150 + 80 a shift worked, up to
  1,400) takes 12 off; a short one adds 18. At 100% MegaSlice calls the note in: +1,500 debt and the
  pressure resets to 55. Every 250 paid off eases it by 1. Paying the note off saves the shop for good.
- **Customers with personality.** Gus at the dock office (first to flood), the Okafor twins' night-market
  stall (two at once), Lou's houseboat at Harbor View, DJ Theo at the Neon Tide studio, Signora Ro's bridge
  club in Palm Heights (cold limit 55), Priya & Dom's rooftop wedding (three pies, from 21:00, tip ×2),
  Captain Mireille Brine's submarine in the bay (water only), and Ida Faro at the Gull Point lighthouse,
  the farthest drop on the map, who calls first whenever she is free.
- **Rivals.** Carmine's Crust and Riptide Slice are the rival pizzerias; their riders race the Tide Rush
  circuits (Ocean Loop, Dockside Dash, Heights Hairpins, Coastline Run) and Crust riders hunt stacked bags.
- **Failure states.** A box below the cold limit pays no tip; a snatched or soggy box costs the run; a
  missed quota moves MegaSlice closer to the note; a drowned engine strands the rider until a swap dock
  or a walk.
- **References it is chasing.** *Crazy Taxi* (one arrow, one clock, always a run on), *Kiki's Delivery
  Service* (a family delivery job in a harbour town), Venice's *acqua alta* (a city that floods and
  carries on).
- **Still from Harbor Heat (to re-theme next).** The city's older crime layer still runs underneath: the
  story jobs from Marco, the turf war (now labelled as the rival pizzerias), HHPD heat and pursuit, the
  gun counter, fronts, taxi fares, flower runs, the radio and the catering contracts (the old courier
  runs, re-skinned as catering with a Crust rider who grabs the order). PLAN.md tracks retiring or
  re-theming each.

Shift proof: `src/game/pizza/shift.test.ts` (open at dusk, take and deliver an order, flood the docks,
lose a box to a Crust rider, swap to a floating jet-ski, close at midnight and sleep, buy an oven and pay
the note). Tide proof: `src/game/tide/tide.test.ts`. Orders and pizzeria: `src/game/pizza/orders.test.ts`.

Headless PNGs of every screen: `DEV=1 bun games/harbor-heat/proofs/runeUiFixture.tsx <state> <out.json> [w h]`
(states include `shift`, `books` and `shift-over`), then the native-png example. Capture states `flood`
and `king-tide` stage high water at the port swap dock on the jet-ski with two boxes in the bag.

The family fleet, the shop, the drops, the lighthouse, the submarine, the festoon lights, the swap docks,
the sign and the flood sheet are original repository art from `scripts/author-tide.mjs`; the palms, bus,
light bar and city pieces from `scripts/author-harbor.mjs`. See [art credits](src/art/README.md) and the
repository's [content provenance](../CONTENT-PROVENANCE.md). Existing Quaternius and ambientCG credits
and licenses remain in force.
