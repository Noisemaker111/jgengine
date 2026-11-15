# Cleanup on Aisle 9

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
Game suite: **17/17 proven** · `jgengine suite drift-foundry`
<!-- /suite-score -->

Physics racing in shopping carts through a gigantic mega-store at closing time. The PA announces
"the store is now closing", the security shutters come down behind you with a ride-on floor scrubber
pushing a full-width brush bar ahead of them, and three late shoppers race you to the self-checkout.
The package id stays `drift-foundry`. Runs on engine source; start it with
`bun --cwd=games/drift-foundry run dev` from the repository root.

The front end is customer service over the live store: **Continue run** opens the parked cart with
its mods, clock and shopping, **New run** starts the next closing on the event picked in the
**Weekly circular**, **Cart corral** unlocks and picks a chassis, **Customer service** buys the next
mod per slot, and records, settings and credits live in the same pane.

## Design checklist

Read from `src/game/{cart,run,parts,route,compactor,vehicle,race}`.

- **Core loop.** Push the cart down one of six departments to the self-checkout while the shutters
  close behind you. Steer into the shelving to grab stock (`cart/shelves.ts`: a grab spot every
  22–26 m on alternating shelf edges, a power-up every fourth). What is in the basket is the cart's
  handling (`cart/basket.ts`): heavy goods (watermelon, kettlebell, paint, a 65" TV) add top speed,
  grip and stability but cut acceleration and turn-in; a basket of light snacks is twitchy (more
  turn rate and drift, less grip) until something heavy calms it. A full basket bumps its oldest
  item out of the back.
- **Power-ups** (child seat holds two, F/Q uses the oldest): fire extinguisher (2.2 s boost),
  bag of marbles (a spill behind you that spins out rivals, swept up by the shutters), wet mop
  (swats and stuns every cart within 5 m), bouncy-ball stack (one huge hop that clears any pallet
  ramp without pogo casters) and rotisserie chicken (heals the cart, obviously).
- **Style** (`cart/style.ts`): drifts (end-cap drifts when hugging the shelf ends), air off pallet
  ramps, riding the back bar (C: +7% top speed, less grip) and mop swats score; tricks inside a 3 s
  window multiply ×1.5/×2/×3; hitting a wall breaks the chain.
- **Checkout** (`cart/checkout.ts`): the receipt rings up 25 pts per second under 1.5× par, 2 pts
  per dollar in the basket, style, and 500/250/100 for P1–P3. Best receipt per event is saved
  (`drift-foundry.receipts.v1`). A quarter of the cart's value is paid as store credit.
- **Mods** (12, four slots: push / bumper / casters / basket): the Pallet Plow bursts box walls,
  Pogo Casters clear pallet ramps, the Fixed Squeaky Wheel stops the standard cart's wobble, basket
  armor eats one shutter clip. Mod displays along each aisle snap on as you roll through.
- **Carts** (`cart/chassis.ts`): Standard (8 items, squeaky), Kid-Size Racer ($550, 4 items, darty),
  Double-Wide Flatbed ($650, 14 items, planted, slow off the line), Mobility Scooter Cart ($660,
  6 items, fast, never wobbles).
- **Departments** (`tracks/`): Aisle 9 (straight main aisle: snacks, an iced frozen section at 0.86
  grip, bulk & paint), Produce (juice flood, oranges avalanching across, grape-slick hairpins, salad
  bar shortcut), Garden Centre (outdoors in the rain, mud, koi-pond wade), Electronics (TV walls,
  returns conveyors that push with or against you), Loading Bay (tugger trains on timed crossings,
  a forklift-dropped pallet), Toy Aisle (mezzanine ramps, ball blasters, ball-pit shortcut).
- **Rivals**: Grandma June (easy, wanders shelf to shelf), the Twins (one pushes, one rides),
  Brick the bodybuilder (expert, one clean line); Officer Dale on his segway patrols Lights Out and
  Closing Time, cuts across your lane and tackles on contact (75% of your speed gone and a spin).
- **Hazards**: box walls and pallet ramps, rolling oranges and foam balls, spills, puddles, tugger
  trains, conveyors, the scrubber and the shutters (contact within 1.5 m locks you in).
- **Progression**: store credit buys mods and carts; eight events in four tiers (Weeknight, Late
  Shift, Empty Cart, Store Legend) medal on finish place, time, cart value or the margin on Brick.
- **Look**: bright fluorescent big-box interior, store-brand packaging (no real brands), original
  procedural models in `scripts/author-models.mjs`; see `src/art-direction.md`.

Aisle 9's static store (shelving runs, end-caps, section crowns, freezer fog, scrubber suds,
pigeons) is authored in `src/editor.scene.json` by `scripts/author-{corridor,yard,ambience}.ts`.
- **Onboarding**: the hanging sign names the next wall and when to hop; the shopping tip under it
  points at the mod display that wall needs, then the next shelf grab and which way to steer, then
  the power-up F fires. Grabs, power-ups and banked tricks each pop particles and a sound cue;
  rivals shout a line when you pass them or they pass you.
- **Saves**: career, records, the parked cart (with its basket) and best receipts go to
  `localStorage`, or into the engine's world save where a host has none.

Proofs: `proofs/sim/*.proof.ts` prove all 17 game-suite entries headless (`src/suite.test.ts`,
content sheet in `proofs/content.ts`); `proofs/flows/from-zero.flow.ts` drives a new shopper from
the title to a first grab in the browser. `capture.states` has `race`, `produce`, `toys`, `garden`
and `electronics` for shots of each department.
Run `bun run check-types` and `bun run test` here after changes.
