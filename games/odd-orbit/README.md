# Odd Orbit

A small alien household simulation about making room for different needs and rhythms. Four named household members share six furnishing types, a pantry, credits, debt and reciprocal bonds. The existing orbital habitat and body plans remain the game's canon; interface portraits are original SVG artwork.

Run `bun run dev`, `bun run check-types` and `bun run test` here. Vite resolves `@jgengine/*` from engine source. On a clean checkout, provision the catalog's CC0 packs with the installed asset CLI before playing:

```sh
bunx --no-install assets pull quaternius-modular-scifi --dir public
bunx --no-install assets pull quaternius-stylized-nature --dir public
bunx --no-install assets pull kaykit-furniture --dir public
bunx --no-install assets pull kaykit-space-base --dir public
bunx --no-install assets pull ambientcg-metalplates001 --dir public
```

Quaternius, KayKit and ambientCG supply the existing CC0 models/materials through the engine catalog. Remote pack bytes remain ignored. The floor pack has no downloaded AO map, so the game ships an original white neutral map under `public/materials/imported/odd-orbit` to express no baked occlusion.

Choose New career or Continue. The front end is the shared game menu over the habitat: Continue opens the newest household at the shift it paused on and names the being working it, Careers & shifts holds three households with a captured frame of each, and Settings, the field guide and Credits live in the same pane. Select a member to inspect needs, stress, schedule, bonds, post and station mastery; direct activities through the inspector or let members choose. A post's ladder opens with household standing, and promoting a being changes what their next shift pays. Build opens the furnishing palette: choose an affordable item, then select vacant ground. Occupied placement is rejected without spending. Sell returns half the purchase price and releases users. Escape pauses. Guide, settings, credits, speed controls and the household ledger are available in the HUD.

Households start at 09:00 with 640 credits and 12 rations. A Yield career shift uses a console during 08–14 for 20 seconds and earns up to 100 credits. A Bloom shift uses a planter during 14–18 for 20 seconds and earns four rations and 48 credits; friends tending together earn a bonus. Furnishing capacity matters. Productive progress locks that member's rhythm for the rest of the day. Three completed shifts unlock the wider 08–18 window. Late assignments lose their remaining shift rather than creating overtime.

The pantry supplies meals. Six rations cost 36 credits, subject to a 40-ration capacity. Nightly upkeep is 80 credits plus each furnishing's running cost. Relief requires fewer than four rations and fewer than 36 credits; it supplies four rations and adds 40 debt once per day. Up to 40 debt is repaid with the next bill. Poor needs and overload stop work. Food, torpor and lower stress restore agency. Shared conversations build reciprocal bonds; interruption can damage them. The bounded event feed and daily ledger show consequences.

Actions and each game second checkpoint to the browser-local key `odd-orbit.household-save.v1` (household II and III use the same path under `:household-2` and `:household-3`). Saves include the household and its name, clock, entities, furniture poses, stats, economy cursor, the charter, the storyteller's pacing, any waiting transmission and the habitat's damage, plus the card's captured frame. Reload opens the paused menu; Continue resumes the saved moment without offline event bursts or duplicate bills. Invalid/newer data stays untouched until explicit New career; unavailable storage is shown honestly. Saving stays on the current browser origin.

Directing the same activity at the same furnishing preserves the ongoing action while renewing player direction. Each meal spends one ration when it begins; repeating that direction also lets an already-paid meal finish after the pantry empties or the household reloads.

Each settlement processes at most seven overdue bills. Remaining due cycles stay
in the saved economy cursor and settle on later simulation steps; repayment stops
when the outstanding debt reaches zero. Bills skipped by an older build cannot
be reconstructed from its already-advanced cursor.

## Design checklist

Read from `src/game/{needs,objects,sim,session}`. Numbers are what the build does now.

- **Core loop.** A 210-second day starts at 09:00 with 640 credits and 12 rations for four generated
  members. Each member has four needs that decay per day — Nourish 118, Rest 82, Bond 74, Play 90,
  scaled by metabolism 0.75–1.35 — and you either direct an activity or let them choose. A meal spends
  one ration; a 20-second shift pays 100 credits (Yield, 08–14) or 4 rations and 48 credits (Bloom,
  14–18). Midnight charges the term's rent (80 / 130 / 190 / 260 credits) plus each furnishing's running cost.
