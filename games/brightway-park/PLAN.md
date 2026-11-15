# Hauntworks plan

Brief: HAUNTWORKS. You are the ghost proprietor of a derelict seaside amusement park. The living keep coming to visit; your goal is reversed from a normal tycoon: scare the living out and turn the park into a paradise for ghosts.

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
## Suite score

What players must be able to do, proven by headless simulation in `bun test` (`jgengine suite brightway-park`). This is the headline; the engine coverage table below only hints where the engine has a part.

| Area | Proven | Failing | Not simulatable | Missing | Cut |
| --- | --- | --- | --- | --- | --- |
| onboarding | 2/2 | 0 | 0 | 0 | 0 |
| failure | 1/1 | 0 | 0 | 0 | 0 |
| save | 1/1 | 0 | 0 | 0 | 0 |
| settings | 1/1 | 0 | 0 | 0 | 0 |
| menu | 1/1 | 0 | 0 | 0 | 0 |
| progression | 1/1 | 0 | 0 | 0 | 0 |
| content | 5/5 | 0 | 0 | 0 | 0 |
| tycoon | 6/6 | 0 | 0 | 0 | 0 |
| **total** | **18/18** | 0 | 0 | 0 | 0 |

<details><summary>Every required entry</summary>

Genres: tycoon. 18/18 proven.

| Entry | Status | What the player does | Detail |
| --- | --- | --- | --- |
| `onboarding.first-goal` | proven | A new game shows a first goal, and the first player action toward it advances it. | proofs/sim/first-goal.proof.ts |
| `onboarding.find-features` | proven | A player following the game's own guidance reaches the first use of every core feature. | proofs/sim/find-features.proof.ts |
| `failure.lose-and-recover` | proven | The player can fail (die, lose the run, go broke) and the game puts them back into play at a stated cost. | proofs/sim/bankrupt-replay.proof.ts |
| `save.continue` | proven | Progress made by playing survives saving and continuing. | proofs/sim/save-continue.proof.ts |
| `settings.controls` | proven | The player opens settings and a change (a binding, volume, sensitivity) takes effect. | proofs/sim/rebind-pause.proof.ts |
| `menu.start-and-credits` | proven | The main menu starts a game and shows the credits. | proofs/sim/menu-credits.proof.ts |
| `progression.runway` | proven | Something new unlocks steadily across the first five hours, up to the progression cap. | content check |
| `content.item-source` | proven | Every item can be obtained by playing. | content check |
| `content.item-use` | proven | Every item does something: crafts, equips, eats, places, feeds, sells or summons. | content check |
| `content.recipes-reachable` | proven | Every recipe and source can actually be used: its inputs, station and unlock are all obtainable. | content check |
| `content.placeables-place` | proven | Every item that says it can be placed can be placed. | content check |
| `content.weapons-have-ammo` | proven | Every weapon that fires has obtainable ammo, or needs none. | content check |
| `tycoon.build-attraction` | proven | Build something customers pay for. | proofs/sim/build-attraction.proof.ts |
| `tycoon.customers-pay` | proven | Customers arrive, use attractions and pay. | proofs/sim/customers-pay.proof.ts |
| `tycoon.staff-upkeep` | proven | Staff and upkeep cost money over time. | proofs/sim/staff-upkeep.proof.ts |
| `tycoon.breakdowns` | proven | Things break down and need fixing. | proofs/sim/breakdown-fix.proof.ts |
| `tycoon.unlock-research` | proven | Research or milestones unlock new things to build. | proofs/sim/research-unlock.proof.ts |
| `tycoon.bankrupt` | proven | Running out of money has consequences. | proofs/sim/bankrupt-replay.proof.ts |

</details>
<!-- /suite-score -->

## Direction

- Genre and references: a reversed park tycoon. The machinery of a park builder (paths, rides, stalls,
  staff, wear, a lab, monthly books, scenarios) turned inside out: the goal is to scare the living out,
  not keep them happy. Touchstones: *Ghost Master* (haunting the living as the objective), *Luigi's
  Mansion* (readable stylized ghosts with personalities), *Theme Hospital* (dry humour over a
  management sim). Not a remake of anything: own loop, own numbers, own rides.
- Breadth: two populations (the living, with nerve, curiosity and groups; ghost residents, each with
  wants), two currencies (ectoplasm and rumor), haunted rides rated Fright / Thrill / Dread, scare
  props that chain, gloom that adds dread, ghost hunters and TV crews whose footage brings an exorcist,
  a season of nights ending in the Full Moon Festival. Out: a piece-by-piece haunted-house editor,
  pathfinding along every path, multiplayer, hunters and the exorcist as walking bodies (notices and
  numbers; the exorcist does walk).
- Look and camera: a moonlit derelict pier in teal and violet, glowing lanterns and translucent ghosts,
  readable stylized silhouettes; an RTS camera over a grid, mouse and keyboard first, touch through the
  build palette. Day and night matter: the living come at dusk and leave at dawn.
- Length: 4 to 9 hours at 1x to win the three scenarios, then free play. A sitting is one moon (20
  minutes at 1x).
