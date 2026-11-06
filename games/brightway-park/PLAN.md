# brightway-park plan

Brief: a seaside theme-park tycoon with the loop of RollerCoaster Tycoon: start on an empty lot, build a park guests want to visit, and keep it running for hours.

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
## Suite score

What players must be able to do, proven by headless simulation in `bun test` (`jgengine suite brightway-park`). This is the headline; the engine coverage table below only hints where the engine has a part.

| Area | Proven | Failing | Not simulatable | Missing | Cut |
| --- | --- | --- | --- | --- | --- |
| onboarding | 1/2 | 0 | 0 | 1 | 0 |
| failure | 1/1 | 0 | 0 | 0 | 0 |
| save | 0/1 | 0 | 0 | 1 | 0 |
| settings | 0/1 | 0 | 0 | 1 | 0 |
| menu | 0/1 | 0 | 1 | 0 | 0 |
| progression | 1/1 | 0 | 0 | 0 | 0 |
| content | 5/5 | 0 | 0 | 0 | 0 |
| tycoon | 6/6 | 0 | 0 | 0 | 0 |
| **total** | **14/18** | 0 | 1 | 3 | 0 |

<details><summary>Every required entry</summary>

Genres: tycoon. 14/18 proven · 1 not simulatable · 3 missing.

| Entry | Status | What the player does | Detail |
| --- | --- | --- | --- |
| `onboarding.first-goal` | proven | A new game shows a first goal, and the first player action toward it advances it. | proofs/sim/first-goal.proof.ts |
| `onboarding.find-features` | missing | A player following the game's own guidance reaches the first use of every core feature. |  |
| `failure.lose-and-recover` | proven | The player can fail (die, lose the run, go broke) and the game puts them back into play at a stated cost. | proofs/sim/bankrupt-replay.proof.ts |
| `save.continue` | missing | Progress made by playing survives saving and continuing. |  |
| `settings.controls` | missing | The player opens settings and a change (a binding, volume, sensitivity) takes effect. |  |
| `menu.start-and-credits` | not simulatable | The main menu starts a game and shows the credits. | src/game/ui/menu/ParkMenu.tsx: the Credits pane is picked inside the engine GameMenu's own React state (@jgengine/core/menu); no command opens it, so a headless run cannot reach it |
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

- Genre and references: a park tycoon after RollerCoaster Tycoon 2 (guests with opinions, scenarios with deadlines), Parkitect (upkeep and restocking that bite) and Planet Coaster (awards worth pausing for). Inspired by, not a 1:1 remake: own numbers, own rides.
- Breadth: building (paths, rides, shops, scenery, land), guests with needs and thoughts, ride wear and repairs, four staff roles, a research lab, monthly books with a loan and marketing, rating awards, three chained scenarios. Out: a piece-by-piece coaster editor, guest pathfinding along every path, multiplayer.
- Look and camera: stylized low-poly seaside lot, an RTS camera over a grid, mouse and keyboard first, touch through the build palette.
- Length: 4 to 9 hours at 1x to win the three scenarios, then free play. A sitting is one park month (20 minutes at 1x).
- Onboarding: hint cards in the first scenario that ring the control and point at the spot.
- Done: from an empty lot, open a park, keep its rides running through breakdowns, and win Brightway Beginnings (120 guests and 400 stars by the end of May).
- Player promise: the player repeatedly spends scarce money on what the crowd is asking for, so they feel the park grow because of their choices.
- Pillars: every problem comes from something the player built; every fix is something they buy or change; the crowd says what it wants.
- Anti-pillars: no park that runs itself, no starting half-built, no money that never binds.
- Falsifier: a player who builds one ride and waits should see the rating stall, rides break and guests complain, not a scenario won.

## Design brief

- Core loop: build or adjust one thing (a path, a ride and its entrance, a shop, a hire, a price), watch the guests react in their thoughts, mood and spending, then fix what they complain about.
- Session loop: one park month (eight 150-second days, 20 minutes at 1x): run the lab, grow the crowd and the rating, and close the month in the black when the books are filed.
- Long loop: three scenarios with deadlines (3, 8 and 16 months), each won unlocking the next; the lab opens 34 rides, shops and theme pieces in family chains over about thirteen months; six rating awards pay for bigger rides; the loan, wages and marketing decide how fast the park can grow.
- Second 0: an empty lot inside the fence, a shut gate behind a two-cell plaza, $10,000 in the till and $10,000 owed to the bank, four starter rides, four shops and plain scenery on the palette, no guests. The money buys about one ride, two shops and a hire, so the first verb is choosing what to build, and the shut gate means nobody comes until the player has built something worth visiting.
- Onboarding: hint cards in the first scenario say the next step, ring the control that does it and put an arrow over the spot on the lot: path, ride, connect, gate, lab, mechanic.
- Pace: something new every 4 minutes in the first hour (the first four lab topics take one to two and a half minutes); later topics take 4 to 20 minutes and the awards and scenarios carry the gaps.
- Longest cycle: 20 minutes, one park month at 1x, closed by the monthly books.
- Minutes to see everything: 540

