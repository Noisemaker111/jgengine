# Deepward

A first-person extraction slice built on published JGengine packages. Leave
Marrow through the Garage, search Bellwether for salvage, pack the haul and return
to the entrance before oxygen runs out. Banked salvage survives the next life.

Run `bun --cwd=games/deepward run dev` from the repository root, or `bun run dev` here.
The original industrial geometry needs no downloaded asset packs. The terrain,
room volumes and markers in `src/editor.scene.json` were exported from the real
published editor host; gameplay derives walkability and navigation from them.

Desktop controls: click the world to capture the pointer; use WASD to walk,
Shift to sprint, E to interact, Tab to open the carried cache, Escape to pause,
left mouse to fire and R to reload. Select a carried item and a grid cell to
repack it. Close the cache to return to movement.

The verified native slice includes Garage departure, copper-spool search,
grid repacking, return extraction, a full reload retaining the banked spool,
and a reload mid-dive that holds the title with Continue reading the dive's depth
and carry. The front end is the shared game menu over the station: Continue, New
dive, Dives & hauls (three record slots), Settings and Credits, with the same
system scaled down for pause. Each record is one shared save document
(`deepward.marrow.record:<slot>`) with a section for the persistent Marrow record,
one for the dive in progress and one for its captured frame and playtime; v1-v4
bytes at `deepward.marrow.v1` still load and are rewritten as Record I.

At Marrow's stash, spend banked salvage on two permanent refits. A sealed tank
costs one copper spool and one set of suit seals and starts each departure with 145
seconds of air. A reserve rack costs one copper spool and one pack of power cells and
starts each departure with 30 reserve rounds. Both need the same copper: buying
one leaves the other short until you bring another spool home. Installed refits
survive death; purchases consume exact saved items before confirmation.

Recovered service rifles can be prepared at the stash bench for the next shift.
Travel light to keep banked rifles safe and all twelve cache squares free, or
bring one for its own rolled damage per shot instead of the sidearm's 20. It
takes three cache squares. Preparation does not spend the rifle; verified
departure removes its exact instance from the stash. Return banks it again,
while death loses it.

Every salvage instance is a roll: its level is the depth of the room it was
found in, and its affixes come from one weighted table (`src/game/items.ts`).
A copper spool from rail receiving is level 1; the printer ink in the back of
the printhouse is level 4. The same source in the same Life always rolls the
same instance, so a reload cannot re-roll a haul.

The cache has weight as well as squares. Sixteen kilos is the load and the grid
is still 4 × 3, so the choice is which heavy thing is worth the trip: the
carried mass is on the cache sheet and the rail panel, and a source over the
load is refused with the number ("would put the cache at 12.75 of 12").

The counter also stamps service rifles. A bought rifle is level 2 with its own
roll; preparing one makes it the baseline, and every other rifle in the stash
then reads per-stat deltas against it (damage, rate, assay, and a weighted
verdict) before either is risked. Dismantling a banked instance pays its
salvage value once and spends it: the shared ledger refuses to equip, sell or
pay for that instance again.

The HUD is a `HudCanvas` of anchored panels, not hand-placed offsets: the
dive computer bottom-left, the kit counter bottom-right, the depth strip on the
brow, the action plate and the radio at the bottom. The canvas places them all
at once, so no panel lands on another at any screen size.

