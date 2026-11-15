# Hauntworks

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
Game suite: **18/18 proven** · `jgengine suite brightway-park`
<!-- /suite-score -->

A reversed tycoon. You are the ghost proprietor of a derelict seaside amusement park, and the living
keep coming to visit. Scare them out - chain your frights, wring ectoplasm from their nerve, send them
home screaming so the rumor spreads - and turn the park into a paradise for ghosts. Runs on engine
source; start it with `bun --cwd=games/brightway-park run dev` from the repository root (the folder and
package keep the old `brightway-park` id). Saves to `hauntworks.save.v1`.

## Design checklist

Read from `src/game/{park,catalog,objects,sim,scares,ghostCatalog,ghosts,threats,scenarios,milestones,rides}`;
the haunt is one declaration in `park.ts`. Numbers are what the build does now.

- **Core loop.** A new haunt is an empty lot with a two-cell plaza inside a chained gate, 10,000
  ectoplasm in the vault and 10,000 owed to the Ferryman at 4% a moon. The clock runs noon to noon:
  the living come through the gate at dusk (17:45) and go home at dawn (07:12); the night closes at noon
  while the park is empty (stalls restock, the exorcist may call, the night's harvest is filed). A night
  is 150 seconds; a moon is eight nights (20 minutes at 1x); a season is eight moons. The player lays a
  path, builds and connects a ride, and unchains the gate (it refuses with no ride running).
- **Nerve and ectoplasm.** Every visitor arrives with 10 to 36 nerve, by kind. A ride costs its rider
  1.6 nerve per point of Fright and yields 1.5 ectoplasm per point of its scare yield (a knob the player turns; the living refuse
  a ride turned up past what its Fright is worth) as ectoplasm; scare props jolt anyone who walks into
  their reach for their fright in nerve, harvested the same way. Scares that land within 18 seconds of
  each other chain: each link adds a quarter to the next scare's multiplier, up to x2.5, so a path laid
  out as a gauntlet earns far more than the same pieces scattered. A visitor whose nerve runs out flees
  screaming: the scream is worth 8 ectoplasm and spreads the rumor, and the rest of their group loses
  35% of their own nerve. Scare a group out at the gate and they never reach the best rides. The
  authored starter haunt sends about six of the living home screaming a night.
- **The living.** Six kinds arrive in groups: dared teens, couples on a date, brave families, skeptics
  (immune to any prop below fright 5), ghost hunters (from rumor 150) and paranormal TV crews (from
  rumor 320). Each kind has its own nerve range, curiosity and taste in Thrill.
- **Rides.** Twenty-eight haunted rides in five families (eerie 8, frenzy 8, pier & tide 4, drifting 3,
  screamers 5), each rated Fright / Thrill / Dread on the shared ride sim (the sim's excitement,
  intensity and nausea): the Ghost Train, the Upside-Down Carousel, the Hall of Wrong Mirrors, the Wheel
  That Doesn't Stop and the rest. Rides wear and jam; only a Gremlin Tinker un-jams them. Each takes one
  refit (Hushed or Ghastly) and can be rested.
- **Scare props.** Eight: Moving Portrait, Cold Spot, Jack-in-the-Coffin, Fog Cauldron, Crockery Shelf,
  Flickering Lamp, Possessed Vase, Candelabra of Whispers. Each draws its reach on the ground as a pulse.
- **Gloom.** Sixteen atmosphere pieces (dead oaks, twisted trees, toadstool rings, gravestones, gas
  lanterns, iron railings, bone piles, pumpkin lanterns, the Weeping Fountain, the Weeping Statue...)
  add dread to every ride in reach, up to 6 points of appeal a ride.
- **Ghost residents.** Six ghosts (Victorian Child, Drowned Sailor, Poltergeist, Banshee, Pale Bride,
  Lighthouse Keeper) come looking once the rumor reaches them. Each wants specific things at once (the
  Sailor wants fog and the pier; the Child a carousel and a toy; the Poltergeist breakables; the Banshee
  an audience and a perch). Hold them for 12 seconds and the ghost moves in: it seeps 60 to 200
  ectoplasm a night, adds 35 to the rumor, and whispers one séance for free. Take its things away for 40
  seconds and it drifts off. The Ghost register (G) shows every want, ticked.
- **Threats.** Hunters and TV crews film every scare they witness. If they flee screaming the footage
  is lost; if they walk out calmly it goes on the record. At 100 evidence an exorcist comes at noon: the
  newest ghost is blessed out for two nights (the exorcist walks in from the gate to its haunt), the rumor takes a knock and the fee is paid in ectoplasm.
  A Gargoyle Sentry watching makes their cameras fail. Evidence fades by 12 a noon.
- **Full moons.** Night 5 of every moon is a full moon: 1.6x the living head for the gate and every
  scare yields 1.25x. The HUD and the dusk banner say so.
- **Everything else from the tycoon machinery**: four spooks with patrol areas (Ghoul Groundskeeper,
  Gremlin Tinker, Phantom Barker, Gargoyle Sentry); ten stalls for the living's needs (Cursed Candy
  Floss, Witch's Brew, the Fortune Teller...); the séance table (34 topics in family chains); rumor
  campaigns (chalk warnings, a cursed chain letter, late-night radio static); the moon's ledger; land
  raise and lower; undo; speeds 1x to 8x.
- **Failure states.** Two moons in a row ending with the vault dry and the haunt fades for good. A
  scenario fails at its deadline, or when the living's mood collapses below 15% (a haunt that bores).
- **Long goal.** Three scenarios, each unlocking the next, ending in the Full Moon Festival:

    | Scenario | Targets | Deadline | At 1x | Prize |
    | --- | --- | --- | --- | --- |
    | The First Chill | 60 screaming exits, 300 rumor, 1 ghost | end of the Frost Moon (3 moons) | 1 h | 5,000 |
    | Talk of the Coast | 450 screaming exits, 600 rumor, 3 ghosts | end of the Pink Moon (8 moons) | 2 h 40 | 10,000 |
    | Full Moon Festival | 1,500 screaming exits, 850 rumor, 6 ghosts | season 2 (16 moons) | 5 h 20 | 20,000 |

  Free play's own goal is a ghost paradise: 8 rides, 600 rumor, 4 ghosts, a night in the black and a
  thrilled, tidy crowd.
- **References it is chasing.** *Ghost Master* (2003) for haunting the living as the goal; *Luigi's
  Mansion* for readable stylized ghosts with personalities; *Theme Hospital*'s dry humour over a
  management sim. The tycoon bones are the engine's shared world model and ride sim.
- **Gap to target.** The ectoplasm economy is unbalanced (chained scares are new and untuned); the
  three scenarios have not been played through end to end; the sky does not follow the clock. See `PLAN.md`.

Loop proof: to-open-park

Balance numbers live in `src/game/objects/catalog.ts`, `src/game/ghostCatalog.ts`,
`src/game/entities/guests/catalog.ts` and `src/game/scares.ts`; the simulation is in `src/game/sim/`,
the ride adapter in `src/game/rides.ts`, the declaration in `src/game/park.ts`, and the scenario and
award content in `src/game/scenarios.ts` and `src/game/milestones.ts`. Run `bun run check-types` and
`bun run test` here after changes.
