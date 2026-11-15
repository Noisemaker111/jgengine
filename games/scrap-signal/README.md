# JUNK DRAWER

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
Game suite: **20/20 proven** · `jgengine suite scrap-signal`
<!-- /suite-score -->

A first-person looter-shooter in Maple Hollow, a sprawling, overgrown suburb after the appliances
took a bad firmware update and revolted. Every weapon is household junk with a trigger bolted on,
and every weapon has a personality that talks to you. Pick Marge, Dex or Pip, clear six
neighbourhoods of Roombas, lawnmowers, smart fridges and garage doors, merge your junk at Hank's
workbench, and unplug Mother Router. Runs on engine source; start it with
`bun --cwd=games/scrap-signal run dev` from the repository root. The folder and package id stay
`scrap-signal`.

## Design checklist

Read from `src/game/{handroll,combat,characters,progression,quests,world,items}`, `src/loop.ts` and
`src/game.config.ts`. Numbers are what the build does now.

- **Core loop.** Travel between six neighbourhoods — Crabgrass Court (level 1), Sprinkler Heights
  (4), the Maple Court cul-de-sac (8), Strip Mall Ridge (12), the Fairways (17), the Smart Home
  Estates (24) — clearing yards of rogue appliances, opening toy chests and recycling bins, and
  spending cash and spare parts at Nana's porch, Hank's garage and workbench, and the swap meet.
  Kills roll junk at the neighbourhood's level; eight story errands plus the neighbours' side jobs
  carry the level curve.
- **Junk weapons.** A weapon is a **body** and a **mod**, rolled on the engine's item generation seam:
  - Bodies: Staple Gun (semi-auto), Nail Gun (full-auto), Leaf Blower (a spread of gravel), Garden
    Hose (a held stream), Microwave (a slow charged long shot), Toaster (lobbed bursting toast),
    Vacuum (short range; every hit drags the target toward you), Fire Extinguisher (a foam cone that
    chills and slows).
  - Mods: Duct Tape (tighter spread), Extension Cord (+40% range), Batteries (fire rate, magazine),
    Glitter (always loaded with glitter: glittered targets take double from other weapons and attack
    slower), Cinder Block (+30% damage, never elemental), Rubber Bands (half-time reloads),
    Firecrackers (every shot explodes), Laundry Basket (huge hopper, sloppy).
  - Condition: Busted, Used, Like New, Mint, Heirloom (damage ×1 / 1.15 / 1.35 / 1.6 / 2). Rare and
    better roll 1-2 behaviour perks; each of the 22 heirlooms has a backstory line and a red-text
    signature, two per boss to farm.
  - Loads: hot sauce melts plastic, bleach eats steel, static shorts force fields, fizz explodes.
- **Personalities.** Every weapon is one of seven, derived from its id on its own stream, each with a
  perk, a quirk and lines for pickup, reload, kills, switching away, low ammo, jamming and merging,
  shown in a speech bubble over the ammo plate with a live mood readout:
  Grumpy (+20% damage, reloads 25% slower), Cheerful (kills heal 5%, -8% damage), Paranoid (shots
  bend onto a threat within 7°, 15% of shots spend an extra round), Dramatic (the last 30% of the
  magazine hits 40% harder, slower reloads), Philosophical (every sixth shot free, fires 12%
  slower), Clingy (+3% damage per 4 s held up to +30%; switch away and the other weapons deal 10%
  less for 5 s), Competitive (+8% per kill up to 5 while it stays out; switch away and it sulks, jamming
  for 2.5 s when you come back).
- **The workbench.** Hank's bench on the cul-de-sac shelves junk, salvages it (cash by level and
  condition, spare parts for Like New and better) and merges two weapons: body and voice from the
  first, mod from the second, the better condition, and two of a condition step up one. A merge costs
  $30 × level and a spare part and tops out at Mint: heirlooms are inherited, not made.
- **Progression — three systems.** Level 1–30 (XP needs 90 × level^1.75, +8 max health and a skill
  point per level). Skill trees: three tinkerers × three branches × nine nodes, ranks 5/5/1, gated
  at 5 and 10 points; a reset costs $75 × level. Junk, as above.
- **Failure states.** Health at zero starts a 12-second Last Gasp at walking speed; a kill in that
  window makes a comeback with 40% health and half shield. Expiry patches you up at the last bus stop
  you found for 7% of your cash.
- **Endgame.** The Block Party: once the Front Lawn is cleared, its speaker runs a 20-tier ladder of
  mutators (Frenzied, Juggernauts, Steel-Cased, Cheap Plastic, Lithium Batteries, Bluetooth Pairing,
  Power Outage, Self-Repair, Elite Escort, Glass Cannons, Coupon Day) with medal times; the HOA
  President drops heirlooms from tier IV.
- **Look.** Hostiles are procedural appliances with angry red LED eyes (`src/game/world/applianceModel.ts`);
  the viewmodel builds each weapon from its parts with googly eyes (`src/game/world/junkModel.ts`);
  hedges, maples, driveway cars, moving boxes, curbside sofas, giant lawn flamingos, yard-sale signs and
  telephone poles dress the yards under a clear summer sky.
- **Gap to target.** The ground plan is still the earlier layout re-dressed; houses, fences and
  cul-de-sacs authored in the editor are the next pass (PLAN milestone 8).

Internal ids keep their earlier names (zones, enemies, families, rarities, NPCs) as the save, scene and
proof identity; every player-facing name comes from display fields. `src/game/save.ts` maps guns
saved with an old maker onto its mod. Run `bun run check-types` and `bun run test` here after changes.