### First 10 minutes

- 0:00 an empty lot and a shut gate; the hint card teaches laying a path in from the gate
- 0:15 the path is down; the hint teaches placing the carousel and Connect it for its entrance and exit
- 0:30 the carousel runs; the hint teaches opening the gate, and the first guests start walking in
- 0:45 the hint teaches the lab: start the Ice Cream Cart, a one-minute topic
- 1:00 the hint teaches hiring a mechanic before the first breakdown
- 1:30 the Ice Cream Cart research lands, the first unlock; hungry guests teach building food and drink beside the path
- 2:30 the Topiary unlocks; scenery near a ride teaches charm and appeal
- 4:30 the Spinning Teacups unlock; a second ride teaches spending against the till
- 7:00 the Dodgems unlock; worn rides break down and teach the mechanic's worth
- 9:00 litter on the paths teaches hiring a handyman; the Books teach where the money went before the month closes at 20:00

### Start state

| Probe | At most |
| --- | --- |
| guests | 0 |
| rides | 0 |
| structures | 2 |
| cash | 10000 |
| taught | 0 |
| unlocks | 0 |
| ridesSeen | 4 |
| shopsSeen | 4 |
| scenerySeen | 10 |
| staffSeen | 4 |
| awardsSeen | 0 |
| scenariosSeen | 1 |

### Content budget

| Kind | Count |
| --- | --- |
| rides | 28 |
| shops | 10 |
| scenery | 14 |
| staff | 4 |
| awards | 6 |
| scenarios | 3 |

### Systems

| System | Probe |
| --- | --- |
| building | structures |
| research | researched |
| staff | staffHired |
| guests | visitors |
| ride wear | breakdowns |
| bank | loanOwed |

## Features

- empty lot start — closed gate, starting cash and a loan, no guests until the park opens
- guest arrivals — trickle that ramps with rating and marketing
- research tree — rides, shops and scenery unlocked over game months
- guest needs — hunger, thirst, toilet, nausea, energy, happiness, money drive choices and complaints
- ride reliability — breakdowns that need a hired mechanic
- staff — hiring, wages, patrol areas
- pricing — gate ticket and ride and shop prices change demand
- litter and vandalism — handymen, bins and security
- monthly finances — month report, loan interest, bankruptcy
- scenarios — objectives with deadlines, win and lose, unlock chain
- calendar and speed — months and years, 1x to 8x
- onboarding — hints in the first scenario that point at things

## Gaps

- A piece-by-piece coaster builder (slopes, turns, loops, lifts) with a test run.
- Guests that walk the paths rather than straight to the door.
- Scenario goals past the third, like 800 guests and a 600 rating by year 2.
- The economy: a steady player's park loses money and closes in its second month (`bun scripts/balance.ts 60`
  is the measure). Guests stay about a minute and a half and spend little inside; the first scenario cannot
  be won yet.
- `packages/core/src/onboarding/`: steps are checked only on a game-time tick, so a game built with the
  clock paused checks them itself (`parkHintsWhilePaused` in `src/game/onboarding.ts`). The engine should
  check steps on world changes while paused.

## Milestones

1. [x] Design brief.
2. [x] Empty lot start, closed gate, arrival ramp, slower rating; the open-park proof plays from the empty lot.
3. [x] Monthly books, monthly loan interest and bankruptcy, marketing campaigns.
4. [x] Repairs need a mechanic; reliability shown; research rescaled to months; bins cut litter.
5. [x] Calendar months, long scenarios with an unlock chain, 8x speed.
6. [x] Onboarding hints that point at the gate, the ride, the gate button and the staff button.
7. [x] The brief in the checked shape; the from-zero proof plays the first 10 minutes; the lab's first four topics are short and the hints teach the lab, so the first unlock lands inside two minutes.
8. [x] Hint cards on the engine's onboarding system, with Hide hints.
9. [ ] An economy a steady player can grow: the balance bot wins the first scenario.
