# Do Not Disturb

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
Game suite: **0/17 proven · 17 missing** · `jgengine suite beacon-bastion`
<!-- /suite-score -->

Humans-vs-technology tower defense. Ordinary working people defend the last analog town against
marching technology: earbuds, phones, Flock cameras, smart speakers, robot vacuums, drones, scooters,
smart fridges, graphics cards, mining rigs, self-driving cars, chatbots, routers, a server rack and,
last, THE DATA CENTER. Eleven sidewalk plots line Main Street and a short side street; the town has
twenty Attention Span. A day is twelve waves, six authored, five composed and the finale, on one of
three shifts. The folder and package id stay `beacon-bastion`. Runs on engine source; start it with
`bun --cwd=games/beacon-bastion run dev` from the repository root. Plan: `PLAN.md`; look: `src/art-direction.md`.

## Design checklist

Read from `src/game/{waves,entities,combat,build,world}` and `src/game/campaign.ts`. Every number below
is what the build does now.

- **Core loop.**
  - $150 hires workers onto plots from a hiring board of fourteen (keys 1–0 for the first ten):
    - Barista ($50): hot coffee, splash, ×1.4 vs gadgets, ground only.
    - Plumber ($65): water, slows, leaves tech Wet for 4 s.
    - Farmer ($60): pitchfork, pierce, hits flyers at ×1.5.
    - Grandma ($70): analog, 7% chance a hit just turns the tech off (bosses lose 3% instead).
    - Electrician ($100): shock, ×2.5 on Wet tech; the only trade that cuts a data center's power.
    - Teacher ($90): confiscates a gadget in reach every 8 s (paid as a kill) and snaps nearby workers out of their phones.
    - Librarian ($80): SHHH aura — no notification goes out from or lands inside her reach.
    - Construction Worker ($95, clocks in in 3 s): jackhammer splash, crushes armor, ground only.
    - Firefighter ($85): hose, ×2.2 vs overheating tech (graphics cards, rigs, the data center).
    - Janitor ($75): unplugs everything in reach every second, slows it.
    - Mail Carrier ($80): junk mail at anything, and $20 every time a wave arrives.
    - Monk ($90): offline aura — workers near him cannot be distracted. He does not fight.
    - IT Guy ($120): reboots the furthest tech in reach back to the start of its road every 14 s.
    - Lawyer ($130): legal damage that ignores armor; a Cease & Desist freezes the strongest tech for 2.5 s every 10 s.
  - Every worker has voice lines (on hire, on the job, when distracted, on promotion), shown as floating text.
  - The town, its plots, workers, till and attention are one engine world spec (`src/game/keep.ts`), shared in co-op.
  - Once a wave has fully arrived, a clock runs (25 s on Full-Time); calling early pays $1.2 per second skipped, capped at 40. The clock holds while a boss rolls.
  - Held-wave pay: wages of 10 + 2 × wave, 10% interest on the till capped at 20, 10 more for a wave with no leak.
  - Coffee break: with the street clear, R wins back one attention for $20, up to the day's starting attention.
- **Distraction — technology fights back without shooting.**
  - Phones (every 6 s, 2.2 s), smartwatches, chatbots and smart speakers ("Hey—" distracts everyone in 6 m) fire notifications. A distracted worker looks at their phone (a glowing phone floats over them) and stops working.
  - Flock cameras spot a worker every 6 s: notifications go for spotted workers first and last 1.5× longer.
  - Graphics cards, mining rigs and the data center overheat the workers near them (they work 25–40% slower).
  - Answers: Teacher (snap out), Librarian (hush), Monk (immune), and the Do Not Disturb button.
  - Distraction runs on the engine status runtime as a second, worker-side runtime (`session.workers`).
- **Damage and tech.**
  - Seven damage types (hot, water, shock, blunt, pierce, legal, analog) against five classes (gadget, hardware, wireless, network, vehicle) on the engine damage table. Legal and analog ignore armor; 40 armor halves a hit; shock is ×2.5 on Wet tech.
  - Smart fridges carry a 70-point shield that regrows; routers patch 6% of nearby tech every 3 s and boost it (+20% speed, +10 armor); wrecked self-driving cars release two scooters; drones drop a parcel on a plot that blocks hiring until clicked; mining rigs pay more the longer they live and steal cash if they get through.
  - "Installing Update…": from wave 3, part-way through each wave the healthiest tech stops for 4 s and takes +25% damage; if it finishes it gains +20 armor (an IT Guy's Factory Reset wipes it).
  - Tech gets 4% sturdier each wave (bosses excepted).
- **Bosses.**
  - Server Rack (wave 6, again on 9): restores two backup drives every 6 s unless an Electrician stands within 9 m; at half health it overclocks and raises a 150-point firewall.
  - THE DATA CENTER (wave 12): on mains power it takes 30% damage and spawns phones; Electricians within 9 m drain its power; then it takes full damage. It overloads (drones, a GPU) and browns out, and when destroyed it migrates to THE CLOUD, a flying final form that summons drones.
- **Progression.**
  - Promotions: two shared ranks per worker (Shift Lead → Head Barista, Journeyman → Master Plumber, Department Head → Vice Principal…; 75% of hire × rank, +50% damage, +15% pace, +0.5 m reach), then one of two careers with two steps each; taking one closes the other. Letting a worker go returns 70%.
  - Aim: first, last, strongest, nearest (T).
  - Town buttons: Blackout (Q, every 40 s) flips the breaker on a point of the street, 120 damage in 3.5 m and a short-circuit; Do Not Disturb (E, every 55 s) slows every gadget to 40% for 4 s, snaps every worker out of their phone and holds notifications.
  - Scrap pay: weight × `1 + 0.2 × (wave − 1)`, capped at ×3.
  - Stars per shift seat the Town Council (Labor Union, Town Budget, Town Rituals); a finished day banks half its till (cap 200) and offers three perks.
- **Difficulty.** Part-Time: 25 attention, tech ×0.8 health, 32 s breaks. Full-Time: 20, 25 s. Overtime: 12, ×1.2 health, +5 armor, 20 s, a fourth star.
- **Pacing, checked headless** (`src/game/balance.test.ts`):
  - A town that hires nobody loses by wave 3.
  - Baristas alone can't reach the drones or The Cloud.
  - A mixed, promoted crew holds Full-Time with about 11 of 20 attention and never banks more than 300 unspent.
  - The same crew loses on Overtime.
- **Failure states.** Losing all attention ends the day with "Total Distraction"; victory is twelve waves with the street clear.
- **Gap to target.** A worker "looking at the phone" animation (today a floating phone); world-anchored speech bubbles (an engine gap); a second map.

Loop proof: to-first-defense

The roads, plots, buildings and worker base numbers are read from `src/editor.scene.json`, so moving a
road or retuning a worker is an editor edit. Run `bun run check-types` and `bun run test` here after changes.
