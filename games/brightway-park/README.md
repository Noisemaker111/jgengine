# Brightway Park

A park-builder tycoon: buy rides and stalls, set the ticket and ride prices, keep guests fed and the
rating climbing, and keep the crew on the breakdowns. Runs on engine source; start it with
`bun --cwd=games/brightway-park run dev` from the repository root. Saves to `brightway-park.save.v1`;
`docs/PLAYTEST.md` holds the last verified pass.

## Design checklist

Read from `src/game/{park,catalog,objects,sim,scenarios,milestones,rides}`; the park is one declaration in `park.ts`. Numbers are what the build does now.

- **Core loop.** $10,000 in the till and $10,000 owed to the bank at 0.8% a day, a 150-second day
  starting at 09:00. Guests arrive through the gate while it is open, pay the entry fee (default $8;
  the more the park is worth, the more they will pay), then pick a ride or a stall by need, mood, the
  wait they can see and the price. Upkeep and wages run by the second; each midnight restocks the
  stalls (paid per item sold) and takes the loan's interest.
- **Progression — four systems.**
  - Twenty-eight rides in five families (gentle 8, thrill 8, water 4, transport 3, coasters 5),
    each with its own excitement, intensity, nausea, capacity, cycle and ticket on the shared ride
    sim. Wear builds every cycle until the ride breaks; the crew's repair is a full overhaul, a
    mechanic bay cuts it by a third, and servicing clears wear before it breaks.
  - Money that binds. Every stall and ride has a price the player sets; a guest refuses one more
    than a quarter over what it is worth ("too expensive" counts on the dashboard). Ten shops and
    facilities: burgers, drinks, toilets and the information kiosk at the start, six more in the lab.
    Borrow or repay in $1,000 steps up to $25,000 in the park books (Books, or L), which show what is
    owed and the night's interest.
  - A research lab. Four rides, four shops and nine scenery pieces are open at the start; every
    other ride, shop, theme piece and the mechanic bay is a lab topic with its own fee and time, each
    after the one before it in its family.
  - Theming. Fourteen scenery pieces (library trees, bushes, rocks, benches, lamps and bins, plus
    the park's own flower beds, hedges, fountain, topiary, statue, arch and flagpole) add charm to
    every ride in reach, which lifts the ride's appeal and excitement, up to 6 points a ride.
  - Awards. Six rating awards (150 to 900 stars) pay $500 to $6,000 once each.
  - Guests say what they think. Each guest keeps its last few thoughts (hungry, needs the toilet,
    feels sick, the queue is too long, too expensive, great ride); the dashboard shows what the crowd
    is saying most, and a park full of complaints loses rating.
  - Staff with patrol areas. Handymen sweep, mechanics inspect and service worn rides, entertainers
    cheer guests and ease long queues, security guards stop unhappy guests making a mess; each works
    a ring the player widens or narrows.
  - Building like a park sim. Height levels with land raise and lower (drag an area, $25 a cell);
    rides need flat ground. Paths and queue lines drag out as a line. A ride opens only with an
    entrance and an exit against it joined to the paths from the gate, and a shop only with a path
    beside it; a shut one says why and offers "Connect it". Guests queue on the queue line, which
    makes a long wait easier to bear. U undoes the last build, demolish or land change.
  - Three scenarios. Opening Weekend, Star Attraction and Full House, each a timed objective on the
    shared mission runtime with its own fail states, reward and fresh-park replay.
- **Failure states.** A day that ends in the red counts toward bankruptcy; three days in the red
  closes the park for good. A breakdown takes its ride offline until its queued repair lands, so a
  park that skips servicing loses its queue and its rating with it. A scenario that misses its clock
  fails in its own named state rather than ending free play.
- **Minute 5 → hour 5.** The 30-minute balance bot (`bun scripts/balance.ts 30`) spends the opening
  $10,000 on rides and shops (with their entrances, exits and paths) in four minutes, then earns
  about $275 a minute operating ($610 taking) while the rating climbs from 160 to 370, so each new
  $2,000-$5,000 ride is ten minutes of good play. Hour five is the top of the lab and the 600-900 star awards.
- **References it is chasing.**
  - *RollerCoaster Tycoon 2* — feel: guests as individuals with opinions you can click; density: a park
    full of walkers at every zoom; UI: build palette beside a guest window, price control in the stall.
  - *Parkitect* — feel: upkeep and restocking that actually bite; density: a compact grid where every
    square is accounted for; UI: rating and finance panels that explain the number rather than show it.
  - *Planet Coaster* — feel: milestone celebration worth pausing for; density: crowd scale at the gate;
    UI: dashboard-first management with the park still visible behind it.
- **Gap to target.** Next: a piece-by-piece coaster builder (slopes, turns, loops, lifts) with a
  test run, scenario goals like 800 guests and a 600 rating by year 2, and guests that walk the
  paths rather than straight to the door.

Loop proof: to-open-park

Balance numbers live in `src/game/catalog.ts` and `src/game/objects/catalog.ts`; the simulation is in
`src/game/sim/`, the ride adapter in `src/game/rides.ts`, the park's declaration (structures, actions, money, loan) in
`src/game/park.ts`, and the
scenario and milestone content in `src/game/scenarios.ts` and `src/game/milestones.ts`. Run
`bun run check-types` and `bun run test` here after changes.
