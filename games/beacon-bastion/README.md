# Beacon Bastion

Tower defense on a highland approach. Eleven authored plots sit beside two raider roads: the long main
approach and a short east flank. The keep has twenty lives. A defense is twelve waves, six authored and
six composed, played on one of three difficulties. Runs on engine source; start it
with `bun --cwd=games/beacon-bastion run dev` from the repository root.

## Design checklist

Read from `src/game/{waves,entities,combat,build,world}` and `src/game/campaign.ts`. Every number below
is what the build does now.

- **Core loop.**
  - 150 starting gold buys a tower for one of eleven plots:
    - Archer Post (50): pierce, hits flyers.
    - Frost Spire (70): frost, slows, hits flyers.
    - Cannon Redoubt (90, rises in 4 s): blast with splash, ground only.
    - Arcane Sanctum (110, rises in 3 s): arcane, ignores armor, hits flyers.
  - The keep, its plots, towers, purse and walls are one engine world spec (`src/game/keep.ts`),
    shared by every player in co-op.
  - Once a wave has fully arrived, a clock runs (25 s on Knight). When it runs out, the next wave
    marches on its own. Calling it early pays 1.2 gold per second skipped, capped at 40.
  - The clock holds while a boss walks.
  - Raiders leak 1–8 lives each into the keep. A kill pays the raider's weight times the wave curve.
- **Damage and raiders.**
  - Every shot is pierce, blast, frost or arcane, read against what the raider is made of (the engine
    damage table):
    - Bone takes ×0.6 from arrows and ×1.4 from shells.
    - Wards take ×0.6 from frost and ×0.4 from arcane.
    - Wraiths take nothing from shells and ×1.3 from arcane.
  - Armor (0–45) blunts pierce and blast: 40 armor halves a hit. Frost and arcane ignore it.
  - The roster is fourteen raiders:
    - Wraiths fly the flank road, where only archers, frost and arcane reach them.
    - Bulwarks carry an 80-point ward that grows back 2.5 s after the last hit.
    - Shamans mend 10% of every nearby raider's health every 3 s.
    - Hulks break into three bonelings where they fall.
  - Statuses run on the engine status runtime:
    - Burns stack to 3.
    - Ironshot cracks armor by 10 a stack.
    - Frost freezes, and leaves raiders brittle (+25% damage taken).
- **Progression — six systems.**
  - Tower ladders. Every tower takes two shared ranks (75% of build cost × rank; each adds 50%
    damage, 15% fire rate, 0.5 range). It then commits to one of two paths, and taking one closes the
    other. Each path has two steps (150–320 gold):
    - Archer: Longbow (+3.5 range, ignores up to 45 armor, every 4th arrow ×3) or Volley (three targets,
      fire arrows).
    - Cannon: Mortar (+4 range, 0.5 s stun) or Ironshot (cracks armor for every other tower).
    - Frost: Glacier (a pulsing aura with brittle chill) or Rime (freezes every 4th, then 3rd, hit;
      Shatterpoint doubles damage on frozen raiders).
    - Arcane: Storm (bolts chain to 5 raiders) or Ember (burns, and melts wards 2.5× faster).
    - Selling returns 70% of everything spent. The ladders are the engine's `upgradePaths`, so the world
      model prices, refuses and saves every step.
  - Aim. Each tower targets the first raider on the road, the last, the strongest or the nearest. T
    cycles it, as does the tower card.
  - Beacon rites. Beacon Fire (Q, every 40 s) falls 0.9 s after a click on the road: 120 damage in
    3.5 m plus a burn. The Frost Bell (E, every 55 s) slows every raider to 40% for 4 s (a boss to 70%).
  - Bounty ladder. Kill pay is the raider's weight × `1 + 0.25 × (wave − 1)`, capped at ×4, then the
    relic, the difficulty and the council.
  - Stars and the war council. A hold earns 1–3 stars by lives kept (90% for three), plus one on
    Warlord. The best stars per difficulty are council points, spent on the result stone:
    - Arsenal: tower-line damage, reach, and two mutually exclusive doctrines.
    - Treasury: opening gold, walls, kill pay, early-call pay.
    - Rites: hotter fire, faster cooldowns.
  - Relics. A finished defense banks half its purse (capped at 200), and the result card offers
    three relics through the engine's seeded draft.
- **Difficulty.**
  - Squire: 25 lives, raiders ×0.8 health, 32 s breathers.
  - Knight: 20 lives, 25 s breathers.
  - Warlord: 12 lives, raiders ×1.2 health and +5 armor, 20 s breathers, a fourth star.
  - It is picked on the result stone and saved with the keep.
- **Pacing, checked headless** (`src/game/balance.test.ts` plays whole defenses against the real
  director, towers and purse):
  - An empty keep falls by wave 3.
  - Eleven cannons fall to the wraiths.
  - A mixed, upgraded keep holds Knight with about 14 of 20 lives and never banks more than 300 unspent.
  - The same keep does worse on Warlord.
- **Failure states.** Losing every life ends the run with "The Keep Has Fallen": no stars, and a
  rebuild from the banked purse and the chosen relic.
  - Leaks also cost gold, because a raider that leaks pays no bounty.
  - Waves escalate through the composed act: duration 20 to 28 seconds, counts ×1.4 per rank, and
    wraiths, bulwarks, shamans and hulks in every pattern.
  - Victory is twelve waves with the field clear.
- **Minute 5 -> hour 5.**
  - At 5:00, waves 1–3 are down. Three or four towers stand and the first has reached rank II. The
    first wraiths have shown whether the flank has air cover.
  - At hour 5, each tower line has been tried down both of its paths. A few stars are seated on the war
    council, and Warlord is the reason to replay a keep that already held on Knight.
- **Bosses.**
  - The Warden (wave 6, again on 12) raises a 200-point ward when enraged, then calls two Bulwarks for
    its last stand.
  - The Warlord (wave 8) calls four grunts when bloodied and five bonelings when cornered.
- **The composed act.** Waves 7–12 come from `waves/composer.ts`, a pure function of `DIRECTOR_SEED` and
  the wave number. Five squad patterns mix the new raiders and send wraiths down the flank. The horn
  previews the next wave with trait marks (flyers, armor, wards, shields, healers, splitters, flank)
  before it marches.
- **References it is chasing.**
  - *Kingdom Rush*:
    - feel: branching tower paths, a hero-free pair of rites on cooldowns, and calling waves early for
      gold;
    - UI: tower cards with the next step's price at a glance.
  - *Defense Grid: The Awakening*:
    - feel: plot planning before the wave lands;
    - density: several towers firing down one long sightline.
  - *Bloons TD 6*:
    - feel: two exclusive paths per tower that change how it fights;
    - targeting priority per tower.
- **Gap to target.**
  - Mazing on open ground.
  - A second map.
  - A relic that changes how a tower works rather than only the numbers.

Loop proof: to-first-defense

The roads, plots and tower base numbers are read from `src/editor.scene.json`, so moving a road or
retuning a tower is an editor edit rather than a coordinate table. Run `bun run check-types` and
`bun run test` here after changes.
