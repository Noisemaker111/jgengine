# NO VACANCY

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
Game suite: **16/16 proven** · `jgengine suite odd-orbit`
<!-- /suite-score -->

A cosy, funny boarding house bolted to the side of a space station. You rent rooms to aliens whose
biology is incompatible with each other's, and every wall leaks. Rent pays the station's docking
fees; bad reviews and tenants packing up are how it goes wrong. (The folder and package id stay
`odd-orbit`; the game grew out of the Odd Orbit household sim and keeps its machinery.)

Run `bun run dev`, `bun run check-types` and `bun run test` here. Vite resolves `@jgengine/*` from
engine source. On a clean checkout, provision the catalog's CC0 packs before playing
(`bun run games:provision odd-orbit` from the repo root), which pulls `quaternius-stylized-nature`,
`kaykit-furniture`, `kaykit-space-base` and the ambientCG floor scans. Tenants, room modules and the
neon sign are original procedural three.js; portraits are original SVG.

## The tenants

| Tenant | What they are | What they need | What they put through the wall |
| --- | --- | --- | --- |
| Glorp | methane-breathing jelly | methane, warm, dim | swamp gas; a little gurgle |
| Sister Fog | sentient mist | any gas but vacuum, cold, dark | eats noise (hers and next door's), chills neighbours |
| Krrt | insectoid, sleeps through your day | oxygen, hot, dark, silent | chittering; molts in the shared Nap Pod |
| The Twins | one body, two heads | oxygen, mild; one head wants bright, one dark | arguing; two rent cheques, one per head |
| Old Basalt | a slow rock being | heavy gravity, warm; doesn't breathe | heat; pays a century (640) up front |
| Pip-9 | maintenance robot | a door of its own | clanking; mends things (Handy) |
| Velvet | gas-giant aristocrat | low gravity, methane, cold, bright, quiet | a little humming; tips lavishly, reviews twice |

## How it plays

Open the house from the title (*Open the house* → *Switch on the sign*). Four modules are docked: Krrt and
Glorp share a wall, Sister Fog has the third room, the fourth is empty and Pip-9 is in the broom
cupboard. The **Rooms** tool opens the plan: two rows of four berths, each room's air (oxygen,
methane, vacuum), gravity (low, standard, heavy), warmth (cold, mild, hot) and light (dark, dim,
bright), the noise it actually hears and what is seeping in. Change a setting (air 40, gravity 50,
warmth 20, light 10 credits), *Tune to their taste* in one go, fit a gasket (60) so nothing leaks in
or out, fit flare shutters (30), or move someone in — two tenants swap rooms.

Comfort (0–100) is read off the room as it effectively is after the walls have had their say, and
each penalty comes with the tenant's own complaint. Every key-tag on the left carries a comfort pill;
each door has a comfort lamp. At midnight (rent night) each tenant pays by comfort (×1.15 delighted,
×1 comfortable, ×0.6 grumbling, ×0.25 miserable), writes a 1–5 star review, and the reviews move the
station's **reputation**. Three miserable nights in a row and a tenant moves out with a one-star
review. Neighbours drift apart when one's air or noise hurts the other and closer when the wall is
kind: friends (35+) cover a short cheque; feuding neighbours (−35 or worse) bang on the wall, making
the other's next day louder.

While a room stands empty an applicant buzzes at the airlock: ask what they breathe, how they like
their room and what the neighbours should know, then let them in or turn them away. New modules dock
on the remaining berths as reputation allows (5th: 320 credits at 30 reputation, then 420/45,
540/60, 680/75). Each module adds 22 credits a night plus what its settings draw.

The old household's day jobs carry on in the commons: gig shifts (08–14) at the Gig Terminal earn
credits, hydro shifts (14–18) at a Hydro Tray grow rations, posts and rungs raise pay, tenants snack
at the Galley Counter, nap in the Nap Pod and chat on the Lounge Sofa. The Dockmaster's lease runs
four five-day terms with three goals each (four tenants comfortable; five with a door, three calls
handled, reputation 55; a fifth module, a close pair, 1,500 taken in; a lifelong bond, reputation 78
and half the deed paid). Two strikes, or 300 debt, and the berth is repossessed. The deed to the
station section costs 6,000 in any instalments; paid off, the nightly docking fee stops for good.

Front-desk calls arrive paced by the storyteller: a solar flare (shutter everything or ride it out
bright and hot), a surprise egg clutch, Krrt molting in the Nap Pod, the station inspector (who now
also fines a miserable tenant), plus the galley trader, overtime, spore drift, brownouts, mould, a
stranded traveller, hallway rows, space flu, micrometeors and hull leaks.

Saves checkpoint each game second to `odd-orbit.household-save.v1` (houses II and III under
`:household-2` and `:household-3`), including every room, its settings, who lives where, reputation,
reviews, the airlock queue and the deed. A save from the old household sim moves its four beings into
the first four rooms.

## Design checklist

- **Core loop.** Read a pill or complaint → swap or retune → watch the lamps. A 210-second day starts
  at 09:00 with 640 credits, 12 rations and reputation 50.
- **Progression.** Lease terms and goals; reputation → modules → more tenants; day-job rungs and
  mastery; bonds; the deed.
- **Failure states.** Move-outs after three miserable nights (−12 reputation each), bad reviews,
  lease strikes, 300 debt.
- **Balance bot.** `src/game/balance.test.ts`: an absent house and one that only buys rations are
  repossessed on day 11; a landlord who interviews, swaps, tunes, seals, docks modules, promotes and
  answers keeps the lease with 11 of 12 goals (it never pays the deed down).
- **References.** *The Sims 2* (readable moods), *RimWorld* (each tenant a plan), *Two Point
  Hospital* (comic room-by-room optimising), *Papers, Please* (the interview at the door).
- **Gap to target.** The starfield, planet and deck markings are drawn in code (sky and surface
  detail); tenant-specific requests and a second station section after the deed are still to come.

Loop proof: from-zero, rooms-tour, to-first-shift, to-transmission
