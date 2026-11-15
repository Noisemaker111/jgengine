# Do Not Disturb

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
Game suite: **0/17 proven · 17 missing** · `jgengine suite beacon-bastion`
<!-- /suite-score -->

Humans-vs-technology tower defense. Ordinary working people defend the last analog town against
marching technology: earbuds, phones, Flock cameras, smart speakers, robot vacuums, drones, scooters,
smart fridges, graphics cards, mining rigs, self-driving cars, chatbots, routers, a server rack and,
last, THE DATA CENTER. A career works a season of three districts (Main Street, Downtown Grid, the
School Campus), each a scene in the engine's scene set; the town has twenty Attention Span. A day is
twelve waves, six authored, five composed and the finale, on one of three shifts; Overtime is the
endless night through the eras. The folder and package id stay `beacon-bastion`. Runs on engine source; start it with
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
  - Phones (every 4.5 s from 8 m, 2.5 s), smartwatches, chatbots and smart speakers ("Hey—" distracts everyone in 7 m) fire notifications. A distracted worker looks at their phone (a glowing phone floats over them) and stops working.
  - Flock cameras spot a worker every 6 s: notifications go for spotted workers first and last 1.5× longer.
  - Graphics cards, mining rigs and the data center overheat the workers near them (they work 25–40% slower).
  - Answers: Teacher (snap out), Librarian (hush), Monk (immune), and the Do Not Disturb button.
  - Distraction runs on the engine status runtime as a second, worker-side runtime (`session.workers`).
- **Damage and tech.**
  - Seven damage types (hot, water, shock, blunt, pierce, legal, analog) against five classes (gadget, hardware, wireless, network, vehicle) on the engine damage table. Legal and analog ignore armor; 40 armor halves a hit; shock is ×2.5 on Wet tech.
  - Smart fridges carry a 70-point shield that regrows; routers patch 6% of nearby tech every 3 s and boost it (+20% speed, +10 armor); wrecked self-driving cars release two scooters; drones drop a parcel on a plot that blocks hiring until clicked; mining rigs pay more the longer they live and steal cash if they get through.
  - "Installing Update…": from wave 3, part-way through each wave the healthiest tech stops for 4 s and takes +25% damage; if it finishes it gains +20 armor (an IT Guy's Factory Reset wipes it).
  - Tech gets 3% sturdier each wave (bosses excepted).
- **Bosses.**
  - Server Rack (wave 6, again on 9): restores two backup drives every 6 s unless an Electrician stands within 9 m; at half health it overclocks and raises a 150-point firewall.
  - THE DATA CENTER (wave 12): on mains power it takes 30% damage and spawns phones; Electricians within 9 m drain its power; then it takes full damage. It overloads (drones, a GPU) and browns out, and when destroyed it migrates to THE CLOUD, a flying final form that summons drones.
- **Progression.**
  - Promotions: two shared ranks per worker (Shift Lead → Head Barista, Journeyman → Master Plumber, Department Head → Vice Principal…; 75% of hire × rank, +50% damage, +15% pace, +0.5 m reach), then one of two careers with two steps each; taking one closes the other. Letting a worker go returns 70%.
  - Aim: first, last, strongest, nearest (T).
  - Town buttons: Blackout (Q, every 40 s) flips the breaker on a point of the street, 120 damage in 3.5 m and a short-circuit; Do Not Disturb (E, every 55 s) slows every gadget to 40% for 4 s, snaps every worker out of their phone and holds notifications.
  - Scrap pay: weight × `1 + 0.2 × (wave − 1)`, capped at ×3.
  - Stars per shift seat the Town Council (Labor Union, Town Budget, Town Rituals); a finished day banks half its till (cap 200) and offers three perks.
- **Difficulty.** Part-Time: 25 attention, tech ×0.8 health, 32 s breaks. Full-Time: 20, 25 s. Double Shift: 12, ×1.2 health, +5 armor, 20 s, a fourth star.
- **The season** (`src/game/season.ts`, `src/game/travel.ts`). Districts open in order: holding one opens the next; each keeps its best stars on the career. The end-of-day board's season map picks where the next day opens; travelling saves the career, switches the scene set and opens the day there.
  - Main Street (`editor.scene.json`): one winding street and a short side street.
  - Downtown Grid (`downtown.scene.json`): square blocks, thirteen plots, and from wave 6 a surge of scooters, phones and vacuums down the long north road (20% thicker each wave, not in the finale).
  - School Campus (`school.scene.json`): the school run winds round the schoolyard and a bus lane cuts in; tech is 1.3× tougher, and every 40 s of a wave the recess bell fills the yard for 8 s and ground tech within 15 m of it crawls at 45%.
- **The union hall** (`src/game/union.ts`). A career starts with four trades (Barista, Farmer, Plumber, Teacher). Each finished day pays dues: 2 a wave, 5 a star, 10 for a held street. Between days dues hire the other ten trades (10–30), train a trade (+10% damage a rank, three ranks), or build town upgrades: Landlines (distractions 25% shorter), Library Card Program (Librarians +1.5 m and +25%), Block Party (+3 attention a rank), Bike Couriers (+20 opening cash a rank).
- **In-day cash sinks** (`src/game/sinks.ts`). Gear on the worker card (one item per trade: Espresso Shot doubles a barista's pace for 20 s, Pressure Hose gives a plumber +80% and 2 m, ...); the town hall's buttons: Power Outage (one road's tech stops dead and quiet for 10 s) and Free Wi-Fi Off (routers stop boosting and patching for 25 s); spare lots, two per map, bought open mid-day for 200 and half again each. Gear and actions cost 15% more each wave.
- **Overtime** (`src/game/waves/endless.ts`). Endless: the Dial-Up Era (earbuds, watches, phones, speakers, vacuums, fridges), the Smartphone Era from wave 9 (phones, drones, scooters, cameras, routers, cars) and the AI Era from wave 17 (chatbots, graphics cards, rigs, drones, cars). Squads thicken 6% a wave; every eighth wave brings the era's boss, 5% tougher a wave past 12. A finished night goes on the career's Overtime board (five deepest) and the title's board across careers.
- **Pacing, checked headless** (`src/game/balance.test.ts`):
  - A town that hires nobody loses by wave 3.
  - Baristas alone can't reach the drones or The Cloud.
  - A mixed, promoted crew that saves for promotions and then spends on sinks holds Full-Time with about 7 of 20 attention (asserted 3–10), never banking 300 unspent. A boss that gets through costs its share still standing.
  - The same crew with its Teacher and Librarian swapped for Baristas loses: answering distraction matters.
  - The same crew loses on Double Shift.
  - Downtown: the eleven workers that hold Main Street fall to its surge; thirteen on its corners hold. School Campus: the crew on its corners holds.
  - Overtime: the crew works into the AI era (about wave 20) and falls.
  - A career from zero: districts open on a two-star hold; with dues spent between days the season is kept in about eight days with a loss on the way.
- **Failure states.** Losing all attention ends the day with "Total Distraction"; victory is twelve waves with the street clear.
- **Gap to target.** A worker "looking at the phone" animation (today a floating phone); a fourth district (the Mall with an escalator split).

Loop proofs: to-first-defense, from-zero (a headless career from nothing to day two), district-trip (browser: hold Main Street, travel to Downtown, reload and Continue there)

The roads, plots, buildings and worker base numbers are read from `src/editor.scene.json`, so moving a
road or retuning a worker is an editor edit. Run `bun run check-types` and `bun run test` here after changes.