- Onboarding: hint cards in the first scenario that ring the control and point at the spot.
- Done: from an empty lot, build a ride and a gauntlet of scares, drive the living out screaming, move
  the first ghost in, and win The First Chill (60 screaming exits, 300 rumor and a ghost by the end of
  the third moon).
- Player promise: the player lays out a haunt where every scare is a choice about pacing - chain them
  for ectoplasm, but break a group's nerve too early and they never reach the best rides - and watches
  the dead move in because of what they built.
- Pillars: scares are a path you compose, not a number you buy; every ghost tells you what it wants;
  the living's nerve is the resource, and spending it badly costs you.
- Anti-pillars: no cheap prop farm at the gate that wins on its own; no ghosts that arrive regardless;
  no threat that comes from nowhere (hunters are visible and can be scared off or watched).
- Falsifier: a player who rings the gate with props and builds no rides should see the living flee at
  the first corner with little ectoplasm and no ghosts, not a scenario won.

## Design brief

- Core loop: place one thing (a ride, a prop in a chain, a piece of gloom, a spook, a toll), watch the
  living's nerve fall along the path and their screams, then retune: spread the scares out, turn a ride
  up or down, give a ghost the thing it is missing.
- Session loop: one moon (eight 150-second nights, 20 minutes at 1x): run the séance table, move a
  ghost or two in, keep the hunters' evidence under 100, and close the moon's ledger with ectoplasm to
  spare.
- Long loop: three scenarios with deadlines (3, 8 and 16 moons), each won unlocking the next, ending in
  the Full Moon Festival (all six ghosts at home); the séance table opens 34 rides, props, stalls and
  gloom pieces in family chains over about a season, and each ghost whispers one for free; six rumor
  awards pay for bigger rides; the Ferryman's debt, upkeep and rumor-mongering decide how fast it grows.
- Second 0: an empty lot inside the iron fence, a chained gate behind a two-cell plaza, 10,000
  ectoplasm and 10,000 owed to the Ferryman, five starter rides, five starter scare props, four stalls
  and plain gloom on the palette, no living. The vault buys about one ride, a few props and a spook, so
  the first verb is choosing what to build, and the chained gate means nobody comes until there is
  something to be scared by.
- Onboarding: hint cards in the first scenario say the next step, ring the control that does it and put
  an arrow over the spot on the lot: path, ride, connect, gate, a scare, the séance table, a ghost, a
  gremlin.
- Pace: something new every 3 minutes in the first hour (the first séances take one to two and a half
  minutes, and the Victorian Child can move in inside two); later séances take 4 to 20 minutes and the
  ghosts, the hunters and the scenarios carry the gaps.
- Longest cycle: 20 minutes, one moon at 1x, closed by the moon's ledger.
- Minutes to see everything: 540

### First 10 minutes

- 0:00 an empty lot at late afternoon and a chained gate; the hint card teaches laying a cobbled path in from the gate
- 0:15 the path is down; the hint teaches placing the Upside-Down Carousel and Connect it for its entrance and exit
- 0:30 the carousel runs; the hint teaches unchaining the gate, and dusk falls: the first of the living wander in
- 0:45 the hint teaches scares: a Jack-in-the-Coffin beside the path jolts the first group and starts a chain
- 1:00 the hint teaches the séance table: start the Grave-Dirt Sundaes, a one-minute topic
- 1:30 the hint teaches the Ghost register: the Victorian Child wants the carousel and the coffin, both already standing; she moves in and whispers the Séance Teacups
- 2:00 the first visitor runs out of nerve and flees screaming; the rumor climbs and a skeptic shrugs off a cheap trick
- 2:30 the hint teaches binding a Gremlin Tinker before the first jam; the Sundaes land, the first channelled unlock
- 4:30 the Bumper Coffins come through the séance table; a second ride teaches spending against the vault and spacing scares into a gauntlet
- 7:00 dawn: the living go home, the night's screams and harvest show on the banner; the Drowned Sailor needs fog and the pier
- 9:00 litter teaches the Ghoul Groundskeeper; the rumor reaches 150 and the first ghost hunter comes through the gate filming

### Start state

| Probe | At most |
| --- | --- |
| guests | 0 |
| rides | 0 |
| structures | 2 |
| cash | 10000 |
| taught | 0 |
| unlocks | 0 |
| ridesSeen | 5 |
| shopsSeen | 4 |
| propsSeen | 5 |
| scenerySeen | 12 |
| staffSeen | 4 |
| awardsSeen | 0 |
| scenariosSeen | 1 |
| ghosts | 0 |
| screams | 0 |

### Content budget

| Kind | Count |
| --- | --- |
| rides | 28 |
| shops | 10 |
| props | 8 |
| scenery | 16 |
| staff | 4 |
| ghosts | 6 |
| awards | 6 |
| scenarios | 3 |

### Systems

| System | Probe |
| --- | --- |
| building | structures |
| research | researched |
| staff | staffHired |
| the living | visitors |
| scares | screams |
| ghost residents | ghosts |
| hunters and the exorcist | evidence |
| ride wear | breakdowns |
| the Ferryman's debt | loanOwed |

