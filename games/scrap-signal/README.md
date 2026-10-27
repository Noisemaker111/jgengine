# Scrap Signal

A first-person looter-shooter across Ferralon: pick Gunk, Nyx or Cipher, clear six levelled zones, roll
guns off what you kill, and finish at the Foundry Heart. Runs on engine source; start
it with `bun --cwd=games/scrap-signal run dev` from the repository root.

## Design checklist

Read from `src/game/{characters,progression,handroll,quests,world}`, `src/loop.ts` and `src/game.config.ts`.
Numbers are what the build does now.

- **Core loop.** Travel between six zones — Rustflat Waste (level 1), Breakwater Shelf (4), Coretown (8),
  Split-Ridge Pass (12), Glasswind Flats (17), Cores Blight (24) — killing camps, opening red and ammo
  chests, and spending cash and cores at Rigg, Sparx, Bolt and the black market. Kills roll guns at the
  zone's level, and eight main quests plus two side quests carry the level curve.
- **Progression — three systems.**
  - [x] Level 1–30. XP needs 90 × level^1.75; each level grants +8 max health and one talent point (29
    by the cap). The base character is 90 health and 60 shield.
  - [x] Talents. Three characters × three branches × nine nodes, ranks 5/5/1, gated at 5 and 10 points
    in a branch. Recalibrate on the talent screen refunds every point for $75 × level.
  - [x] Gear. Five rarities multiply damage ×1 / 1.15 / 1.35 / 1.6 / 2 at weights 100 / 45 / 18 / 6 / 1.4,
    and item level scales damage ×1.13 per level. Elites drop at 55–65%, bosses at 100%, and the Foundry
    Heart drops three guaranteed legendaries.
  - [x] Perks. Rare guns roll 1 of 12 behaviour perks (Rampage, Kill Clip, Subsistence, Triple Tap, Outlaw,
    Firefly, Leech, Shield Siphon, Overcharge, Contagion, Opening Shot, Last Word), epics 1–2. Each of the
    18 named legendaries carries a red-text signature (Sixgun: every 6th shot crits) plus a 50% rolled
    perk. Perks run on the engine's triggered-rules seam and show on the pickup scan, the field stash
    and as live buff stamps under the magazine.
  - [x] Boss farming. Each of the four bosses has two named legendaries at 22% on top of its normal drop:
    Captain Rusk (Sixgun, Vandal), Wreck-Maw (Sledgehammer, Chatterbox), The Foreman (Piledriver,
    Flakcannon), Foundry Heart (Starfall, Ashfall). The card names the boss under the signature.
  - [x] Overdrive (endgame). Once the Rustflat Front is cleared, the wreck's console runs it again as a
    20-tier ladder. Each tier lifts the crews one level per two tiers plus +6% health and +3% damage, and
    rolls 0–3 of 11 mutators (Frenzied, Juggernaut, Plated, Stripped, Volatile Cores, Swarm, Ion Storm,
    Self-Repair, Elite Escort, and the boons Glass and Bounty); re-tuning them costs 4 cores. Bronze is a
    clear, silver and gold are times (150 + 6 × tier s, 80 + 4 × tier s); medals are worth 1/2/3 points
    and open tiers ahead. A 12 s clock runs between waves and N calls the next one early. Clears pay
    cash, cores, XP and loot up to five levels above yours; from tier IV the Foreman drops a legendary.
    Leaving the ring for 8 s, bleeding out or reloading mid-run loses it.
  - [x] Balance bot. `src/game/rift/balance.test.ts` plays whole runs through the real front and damage
    model with a level-12 reclaimer who stands at the wreck and shoots. Five runs per cell, clears and
    median time: green T1 3/5 116 s, T5+ 0/5; blue T5 1–3/5; purple T8 2/5; legendary T8 3–5/5, T10 2–3/5,
    T13+ mostly 0/5. Its tests hold that shape: greens never gold T1, gear opens the middle, the top holds.
- **Failure states.** Health hitting zero starts a 12-second Emergency Reserve at walking speed; a kill
  during that window power-surges you back with 40% health and half shield, which makes fighting the way
  out. Expiry reconstructs you at the last discovered travel station for 7% of your cash. The chassis is
  kept on the field through a lethal hit (`onDeath.keep`), so the window always has a body to revive. Going down
  inside the Dead Air relay contract fails the contract, not the save.
- **Minute 5 → hour 5.** At 5:00 you are five bruisers into Rustflat Waste with the starter pistol. Hour
  five is around level 8–12 in Coretown, three to six talent points spent, Captain Rusk down and the
  first legendary in the hotbar.
- **References it is chasing.**
  - *Borderlands 2* — feel: guns with names, makers and attitudes; density: camps of six to ten, not a
    battlefield; UI: rarity beams on the ground and a comparison card on pickup.
  - *Destiny 2* — feel: shooting and ability uptime that carry a fight; density: patrol spaces with
    occasional event spikes; UI: a mission tracker that never covers the reticle.
  - *Diablo III* — feel: power growth you can feel per level; density: elite packs with a readable
    modifier; UI: a skill grid and loot comparison that work with the game still running.
- **Gap to target.** Overdrive scales to your level, so levels 25–30 now have a ladder to climb and
  respec makes a second build worth trying, but the world itself still ends at Cores Blight (level 24),
  the ladder has one arena (the Rustflat wreck), and there is no set gear or leaderboard to chase.

Loop proof: to-overdrive, to-front (each flow boots its own state: `overdrive` is the console with seven tiers cleared, then the console's own start button opens tier VIII and the run card goes live; `boss` is the front's last wave with the Foreman on the field, where the flow turns a quarter off him and back onto his heading and asserts his health dropped)

The whole-world save restores character, talents, quests, inventory and economy; `src/game/saveCompatibility.ts`
handles the legacy identifiers. Run `bun run check-types` and `bun run test` here after changes.
