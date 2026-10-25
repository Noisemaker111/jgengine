# Ember Command

A highland RTS campaign: the Vanguard holds a keep against Marauder waves across five missions and
wins by razing their warcamp. Runs on engine source; start it with
`bun --cwd=games/ember-command run dev` from the repository root.

## Design checklist

Read from `src/game/{catalog,tuning,upgrades,hero,systems,ai,campaign}`. Numbers are what the build
does now.

- **Campaign — five missions that teach the skirmish, in order.** The mission machine is the engine's
  (`@jgengine/core/mission`): objective graphs, timers, named fail states and rewards are data in
  `campaign.ts`, and `defendMission` / `escortMission` compose two of the five.
  1. **First Muster** (build order). Raise a Barracks, train four Footmen, then march Bram to the
     muster ground. Fails on `muster_stalled` (timeout), `keep_fallen`, or `bram_fell` on the march.
  2. **The Long Watch** (timed defence). Hold the keep 120 s while the wave director musters; fails
     as `watch_overrun` if the last soldier falls, or `keep_fallen`.
  3. **Road to Mid Vale** (escort). Bram must reach the mid-vale seam in 240 s; `bram_waylaid` if he
     falls or the clock expires.
  4. **The Thin Line** (no-loss hold). Reach the crossroads, then hold 45 s; one Vanguard soldier
     falling fails it as `line_broken`, as does leaving the ring or losing Bram.
  5. **The Ember Verdict** (two chained objectives). Weather the last push 60 s, then raze the
     Warcamp; `verdict_lost` if the army is wiped.
  Each mission pays gold and lumber into the vale's stores, which open the next battle on top of the
  250/120 purse. The field desk offers the next mission with its brief; a loss re-offers the same one.
- **HUD.** The orders card carries the mission number, its step pips, the live objective, the
  mission clock (and a counter when the objective counts), and the objective label is mirrored by the
  engine notice feed on each beat.
- **Save.** `persist: { mode: "manual" }`: the campaign track, the stores and the whole world are
  checkpointed at mission start, win and loss, and restored on boot behind the field desk. The
  battlefield is restaged fresh on load, so a save carries progress, not a half-played board.
- **Field desk.** The front end is the shared game menu over the live vale, in the campaign's own
  words: Continue campaign, New campaign, Campaigns & orders (three records in the game's own save
  slots), Settings and Credits, with the same system scaled down for pause (Resume the mission, Save
  to the record, Settings, Credits). A record remembers the commander's name, the mission it reached
  and the gold and lumber it carries; Continue restores the stores exactly rather than opening on
  the starting purse again.
- **Core loop.** 250 gold, 120 lumber and 30 supply open the match. Peasants walk to a gold seam or
  logging camp, work 2.2 seconds, and haul 12 gold or 8 lumber back to the keep. That pays for
  Peasants (55 gold, 8 s), Footmen (80 gold + 10 lumber, 14 s, barracks) and Riflemen (70 + 20, 16 s),
  plus Barracks (140 + 60, 20 s), Farms (60 + 30, 12 s, +8 supply) and Guard Towers (90 + 40, 16 s).
- **Progression — three systems.**
  - [x] Supply. 30 from the hall plus 8 per farm, spent 1–5 per unit, reserved when training is queued
    rather than when the recruit lands.
  - [x] Research. Iron Weapons (+3 damage per rank) and Iron Armor (−2 damage taken per rank), three
    ranks each, 18 + 8 × rank seconds, two jobs at once, barracks required.
  - [x] Hero. Bram 1–5 earns 35% of a victim's max health as XP; each level adds 70 health, 4 damage and
    20 max mana. Thunder Clap costs 40 mana, hits a 7 m radius for 26 + 8 per level, 9 s cooldown.
- **Failure states.** Player keep at 1600 health, warcamp at 1300; either reaching zero ends the
  match, and a campaign mission lands in its named fail state first. The Marauders wait 30 seconds,
  then muster every 42 seconds, adding grunts up to 6 and reavers up to 3 per wave, while the clock
  freezes at 22 fielded — bounded pressure rather than a swarm. Missions that teach economy or
  escorting fight without waves. Razing the warcamp stops reinforcements for good.
- **Minute 5 → hour 5.** At 5:00 the clock has called six or seven waves (first at 0:30, then every
  42 s, held whenever 22 Marauders are already fielded), a barracks and a farm are affordable, and Bram
  is level 1–2. The campaign is five missions on one vale; the free skirmish (same field, no track,
  waves always on) is the mode that keeps going, and it still has one enemy composition.
- **References it is chasing.**
  - *Warcraft III* — feel: one hero who matters with four units behind him; density: 20–30 bodies a
    side, not 200; UI: a command card holding the selected unit's verbs and costs.
  - *StarCraft* — feel: a supply-and-gather rhythm you can hear; density: a bounded field, matched by the
    22-unit Marauder cap; UI: resource strip, supply count and a wave clock you can read mid-fight.
  - *Age of Empires II* — feel: hauling to a drop-off building; density: a base that fits one screen;
    UI: queue progress bars and unit portraits for what is being trained.
- **Gap to target.** Five missions on one vale, one enemy composition, no second map and no
  mid-battle save: those are what hour five still needs.

Loop proof: to-skirmish (from a live match: pause, return to title, free skirmish, and the five footmen on the field are the arrival)

Placement lives in `src/editor.scene.json` (including the `campaign_muster` and
`campaign_crossroads` waypoints); the roster, costs and wave cadence live in the files above.
Run `bun run check-types` and `bun run test` here after changes.