A lost Life now stops at Halloway's reprint screen. The loss is already saved;
accept the next Life before moving or departing again. Reloading at this screen
keeps the acknowledgement pending. The pause menu offers an explicit reload
action. The record is schema v5 under `deepward.marrow.record`; v1-v4 bytes
migrate on load, rolling the instance each legacy item would have had and
opening the counter's books at the banked scrip. Damaged and future saves remain
untouched. Cost, loadout, failure and reload boundaries have deterministic tests
against published engine commands. Native after-play confirmed Garage departure, explicit pause-menu reload,
the reprint screen and acknowledgement; the mid-dive checkpoint restore is
covered by a two-context test that boots a second world from the same bytes.
The full refit purchase and upgraded departure were tested through
published engine commands but remain unverified in native browser play.
Validation status is tracked in
[slice #35](https://github.com/Noisemaker111/JGengine-games/issues/35).

The station presentation uses original editor-authored rail canopies, pressure
vessels, print press ribs, receiving gantry and service panels. A content pass
adds one landmark per zone and eye-height wayfinding: a tool bay and service
trunk in Marrow, pallet banks and a mirrored receiving gantry, shelf bays and
bin cards in shift stores, an east manifold wall and ceiling ducts in the pump
gallery, a press flywheel, paper-roll bank and vent frame in the printhouse,
amber walk edges and junction boxes down the return spine, and five wall signs
naming each bay. `scripts/author-station.ts` rebuilds all of it through the
published editor session. Only the current
station architecture renders, with static surfaces and equipment batched. Original detailed GLB machinery is placed from the same
editor document and includes embedded authored material maps; see the per-model
manifest and reproducible tooling in `scripts/`. The original skinned Fitter
uses the SDK animation driver for idle/walk and the accepted strike countdown
for windup. Grip-origin service weapons retain the simulation-owned pose and
muzzle anchors. Original tileable wall/floor maps accompany the imported art.
Generic static instancing and PBR-map handling in the current renderer are a
temporary integration awaiting the shared published SDK seam.
Native art captures establish the actual home portal/trolley/surface detail,
bench close control, empty cache sheet and sidearm. Pump/press closeups and
Fitter windup remain unverified natively; software rendering limited the
accepted movement to the return spine. A pause-button/pointer-lock race blocked
the latest reload step; browser lifecycle ownership is being moved upstream.
The compact shift HUD leaves the central rail route visible. Combat, steam damage,
rifle packing and mobile controls remain unverified; the current application
expects desktop landscape input. At 400 × 225, the HUD obscures much of the
world; those small captures do not establish overall scene or HUD quality. This slice does not implement the whole
[design](DESIGN.md).

See [credits](CREDITS.md) for original content and dependency provenance.

## Design checklist

Read from `src/game/{state,combat,save,counter,navigation,progression,stationModels}`, `DESIGN.md` and the authored scene. The slice,
not the full design, is what the numbers describe.

- **Core loop.** At Marrow, depart through the Garage, walk Bellwether with 110 seconds of air, channel
  loot from a source into a 4 × 3 cache grid, then retrace the route to the entrance before air runs out.
  Banked salvage stays home; the next dive starts from the same entrance.
- **Progression — three systems.**
  - [x] Refits. Two permanent buys at the stash: a sealed tank (145 seconds instead of 110) and a reserve
    rack (30 rounds instead of 18). Both cost one copper spool plus seals or cells, so one spool buys one
    of them, and that shortage is the intended decision.
  - [x] Salvage. Five item kinds with real footprints and real mass — ink 2 × 2 and 7.8 weight at depth,
    power cells 1 × 2 and 2.75, service rifle 3 × 1 and 9.1, suit seals 2 × 1 and 2.2, wire 1 × 1 and
    1.5 — so the twelve-square grid and the twelve-kilo load disagree, and what to leave behind is the
    choice. Every instance rolls its own level and affixes.
  - [x] Lives. Death advances the Life once, keeps the stash, and stops at Halloway's reprint screen.
    A service rifle can be prepared for one departure (its rolled damage against the sidearm's 20), leaves
    the stash on departure, and is gone if that dive ends in death.
  - [x] Below receiving. Four strata under Marrow, each its own light, cold, pressure and fauna:
    Bellwether receiving (pressure 1), the Cold Stores (2, food drains three times as fast), the Ink Wells
    (3, ink slows you and leaves a scent trail) and the Choir Deep (4). Lifts link them; a seal rated
    below a floor's pressure takes 7 health a second per step over. The lift under the Cold Stores needs
    the mast's cage code, and the last lift needs the Ink Wells relay's.
  - [x] Fabricator. Scanning wrecks, suits, rigs and trays (C on a creature, E on a fragment) teaches seven
    blueprints over one to three fragments each: plasma cutter (cable runs), Seal Mk II and III, seam drill
    (ink seams), blood lure, spare cylinder (+40 s air) and rail crawler (land at your deepest lift, ride
    home from any lift). Each prints from banked salvage.
  - [x] Marrow's bays. Six bays take a cell generator (+3 power), water still (one water a 80 s), growbed
    (one ration a 110 s), air scrubber (+25 s air) and radio mast (the story's ears), each costing power,
    each built over 6-10 s while Marrow runs, all saved with the record.
  - [x] Body. Food and water drain on every dive (faster in the cold); rations and water ride a belt (Q eats)
    and anything left on the belt at extraction fills the galley, which feeds you between dives. Starving
    costs health; a full galley and running bays turn survival into a background chore.
  - [x] Creatures. Hands (passive, flee noise and light), couriers (territorial, hunt light, sound and blood,
    wind up before a 16-damage strike) and the Overrun in the Choir. A lit lamp (F) is seen from further;
    a thrown blood lure (G) pulls any hunter off you until it is eaten.
  - [x] Story. Halloway's lines follow Marrow's state: build a generator, raise the mast, hear Printer Zero,
    find the relay, seal for the Choir, take Pattern 406, bring it home. Logs scanned below fill the codex,
    and the fabricator lists the job with what is done and what is next.
- **Failure states.** Air at zero suffocates at 12 health a second; steam costs 18 a second; the Fitter
  print has 80 health, sees through a 12 m cone, hears a search at 15 m and winds up before it swings.
  Death banks nothing carried and requires acknowledging the reprint
  before departing again. A reload holds the title; Continue resumes the dive from its last checkpoint
  (tank, magazine, position and HUD lines) and keeps the banked stash.
- **Minute 5 → hour 5.** At 5:00 you are on the first departure with the sidearm and two or three items,
  still deciding whether the rifle is worth three cache squares. Hour five is roughly two or three Lives
  in, both refits installed, and the light-or-armed departure actually costing something.
- **References it is chasing.**
  - *Escape from Tarkov* — feel: the way out is the whole tension; density: loot scattered through rooms
    rather than poured out of one chest; UI: the timer and the extraction point, plus grid packing.
  - *Subnautica* — feel: oxygen as the only clock, so depth is a bet; density: one route out that you
    re-cross; UI: air and depth readable without opening a map.
  - *Prey (2017)* — feel: a station that reads as somewhere people worked; density: rooms with a job, not
    corridors with props; UI: a hand wheel instead of a spellbook.
- **Depth proof.** `depth-run` seeds a few-dives-in record, then plays two dives through the real verbs:
  build a generator, still and mast and print the cutter, Seal Mk II and two lures; hear the mast's signal;
  scan the cold stores' seed tray, cut a cable (its noise draws the courier), take rations, lure the
  courier off a dark diver, extract; wait for the still to fill the galley, build the growbed the scan
  taught; dive to the Ink Wells, scan the relay, step into the Choir past the seal's rating, ride home and
  watch the growbed add a ration. The camera keeps its own heading, so its stills face the way the diver
  walked in, not each target.
- **Gap to target.** Five item kinds are the entire loot table even though every instance now rolls a
  level and a rarity. [DESIGN.md](DESIGN.md) describes six hand families and per-item trees; until some of
  that exists, the second delve has fewer new things to hold than the first.

Loop proof: to-extraction, depth-run