## Features

- empty lot start — chained gate, starting ectoplasm and a debt, no living until the gate opens
- dusk-to-dawn nights — `src/game/catalog.ts` (`clockLabel`, `OPEN_FRACTION`/`CLOSE_FRACTION`) on the engine clock; the day closes at noon
- the living in groups — `src/game/entities/guests/catalog.ts` (six kinds: nerve, curiosity, group size, skeptics, filming crews) on `@jgengine/core/agents/agent`
- nerve and ectoplasm — rides' scare yield and props' fright spend nerve; the world's `pay_*` and `scream` ripples (`park.ts`)
- scare chains — `src/game/scares.ts` [game-local; see Gaps]
- haunted rides rated Fright / Thrill / Dread — `@jgengine/core/sim/rides` (excitement / intensity / nausea read in the haunt's words)
- gloom — atmosphere pieces lift nearby rides' dread (`rethemeRides` in `park.ts`)
- ghost residents — `src/game/ghostCatalog.ts` (data) and `src/game/ghosts.ts` (runtime) [game-local; see Gaps]
- ghost hunters, TV crews and the exorcist — `src/game/threats.ts` [partial: no walking exorcist]
- ride wear and jams — a Gremlin Tinker un-jams them (`@jgengine/core/worldModel` crew queue)
- spooks with patrol areas — groundskeeper, tinker, barker, gargoyle (`src/game/staff.ts`)
- séance table — `@jgengine/core/worldModel` actions in the `lab` queue
- the moon's ledger — the Ferryman's interest, a dry vault fades the haunt
- scenarios — `@jgengine/core/mission/mission`, ending in the Full Moon Festival
- onboarding — `@jgengine/core/onboarding`, hints that point at things

## Gaps

- Scare chains (`src/game/scares.ts`): proximity jolts with a cooldown and a per-visitor chain
  multiplier are one-adopter today; the seam is a `packages/core/src/sim/` "area effect on agents with a
  cooldown and a combo" part. The second adopter (a tower-defence aura, a trap) moves it upstream.
- Ghost residents (`src/game/ghosts.ts`): "an NPC who settles when a set of placed-structure wants holds
  for N seconds, and leaves when it lapses" is a general settler/tenant model (`packages/core/src/
  worldModel/` wants over kind counts). One adopter so far.
- Day-night: the sky follows the haunt's clock through `sky({ timeOfDay, dayOffset: 0.5, nightLight })`.
  The engine's `nightLight` keeps the small hours at a share of the mood's light, so a game whose
  authored look is already a night does not drop into the engine's own dark.
- Browser drive on this Rune build: a control inside a scrolling window reads as covered, so flows run
  its command; panes fade over each other, so `ui-tour` waits for `point(label)` before each click;
  under SwiftShader a captured frame's HUD can lag the live UI tree by a step (the page text is current).
- Engine: jumping the clock backwards left a stale screen-aligned rectangle in the next frames (seen in
  captures); staging now only moves the clock forward.
- `packages/core/src/onboarding/`: steps are checked only on a game-time tick, so a game built with the
  clock paused checks them itself (`parkHintsWhilePaused` in `src/game/onboarding.ts`). The engine should
  check steps on world changes while paused.

## Milestones

1. [x] Design brief.
2. [x] Empty lot start, chained gate, arrival ramp; the open-park proof plays from the empty lot.
3. [x] The moon's ledger, the Ferryman's interest and a fading haunt, rumor campaigns.
4. [x] Jams need a gremlin; reliability shown; the séance table paced to moons; barrels cut litter.
5. [x] Moons and seasons, long scenarios with an unlock chain, 8x speed.
6. [x] Onboarding hints that point at the gate, the ride, the gate button and the spooks.
7. [x] HAUNTWORKS: the living with nerve and groups, dusk-to-dawn nights, ectoplasm from scares, scare props with chains, gloom, six ghost residents with wants, hunters and the exorcist, a moonlit look, the Full Moon Festival.
8. [x] A curve: a mid-skill bot wins The First Chill at 70% of its deadline, Talk of the Coast at 71% and the Full Moon Festival at 77%.
9. [x] Full-moon nights (more of the living, richer scares), the exorcist walks in at noon to the ghost it banishes, ghost halos, a darker graded night, the Full Moon Festival ending.
12. [x] The sky follows the clock (engine `nightLight`), and the four browser flows pass under SwiftShader: `park.dev.dusk` jumps the clock to the gates' hour and `park.dev.advance` runs the park's own ticks (hints included) forward, through the flows' `fastForward` helper.
11. [x] Late-game spending: empowered residents, bonds, the manor and the crypt, rituals, legendary attractions by moon, the Skeptic Society's festival siege; the bot ends the festival with ectoplasm still tight.
10. [x] Suite 18/18: the save written through the host's save backend when there is no browser storage, the shared start / menu.pane / settings.rebind verbs, and proofs for Continue, the credits, rebinding and following the hints.
