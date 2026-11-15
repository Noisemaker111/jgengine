# NO VACANCY plan

Brief: "Redesign the alien household sim into NO VACANCY. You run a cramped boarding house bolted to
the side of a space station, renting rooms to aliens whose biology is incompatible with each other's.
Rent pays the station's docking fees; evictions and bad reviews are your failure states. Tenants with
clashing needs (Glorp, Sister Fog, Krrt, The Twins, Old Basalt, Pip-9, Velvet). Rooms have atmosphere,
gravity, temperature, light and noise; walls, vents and airlocks let things leak between rooms.
Placement is a spatial puzzle. Bonds become friendships and feuds. Events: a solar flare, a station
inspector, a surprise egg clutch, an applicant at the airlock. Long loop: expand module by module,
earn station reputation, pay off the docking debt and buy the station section outright. Cozy, funny,
warm. Chunky retro-futurist modules, pastel lights against black space, a distinct silhouette per
species. Just do it, be really creative."

The game keeps the folder and package id `odd-orbit`; every player-facing name is NO VACANCY.

## Direction

- **Genre and references.** A life-sim / management hybrid. *The Sims 2* for readable moods and a
  cut-away house; *RimWorld* for a small roster where each tenant is a plan and the day explains
  itself; *Two Point Hospital* for the comic tone and room-by-room optimisation; *Spiritfarer* for
  warm tenants with voices; *Hotel Dusk*/*Papers, Please* for the interview at the door.
- **Faithfulness.** Inspired by, not a remake. The previous household sim's working machinery stays
  and is re-themed: tenants are its household members (needs, stress, traits, day jobs, mastery,
  bonds), its charter becomes the Dockmaster's lease, its transmissions become front-desk calls, its
  economy, saves and tests carry over.
- **Breadth.** In: seven named species; a 4 × 2 grid of room berths; per-room air, gravity, warmth
  and light; computed noise; leaks of air, noise, heat and mist through shared walls; gaskets and
  flare shutters; comfort, rent, reviews, reputation, move-outs; friends cover rent, feuds sabotage;
  applicants with a three-question interview; modules gated by reputation; the deed. Out: building
  arbitrary room shapes, vents as placeable objects (a sealed wall stands in for the vent decision),
  multiplayer, tenant romance and children (an egg clutch is a one-day event, not a new tenant).
- **Look.** Stylized: chunky retro-futurist modules, pastel room lights against black space, one
  procedural silhouette per species. Camera: the existing top-down RTS rig over the commons and the
  rooms behind it. Desktop and phone.
- **Length.** About five hours to see everything: four five-day lease terms (twenty in-game days,
  about 70 minutes at 1× and less at 2–4×), then the deed (6,000 credits) as the long goal.
  Sittings of 15–30 minutes. Teaching through the next-step note, the guide and tenants' own
  complaints.
- **Done.** From a new house: swap Glorp away from Krrt, give Pip-9 or an applicant the empty room,
  keep four tenants comfortable through the first lease review, dock a fifth module, and pay the deed
  down.
- **Player promise.** "Every tenant is a puzzle piece with a personality: put the right ones next to
  each other and the house hums; get it wrong and someone bangs on the wall all night."
- **Pillars.** Placement is the main decision (who shares a wall with whom). Every number has a voice
  (a complaint line explains each comfort penalty). Small house, big consequences (eight berths,
  seven species, everything leaks).
- **Anti-pillars.** No spreadsheet without a face; no punishment without a readable cause; no grind
  for its own sake.
- **Falsifier.** If a player can keep every tenant comfortable without ever moving one, the walls do
  not matter and the design has failed. (The opening house is built so they cannot.)

## Design brief

- **Core loop (30 s).** Read a comfort pill or a complaint, open the Rooms plan, swap two tenants or
  retune a room (air 40, gravity 50, warmth 20, light 10 credits), watch the comfort lamps change.
- **Session loop (one sitting).** A day: tenants work gig and hydro shifts, eat and nap in the
  commons, chat in the lounge; at midnight rent comes in by comfort, reviews land, reputation moves,
  feuding neighbours sabotage, the docking bill is paid. An applicant buzzes while a room is free.
- **Long loop (hours).** Lease terms raise docking fees and set three goals each; reputation unlocks
  modules (5th at 30, 6th 45, 7th 60, 8th 75); applicants fill them; the deed ends the fees for good.
- **Second 0.** Four tenants, four rooms: Krrt and Glorp share a wall (swamp gas one way, fresh air
  the other), Sister Fog is happy in the third room, the fourth is empty and Pip-9 is in the broom
  cupboard. The first verb is obvious and cheap: move someone.
- **Onboarding.** The next-step note names the most urgent fix (an applicant, a miserable tenant, the
  bill); comfort pills on every key-tag; each complaint in the tenant's own voice.
- **Pace.** Something new every 2–4 minutes: an applicant, a front-desk call, rent night, a feud.
- **Longest cycle.** The deed: 6,000 credits paid in any instalments.
- **Minutes to see everything.** ~300.

### First 10 minutes
- 0:00 Open the house. Krrt's pill is lime, Glorp grumbles about fresh air through the wall.
- 0:45 Rooms plan: the leak is named; move Glorp to room 4 or Sister Fog between them. Learn swaps.
- 1:30 First applicant (The Twins) buzzes: ask three questions, let them in or keep the room for Pip-9.
- 2:30 A gig shift pays; the Gig Terminal and hydro tray carry on the day jobs from the old sim.
- 3:30 First front-desk call (often a solar flare or the galley trader).
- 3:50 Rent night: cheques by comfort, first reviews, reputation moves. Learn rent = comfort.
- 5:00 The Twins' two heads disagree about light; try dim or seal a noisy wall. Learn per-head rent.
- 7:00 A feud forms where walls leak; someone bangs on the wall. Learn to separate them or seal.
- 8:30 Reputation passes 30 if the house is happy: the fifth berth can be bought; Pip-9 gets a door.

### Start state
- day 0, tenants 4, rooms 4 (3 let), reputation 50, credits 640, rations 12, deed 6,000.

### Content budget
- 7 species (each with 3 interview answers, 2–3 happy and 2 unhappy lines, 6 complaints, a greeting,
  a rejection and a move-out line); 8 berths; 4 room factors × 3 settings; 17 front-desk incidents
  (new: solar flare, egg clutch, Krrt's molt; re-themed: inspector and 13 others); 4 lease terms × 3
  goals; 6 furnishings; 6 day-job posts × 3 rungs; 12 traits.

### Systems
- Rooms and leaks — probe `rooms`, `housed`; Rooms plan shows "seeping in".
- Comfort, rent and reviews — probe `reputation`; night notice "Rent night: … reputation …".
- Friends and feuds — notices "covered … rent" and "banged on the wall".
- Airlock — probe `applicant`; slip "BUZZ AT THE AIRLOCK".
- Modules and deed — probe `rooms`, `deed`.
- Day jobs, needs, bonds, lease, front desk — carried over (`working`, `term`, `incident`, `review`).

## Features
- Tenant needs and moods — `@jgengine/core/agents/agent`, `agents/mood`
- Friendships and feuds — `@jgengine/core/agents/relationships`
- Rooms, leaks and comfort — game model `src/game/boarding/rooms.ts` [partial: one adopter]
- Rent night, reviews, applicants, deed — game model `src/game/boarding/boarding.ts` [partial: one adopter]
- Docking bills and debt — `@jgengine/core/economy/resourceLedger`
- Lease terms and goals — `@jgengine/core/mission/objectives`
- Front-desk events — `@jgengine/core/ai/director/storyteller`
- Day-job ladders — `@jgengine/core/progression/standing`, `progression/upgrades`
- Shifts — `@jgengine/core/time/stateSchedule`, the shared session loop
- Saves and slots — `@jgengine/core/game/keyValueStore`, `save/saveSlots`
- HUD and menus — Rune UI (`@jgengine/core/ui/rune`)
- Tenant figures and modules — plain three.js on the engine frame loop (`frame/useEngineDraw.draw`)
- Room berths — authored `room_berth` markers in `editor.scene.json`

## Gaps
- Adjacency-leak comfort model (rooms on a grid that pass air, noise and heat through shared walls,
  scored per occupant with reasons) lives in the game as its first adopter. Seam:
  `packages/core/src/<feature>/` would be a `zoneAdjacency` part (grid neighbours, per-zone
  emissions, per-occupant preference scoring); the second game that needs it moves it upstream.
- The editor has no placeable "room berth" kind with a slot field; berths are authored as custom
  markers via the editor CLI (`add_marker`). A `definePlaceableMarkerKind` registration would let a
  designer drop them by hand.

## Milestones
- [x] 1. Re-theme: tenants by species, rooms grid with leaks and comfort, rent night, reviews,
  reputation, move-outs, friends cover rent, feuds sabotage, applicants, modules, deed, three new
  front-desk events, lease goals, HUD (Rooms plan, buzzer slip, comfort pills), procedural tenant
  figures, room modules and neon sign, space mood. Tests and balance bot updated.
- [x] 2. From-zero flow (`proofs/flows/from-zero.flow.ts`: Pip-9 gets a door and Sister Fog swaps
  between Krrt and Glorp through the UI); suite proofs 12/16 (missing: find-features, save.continue,
  settings.controls, menu.start-and-credits).
- [x] 3. Tenant barks in the feed and as Rune speech bubbles over heads; clicking a module opens its
  room card; tenants scaled up; the applicant waits at the airlock in person.
- [x] 4. Station dressing: trusses, beacons, docking arm with a moored shuttle, starfield and planet
  limb (procedural backdrop); the deck shrunk to the authored plate.
- [ ] 4b. Move the backdrop's truss and dock geometry into the scene document once the editor has a
  kind for it.
- [ ] 5. Deeper long loop: tenant-specific requests (Velvet's chandelier, Basalt's annual sentence as
  a collectible), a second station section after the deed.

## Handoff

- Verified: game tests 135 pass, check-types clean, suite 12/16 proven, `from-zero` and `rooms-tour`
  flows pass in a live browser, capabilities probe boots. Captures use
  `CHROME_PATH=/opt/pw-browsers/chromium JG_CAPTURE_GL=swiftshader JG_BROKER=0 --cold`; Rune panels
  and bubbles do not repaint in live software captures once the sim runs, so their content is proven
  by the headless native UI test and the flows.
- `verify:fast` stops at "provision models for tests" (other games' model pulls get 403 from the
  sandbox proxy).
- Next: the four missing suite entries (needs menu/settings commands the proof can act on, and a
  storage the headless restart keeps), milestone 5.