- **Progression — seven systems.**
  - The charter. A household holds the habitat on a four-term charter from the Habitat Authority,
    five days a term. Each term pins three goals under the fridge (promote to Adept, furnish a third
    paid station, close debt-free; three Adepts, answer three transmissions, earn 1,500 credits; a close
    pair, ten furnishings, 18 rations; a bonded pair, a Master, 600 credits saved and no debt). Meeting
    two of three passes; each goal met pays a 60-credit grant and a star; a term with fewer is a strike,
    and two strikes evict. Rent rises every term. The Authority's letter reads the term out. Twenty days
    end with the charter kept and graded by stars (Cherished 10+, Welcome 7+, Tolerated).
  - Transmissions. A storyteller (engine `createStoryteller`, RimWorld-style threat points) paces
    fourteen incidents by elapsed time, household wealth and term, with rests after big beats and less
    repetition. Four land on their own (a comet show, a supply cache, a stray signal, an inspection);
    ten wait 45 seconds on an answer with costs and trade-offs — a trader, overtime, a dust storm, a
    brownout, spoiled stores, a traveller asking for food, a quarrel, a fever, a micrometeor that breaks a
    furnishing, a hull leak that halves rest. Each has a default that is always allowed. Broken furnishings
    and the hull are mended from Pantry & bills.
  - Traits. Every being rolls two of twelve traits (Hearty eater, Night owl, Industrious, Green-fingered,
    Gregarious, Loner, Anxious, Serene, Playful, Kind, Handy, Thrifty). They change need decay, stress,
    Yield pay, harvests, bonding and play, and unlock answers — only a Handy being mends for free, only a
    Thrifty one haggles.
  - Posts and rungs. Each being holds one of the household's six jobs as a paid post: Botanist,
    Signal-keeper (both open from the first shift), Forager (3 household standing), Tinkerer (6),
    Archivist (10) and Warden (14, covers either station). Every post has three rungs; a completed
    shift earns one household standing, a missed shift costs one, and rung 2 (3 standing) and rung 3
    (9) are bought in the inspector with standing alone. A post pays its own station 1.00 / 1.15 /
    1.35; a rung-2 or rung-3 being may cover the other station at 0.90 / 1.00. A Master Botanist adds
    a ration to every harvest. A post is also what a being may be ordered to work: the other station
    waits for the cross-trained rung, so a career changes both what work they can take and what they
    are paid.
  - Shift mastery. Each station keeps a per-being shift count (Yield and Bloom track separately)
    that crosses five levels at 1 / 4 / 8 / 12 shifts and adds 5% pay per level above I; the roster
    shows both levels beside the post. Nobody refuses a station for low proficiency — the game's
    fiction is a small cooperative household, so an unskilled shift simply pays less. Three completed
    shifts still unlock the wider 08–18 window.
  - Bonds. Pair relationships run -100 to 100 with milestones at 35 (friends), 70 (close) and 95
    (bonded); tending Bloom together pays more for friends, and two stressed members clash instead.
    Friends and bonded pairs prefer each other's company, so an off-hours stroll walks to a friend
    instead of a random spot ("Keeping X company"). A bonded pair will not split for work: ordering one
    of them to a paid station sends the free partner to the neighbouring station, or the order stops
    with the reason (a different rhythm, a depleted partner, or a missing second station) until fixed.
    The bond also refuses a post change that would put the pair in different station families, so a
    career order never wins over the pair.
    The household panel shows each being's bond (partner and the book's word) and it moves as friends talk.
  - Furnishing. Six types from 70 to 220 credits, capacity 1–4, running cost 1–4 a day, satisfying
    5–12 points a second — so a full household needs duplicates of the same station.
- **Failure states.** Eviction. Two failed terms end the charter, and 300 debt brings the bailiff at once
  (a final notice warns at 150). Below that, an unpaid bill becomes debt, which the next bill repays at up
  to 40; relief supplies 4 rations and adds 40 debt once per day; an empty pantry stops meals, a need
  below 25 pulls a member off whatever they were doing, and overload stops paid work until food, rest and
  company fix it. A balance bot (`src/game/balance.test.ts`) plays whole charters: an absent household
  and one that only buys rations are both evicted on day 11; a steward who promotes, furnishes, answers
  and mends keeps the charter with 9 of 12 goals and no strikes.
- **Minute 5 → hour 5.** At 5:00 you are about a day and a half in: the first bill has settled, one shift
  has been worked and flex scheduling is still two shifts away. Hour five is roughly day 17 at 1× speed
  — the charter is in its last term, rent is 260 a night, a dozen transmissions have been answered, and
  the household is chasing a bonded pair and a Master to finish Cherished rather than Tolerated.
- **References it is chasing.**
  - *The Sims 2* — feel: mood legible from one portrait; density: one household, four bodies, no crowd;
    UI: needs bars beside a direct action queue.
  - *RimWorld* — feel: a schedule that explains itself before you read it; density: a small roster where
    each person is a plan; UI: priorities, bills and the day's work on one screen.
  - *This War of Mine* — feel: scarcity with a tone, not a score; density: few rooms visited repeatedly;
    UI: the nightly summary as the consequence readout.
- **Gap to target.** Broken furnishings have no visual mark in the room yet (the slip and the repairs list
  name them). Beings have traits but no Sims-style wants or lifetime aspirations. Money alone barely
  pressures an idle household — eviction comes from missed goals, not the ledger. After the charter is
  kept, play continues without a next chapter.

Loop proof: to-first-shift, to-transmission
