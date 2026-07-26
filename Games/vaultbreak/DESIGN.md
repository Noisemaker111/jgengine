# Vaultbreak — design

A first-person extraction RPG. You own a vault full of people. You key into other
vaults — dead ones — kill what lives there now, take what you can carry, and get
out. Extract and you keep going. Die and the character ends.

**There are no classes.** Every ability in the game — a fireball, a rifle, a
shield, super speed, a rocket launcher — is an *item you find on something you
killed*. Your class is whatever is in your slots this hour.

Status: design only. No code exists yet. This document is the spec to argue with
before anything gets built.

| | |
| --- | --- |
| **I — The game** | [1 Loop](#1-the-pitch-in-one-loop) · [2 Three rules](#2-the-three-rules-everything-hangs-off) · [3 Fiction](#3-fiction-what-a-vault-is-and-why-they-go-dark) · [4 References](#4-what-the-references-actually-give-us) |
| **II — Systems** | [5 Augs](#5-augs--the-ability-system) · [6 Enemies](#6-enemies-are-the-drop-table) · [7 Slots](#7-slots--the-real-progression) · [8 Wheel](#8-the-talent-wheel) · [9 Death](#9-death-and-the-two-ledgers) |
| **III — Home** | [10 The vault](#10-the-home-vault) · [11 Dwellers](#11-dwellers-are-the-emotional-centre) · [12 Vault life](#12-vault-life-time-upkeep-and-contamination) · [13 Rituals](#13-rituals-of-departure-and-return) |
| **IV — The world** | [14 Delves](#14-delves) · [15 The radio](#15-the-radio-and-the-vaults-that-are-still-lit) · [16 Revenants](#16-revenants-and-the-nemesis) |
| **V — Meta** | [17 The Ledger](#17-the-ledger) · [18 Feel](#18-first-person-feel) · [19 Finite careers](#19-keeping-careers-finite) · [20 Squads and PvP](#20-solo-squads-and-the-pvp-decision) · [21 Death spiral](#21-the-death-spiral-and-the-valve) · [22 Economy](#22-economy) · [23 First hour](#23-the-first-hour) · [24 Open questions](#24-open-questions) · [25 Build mapping](#25-if-this-gets-built-here) |

---

# I — The game

## 1. The pitch in one loop

A **Career** spans many delves. It survives extraction and ends at death.

```
HOME VAULT (first person, safe, permanent)
  assign dwellers → upgrade facilities → craft a Key → start or resume a Career
        │
        ▼
DELVE (solo or 1–3 squad, instanced, 12–25 min)
  kill things → take the Augs they were using → spend Charge on the wheel
        │
    ┌───┴────┐
    ▼        ▼
 EXTRACT    DIE
    │        │
 keep the   lose the Augs, the rig, the bag,
 whole      the talents, the Charge — the whole
 career     Career. Keep the vault and everything in it.
    │        │
    └───┬────┘
        ▼
  HOME VAULT — resume the career, or start a new one at slot 1
```

Target cadence: **12–25 min** in a vault, **3–5 min** turnaround at home. A career
worth bragging about is 10–40 delves and takes a week of evenings to build.

## 2. The three rules everything hangs off

**Rule 1 — Every active ability is loot.** Guns, spells, powers, shields,
melee: all the same kind of object, all found, none learned. There is no
spellbook, no class kit, no unlock screen.

**Rule 2 — Everything active goes in the same kind of slot.** A fireball and a
rocket launcher compete for the same socket. "Fireball *and* a gun" is a real
decision with a real cost, which is what makes it feel earned.

**Rule 3 — You start every career with one slot.** Talents widen it. Quests
permanently raise the floor. A career is the story of going from one slot to
seven and then losing it.

Everything below is machinery for those three.

## 3. Fiction: what a vault is, and why they go dark

Nobody remembers the surface. The vaults were built to outlast it — sealed,
self-sufficient, a few hundred people each and a mandate. They were meant to last
a thousand years.

Most of them went dark.

What takes a vault is called **the Hollow**. It does not kill people. It
*continues* them. A Hollowed vault is still running: security still walks its
route, hydroponics still cycles, the choir still sings at shift change, the doors
still seal at curfew. Everyone is still at their post. They just are not anyone
any more, and they will kill you for standing in the corridor.

This single idea does an enormous amount of work:

- **It explains why enemies carry Augs.** They are not monsters. They are staff.
  A Warden has a rifle and a shield because a Warden always had a rifle and a
  shield.
- **It makes every enemy a piece of environmental storytelling** without writing
  a word of it. §6's roster is a staff directory.
- **It makes rescue mean something.** A handful of residents in every vault have
  not gone over yet. They are hiding, and they have been hiding a long time.
- **It aims the whole game at one dread.** Your vault is lit, staffed, and
  sealed. It is also, on a long enough timeline, next.

**The Deep.** Vaults are strung together by rail at depth. Deeper means older —
built by people who knew more, sealed earlier, dark longer. Depth 10 is not
"harder numbers", it is *older*, and whatever the Hollow actually is, the answer
is down there. Depth is the story.

**Why the Archive is the point.** Nothing has ever outlasted a vault except what
somebody wrote down and carried out. That is the thematic justification for the
whole ledger split in §9: your character is temporary, your knowledge is not.
The Archive is not a completion screen. It is the only form of immortality the
setting offers.

## 4. What the references actually give us

| Source | The one thing we take |
| --- | --- |
| **Vault Hunters 3rd Ed.** | The *Key*: a craftable, modifiable run token that sets theme, objective, difficulty and loot multiplier before you insert. Plus sealed gear you carry home to open. |
| **Fallout Shelter** | The home base as a persistent, stat-driven, *idle-productive* second game. Dwellers with stats, rooms that want specific stats, offline expeditions that pay out while you are logged off. |
| **Dark and Darker** | Extraction as a physical place you must reach, spawning late, one-use. Losing the character is the price of the fantasy. |
| **Marathon (2025)** | Cores and implants as swappable modules that define a build. And **Rook** — a free, no-loadout, no-risk drop-in. That is our anti-death-spiral valve. |
| **Borderlands** | Items as procedural part assemblies from opinionated manufacturers, and the drop that recontextualises everything you were doing. |
| **Binding of Isaac** | Hand-authored rooms shuffled by a graph, not noise. Item *synergies* over item *stats*. Devil-deal power at a permanent cost. And the honest one: a run ends. |

Explicitly **not** taken: classes with fixed kits (Dark and Darker, Marathon),
permanent account-level power growth (Borderlands), Fallout Shelter's
tap-to-collect monetisation shape, Marathon's PvP-first foundation (§20).

---

# II — Systems

## 5. Augs — the ability system

An **Aug** is any equippable active. One category, six families:

| Family | Examples | Feels like |
| --- | --- | --- |
| **Arms** | rifles, SMGs, launchers, bows | Ammo, reloads, recoil |
| **Edge** | swords, hammers, gauntlets, whips | Stance, momentum, parry timing |
| **Focus** | fireball, chain arc, frost lance, unmaking | Cast time, charge, channel |
| **Ward** | bubble shield, deflect plate, phase skin | Uptime and cooldown windows |
| **Kinetic** | super speed, flight, blink, leap, ironhide | Movement as a weapon |
| **Field** | turrets, totems, gravity wells, healing pools | Placement and zoning |

They all occupy **the same slot type**. This is the whole point. A veteran with
seven slots running *rocket launcher + fireball + flight + bubble shield + sword +
turret + blink* is not a class, is not a build archetype anyone designed, and is
exactly the promise.

**Anatomy.** Aug = **Frame** + 2–4 **Parts** + rolled **Affixes** + **Rarity**.
Parts come from opinionated Foundries and are swappable at home (§10), so a bad
drop is a component rather than trash.

| Foundry | Identity | Cost |
| --- | --- | --- |
| **Kessler** | Volume, cheap ammo, forgiving | Awful at range |
| **Orrery** | Aether-conductive — makes Focus and Ward Augs sing | Weak unless paired with another Orrery piece |
| **Brand** | Enormous damage | Self-harm, overheat, recoil that hurts you |
| **Hallow** | Hybrids: gunblades, spell-swords, bayonets | Neither half is best-in-class |
| **Meridian** | Kinetic and utility, extraction tech | Low raw damage |
| **Preserve** | Ward, Field, healing, squad support | Almost no solo carry |

**Rarity:** Salvage · Standard · Marked · Sealed · Relic · **Vaultborne**.

**Sealed** Augs drop unidentified. Crack one in the field (instant, worse roll
spread) or carry it home to the Assay Lab (better roll, biased by your assigned
dweller's Wit). A sealed Relic in your bag is the thing you should die for.

**Aberrant** Augs come from **Toll Rooms** and are the Devil Deal: genuinely
overpowered, each with a permanent-for-the-career cost — a slot burned, a hard
health cap, permanent visibility to enemy AI, one fewer extraction pad every
delve. Aberrants cannot be unequipped. Taking one changes what career this is.

**Vaultborne** uniques are hand-authored, one per vault archetype, with a scripted
behaviour instead of a stat line. These are the screenshots people post.

## 6. Enemies are the drop table

Because Rule 1 says abilities are loot, the enemy roster and the ability roster
are the same roster. **Enemies are assembled exactly like players are: a Frame
plus Augs.** What an enemy is holding is what it fights you with, and what it
fights you with is what it drops.

Per §3, each frame is a job the vault used to need:

| Frame | Was | Role | Typical Augs |
| --- | --- | --- | --- |
| **Husk** | General population | Chaff, swarms | 1 low-tier Arm or Edge |
| **Warden** | Vault security | Line-holder, armored | 1 Arm + 1 Ward |
| **Steward** | Maintenance | Zoner, repairs its own kind | 1 Field + 1 Arm |
| **Choirman** | The morale office — every vault had one, and they always go first | Caster, backline | 2 Focus |
| **Stalker** | A runner. Sent to another vault. Came back carrying it. | Flanker, fast | 1 Kinetic + 1 Edge |
| **Titan** | A runner who took too many Augs, a long time ago | Elite, room-boss | 3 Augs + a modifier |
| **Herald** | The Overseer. The one who sealed the door. | Named objective boss | Vaultborne |

The Stalker and the Titan are the two that should make a player quiet. They did
what you do. One of them is why this vault is like this.

Four things fall out of assembling enemies this way:

1. **Perfect telegraphing.** You see the fireball on the Choirman's arm before it
   casts. You know how the fight goes *and* what the reward is, at a glance, in
   first person. Threat-read and loot-lust are the same read.
2. **Hunting is a real verb.** Want a launcher? Ordnance-biased archetypes have
   Wardens carrying them. Want flight? The Choir's Stalkers have it. Vault
   archetype is a shopping list, and Cartography (§10) tells you which.
3. **Difficulty and reward move together automatically.** An enemy that got
   scarier got scarier by carrying something better. No separate tuning pass.
4. **Content scales with the Aug library, not a monster budget.** Every new Aug
   is also a new enemy behaviour.

**Rules that keep it honest:** an enemy drops one of its visible Augs, never all
of them, at a rarity roll below its own. Elites drop with certainty; chaff
rarely. Enemy Augs use player cooldowns and player numbers with AI-facing tuning
— if it felt unfair to fight, it will feel great to hold, and that symmetry is
the sales pitch.

## 7. Slots — the real progression

| Source | Scope | Ceiling |
| --- | --- | --- |
| **Quest / contract chains** | **Anchored — permanent, all future careers** | +2 over the whole game (careers start at 1, then 2, then 3) |
| **Talent wheel — Capacity spoke** | **Career — lost on death** | +3 or so, expensive, deep in the spoke |
| **Rig chassis** | **Career — lost with the rig** | +1 to +2, at a Strain cost |

A first-ever career runs **one** slot. A late-game player starts every career at
**three**. A great career peaks around **seven**, then ends.

**Strain.** Slots say how many; Strain says how good. Your rig has a Strain
budget and every equipped Aug costs Strain by rarity and tier. Seven slots does
not mean seven Relics — it means seven things you could afford to carry at once.
This is the primary anti-power lever and a knob we can turn per patch without
touching content.

**Swapping.** Augs swap at any **Bench** (found in Residential rooms) or
instantly with the Kinesis talent. What you are not carrying rides in the bag,
and the bag dies with you.

## 8. The talent wheel

**Talents are career-scoped. You lose them when you die.** They are not a second
ability system — they are the layer that says how much you can carry, how hard it
hits, how fluidly you use it, and what happens when two Augs touch.

Charge accrues in a delve, levels the career, and buys nodes. Extract and you
keep it. Die and it is gone. **No banking, no conversion tax** — extraction
itself is the save.

```
                    CAPACITY
                        │
         FORTUNE ───────┼─────── MASTERY
                    ╲   │   ╱
                     ╲  ●  ╱          ● = the Spark (centre, free nodes)
                      ╲   ╱
                VITALITY ─── KINESIS

  rings, centre → rim:  Initiate · Adept · Master · Apex
```

| Spoke | Governs | Sample nodes |
| --- | --- | --- |
| **Capacity** | Slots, Strain budget, carry weight, swap speed | Second Socket, Overclock, Deep Pockets, *Apex:* **Wide Load** — one extra slot that ignores Strain |
| **Mastery** | Potency of whatever is equipped; refining and tiering Augs | Amplify, Refine, Overtune, *Apex:* **Ascend** — permanently raise one Aug a rarity tier |
| **Kinesis** | Movement, use-while-moving, cooldowns, reloads, recharge | Fluid Cast, Sprint-Reload, Momentum, *Apex:* **Untethered** — every Aug usable airborne and sprinting |
| **Vitality** | Health, shields, sustain, revive, downed resistance | Ironbone, Second Wind, Leech, *Apex:* **Refusal** — one death per delve becomes a downed state |
| **Fortune** | Loot quality, cache detection, seal cracking, extraction speed, junk yield | Diviner, Pry, Fast Hands, *Apex:* **Prospect** — Sealed drops roll one tier higher |

Note what is absent: no fire spoke, no gun spoke, no melee spoke. Damage type is
loot's job. The wheel never gives you a power — it decides what you can do with
the powers you found.

**Resonance seams.** Between every pair of adjacent spokes sit nodes requiring
points in both. This is where two equipped Augs start talking, and it is the
Isaac lesson: synergy over stats.

- Capacity × Mastery → **Harmonic**: each empty slot buffs your filled ones
- Mastery × Kinesis → **Cascade**: a kill with one Aug refunds another's cooldown
- Kinesis × Vitality → **Kinetic Barrier**: any movement Aug grants a shield
- Vitality × Fortune → **Tithe**: cracking a cache heals; looting cleanses
- Fortune × Capacity → **Field Rig**: an eighth slot usable only by something
  found *this delve*

Five spokes means five seams, and the geometry teaches you that Capacity and
Mastery talk while Capacity and Vitality do not — you go round the rim or through
the centre. That adjacency is the reason for a circle instead of a tree.

**The Spark** (centre) is free, cheap, generic — health, loot speed, revive
speed. A one-slot fresh career needs somewhere to put its first point
immediately.

**Respec** is free at the vault between delves. Experimentation is content, and
punishing it in a game that already deletes your character is piling on.

## 9. Death, and the two ledgers

**Run ledger — lost on death.** The whole character.

- Every equipped Aug and everything in the bag
- The rig: chassis, armor, trinkets
- **Every talent point and the entire wheel**
- Unspent Charge and the career level
- The career's Notoriety, streak and record — it closes and gets a headstone
- **Any dweller who was in the delve with you** (§11 — this is the one that hurts)

**Anchored ledger — never lost.**

- The vault, every facility and its level
- The dweller roster back home, their stats, bonds and histories
- The stash — *materials only* (see the hard rule)
- **Base slot count** from completed contract chains
- Blueprints, foundry licences, recipes
- The Archive and every small passive it has granted
- Clearance rank; Legacy; cosmetics; the Ledger (§17)

**The hard rule that protects the whole design: Augs and rigs cannot be
stashed.** The vault stores junk, cores, parts, reagents and knowledge — it
stores *potential*, never power. The instant a player can bank a Relic launcher
for next time, death stops mattering and the game unwinds. Every facility in §10
respects this.

**Two softeners, both costed:**

- **Echo insurance.** Insure one Aug before a delve for a junk fee. If the career
  ends, it is issued to your *next* career at its start — not to the stash. Long
  per-item cooldown. A soft landing, not a savings account.
- **Headstone recovery.** A dead career leaves a headstone: a one-room hostile
  instance, live 24h, seeded where you fell. Your *new* career may enter it — at
  whatever slot count it currently has — and try to take back one item. Losing a
  fresh career to your own corpse is a very funny way to lose.

---

# III — Home

## 10. The home vault

First person, walkable, quiet, yours. Not a menu with a background. Your dwellers
live there, your Archive uniques are on the wall, and the career you just ended
is a name in the Hall of Cycles.

| Facility | Does | Fed by |
| --- | --- | --- |
| **Vault Door** | Insert a Key, form a squad, start or resume a career | — |
| **Armory** | Sets the **Kit**: the Aug you spawn a new career holding. Upgrading widens the *menu*, drawn from your Archive. | Junk + scrap |
| **Assay Lab** | Cracks sealed Augs, rerolls one affix | Junk + reagents |
| **Foundry Bench** | Swap parts between Augs; apply foundry licences | Parts + licences |
| **Cartography** | Craft and modify Keys; shows which archetypes carry which Aug families | Cores |
| **Reliquary** | The Archive; mounted uniques; the Hall of Cycles; the Ledger | — |
| **Barracks** | Dweller roster, assignment, training, bonds, idle expeditions | Food + beds |
| **Radio Room** | The world outside: neighbour vaults, contracts, distress calls (§15) | Power |
| **Infirmary** | Heals wounded dwellers; treats Hollow exposure (§12) | Reagents |
| **Workshop** | Craft rigs and baseline Augs from stashed parts — always below field-drop quality | Parts + cores |

**The Armory is the interesting one.** It cannot give you a Relic. What it can do
is let you *choose* your one starting Aug from the families you have archived.
Starting a career with a fireball instead of a pistol is enormous for how the
first ten minutes play, and costs nothing in power. That is the shape every
facility must have: **facilities raise the floor and never the ceiling.**

**Layout.** Facilities ring a central atrium with the Vault Door at one end and
the Reliquary at the other, so the walk from "I am back" to "I am going again"
passes the trophies and the dead. Budget the full loop at ~60 seconds of walking,
not five minutes. Sprinting at home is allowed and slightly rude.

## 11. Dwellers are the emotional centre

This is the most important section in the document, because it is the answer to
"how does a game where you lose everything still make me care".

**Dwellers are anchored, but they can die.** They are the only thing in the game
that is both permanent and losable. Everything else is either safe forever (the
vault) or doomed anyway (the career). A dweller is the one thing you can
genuinely, irreversibly lose through your own bad decision — and that is
precisely why they, not your loot, are what the game is actually about.

**They are people, not stats.**

- A name, a face, a voice, and a **vault of origin** — the vault you pulled them
  out of, which they remember and will talk about.
- A **former job** (Steward, Warden, Choir, Hydroponics, Records) that biases
  their stats, their facility affinity, and their companion role. Yes: the jobs
  are the same list as the enemy frames in §6. That is the point. You are
  rescuing the people who would otherwise have become Wardens.
- Three stats: **Grit** (labour, defence), **Wit** (analysis, crafting),
  **Nerve** (risk, exploration).
- A **Bond** with you that grows by delving together and unlocks dialogue,
  better companion behaviour, and eventually a personal request.

**They come with you.** One companion by default, two with a Barracks upgrade.

- They occupy none of *your* Aug slots. They carry **their own**, which you hand
  them from a career's surplus. This is the one narrow exception to §9's
  no-stashing rule and it is safe because a dweller's kit is **bonded to that
  dweller**: you can never reclaim it, they cannot lend it back, and it dies with
  them. Arming your companion is spending an Aug, not banking one — and it is
  the only thing you can do with a Relic you have no slot for.
- They talk. Ambient lines about the archetype, the loot you just picked up, the
  build you are running, each other. A Records dweller reads the terminals aloud.
  A former Warden tells you where security would have put the cameras.
- They can be downed and carried. They can be left behind. **If you die in a
  delve, the dweller with you dies too.** That is the real cost of a career
  ending, and it is the one loss the vault cannot replace.

**They live at home.** Assigned to facilities (high Wit in the Assay Lab, Grit in
the Armory, Nerve in Cartography), or sent on idle expeditions while you are
logged off — junk, cores, parts and rumours, at real risk. They form friendships
and rivalries that shift morale by who is assigned next to whom. They react to
what you bring home, to the state of the vault, and to who did not come back.

**Retirement.** A dweller who survives many delves becomes a **Veteran** with a
title. You may retire them: they stop being deployable and permanently improve
one facility, and they keep walking around the vault. Retiring someone you have
run thirty delves with — trading a friend for a bonus so they do not die out
there — is a better decision than most games ever ask for.

**Funerals.** When a career ends, the vault holds a service. The dwellers who
knew you get a mood hit and a line about the person you were. The names of the
dwellers who died with you go on the wall in the Hall of Cycles, next to your
career's name. Your next career walks past that wall on the way to the door.

## 12. Vault life: time, upkeep, and contamination

**The shift clock.** The vault runs three shifts on a compressed real-time cycle.
Coming home on Night shift is a different place: dim corridors, the skeleton
crew, someone eating alone in the mess, the Radio Room unattended. Same rooms,
different game. This costs almost nothing and buys enormous atmosphere.

**Upkeep is bands, not chores.** Four meters — **Power, Water, Food, Morale** —
each sitting in a band: *Failing · Thin · Steady · Surplus*. They modulate
production rate, idle-expedition success, dweller chatter, and the lighting and
soundscape of the vault itself.

They never gate a delve. **The Vault Door always opens.** A management layer that
can stop you from playing the game is a management layer that has become the
game, and this one is texture and stakes, not a chore list.

**Contamination — the Hollow follows you home.** Everything you bring back
carries trace: sealed Augs most, Aberrants worst, returning dwellers a little.
Contamination accumulates in the vault and is cleansed at the Infirmary with
cores.

At low levels it is only atmosphere — a corridor light that fails and gets fixed,
a dweller who goes quiet for a shift, a sound in the ducts on Night shift that
nobody comments on. At high levels dwellers start refusing assignments and
production drops. At maximum: **Breach Night**, a one-off defence set piece
fought inside your own vault, in your own corridors, against your own dwellers'
frames. Survive it and the vault is cleansed; lose and you lose dwellers, not the
vault.

This is the best sink in the economy because it is thematically load-bearing:
the safe place is only conditionally safe, and it is your own greed that makes it
less so. It also gives Depth-10 Aberrant hoarding a real cost that is not a stat
penalty.

**Ownership.** Junk buys paint, lighting, furniture and mounts. Vaultborne Augs
hang on the Reliquary wall and dwellers gather at a new one. This is the cheapest
"lived in" per hour of work in the entire project and it should not be cut.

## 13. Rituals of departure and return

Games feel real at the seams. Three of them are worth animating properly.

**Departure.** You gear at a physical rack in the locker room — Augs into slots,
Strain bar filling on the wall behind you. The dweller you are taking is already
waiting by the door with their kit. The Vault Door cycles for six seconds and
cannot be skipped, and you hear it seal behind you. That six seconds is the
single most valuable animation in the game: it is the last moment you own
anything.

**Return.** You come back heavy. You physically dump junk onto the intake
counter. A dweller comes to look at what you brought. The Reliquary shelf
populates itself while you watch. The first time you carry home a Vaultborne, the
vault gathers.

**The funeral.** §11. Do not skip it, do not let it be a popup, and do not let it
be longer than ninety seconds.

---

# IV — The world

## 14. Delves

**Keys.** Crafted at Cartography, consumed on insert, and they fully determine
the run:

- **Depth** (1–10) — enemy tier, Aug tier, gated by Clearance. Depth is age (§3).
- **Archetype** — *Hydroponics, Cold Storage, The Choir, Reactor Deck,
  Habitation, The Long Hall.* Sets tileset, enemy frames, hazard, music, **and
  which Aug families you will find**, because the enemies are the drop table.
- **Objective** — Elimination · Cache Hunt · Awakening (survive escalating waves
  at the core) · Rescue (extract N dwellers) · Blueprint (reach and hack a
  terminal)
- **Modifiers** — negatives you *choose* for a loot multiplier: no minimap,
  doubled density, halved pads, elemental affliction, a hunter that tracks you. A
  **Cursed Key** is a stack of them.

Objective completion is the only source of next-tier Keys and of Clearance. You
cannot rat-loot your way down.

**Generation: authored rooms, procedural graph.** Isaac's lesson, not noise.

1. A graph pass lays out nodes to a budget: 1 entry, 8–16 loot rooms, 2–4
   objective rooms, 1 core, 3+ extraction pads, 1–3 secrets behind conditions (a
   Kinesis talent, a key item, a wall a heavy Edge Aug can break).
2. A room pass fills each node from a hand-authored prefab set for the archetype,
   then dresses it: enemy packs assembled per §6, cache placement, hazards,
   lighting, ambient story.

Room kinds: **Cache** · **Arena** · **Environmental** (hazard/traversal) ·
**Residential** (dwellers, benches, story, quiet dread) · **Toll** (Aberrant
offer) · **Core** (objective or Herald).

Minimum viable authored content: roughly **60 room prefabs across 3 archetypes**
before the shuffle stops feeling repetitive. Budget for that honestly — it is the
largest content cost in the project and the usual way games in this genre ship
feeling thin.

**The dead vault should read as a place people lived.** Cheap, high-yield
dressing, all of it procedural placement over authored props: name plates on
bunks, a shift roster on the wall with the same names you keep seeing, a
half-finished meal, children's drawings in Habitation, a barricade built from the
inside, a room somebody sealed themselves into. And the audio: a PA system still
running its automated shift announcements to nobody. **Every archetype gets one
running system that never noticed everyone died.** That is the whole horror of
the setting in one ambient loop.

**Collapse, not a countdown.** Three phases, each with a visible and audible
transition:

| Phase | What changes |
| --- | --- |
| **Quiet** | Full map. Standard enemies. Pads dormant. |
| **Stirring** | Pads activate. Frames upgrade a tier. Un-looted caches upgrade a rarity tier. |
| **Collapse** | Rooms seal from the perimeter inward. Titans spawn. Caches upgrade again. Half the pads go dark. |

Un-looted loot getting *better* as the vault gets *worse* is what makes staying a
genuine temptation rather than a math error.

**Extraction.** Pads are physical, announce themselves audibly across the level,
and the channel takes time you cannot spend fighting. Carried dwellers must be
alive when it completes.

## 15. The radio, and the vaults that are still lit

Yours is not the only vault with the lights on. The Radio Room is a physical set
you tune, and it is how the world proves it exists without you.

**What is on the air.** Four to six named living vaults, each with an identity,
an inventory and a way of talking — *Cassin* (agricultural, generous, naive),
*Ossuary Nine* (records-obsessed, will trade knowledge only), *Foreman's Rest*
(industrial, mercenary, sells parts), *the Wick* (a single surviving Overseer who
should not still be broadcasting). Between them: automated loops from vaults that
died decades ago, still cheerfully announcing shift change.

**They ask you for things.** Contracts come from people, not a job board:
supplies, an escort, a Blueprint recovered from a specific archetype, a search
for someone's brother. Contract chains are where the **permanent slot unlocks**
in §7 live, so the two anchored progressions in the game both come from other
people needing you.

**They can go dark, permanently.** A vault that broadcasts distress and gets
ignored across enough real days goes quiet. Then, weeks later, it appears in your
Cartography as a delve archetype — and you can walk in and loot the corpse of a
place you knew, and meet the voice you used to talk to wearing a Herald frame.

That mechanic is the single strongest "this world is real" lever in the document,
because it is the only system that gets *worse* if you do nothing, and the only
one whose consequences you have to physically walk through afterwards. Use it
sparingly — one such loss per player per long arc, not a treadmill of guilt.

**Trade** is junk, parts, cores, reagents, blueprints and rumours. **Never
Augs** — a market for Augs is a stash with extra steps, and §9's hard rule holds
everywhere.

## 16. Revenants and the nemesis

**Every career that ends stays in the world.** Yours, and other players'.

A dead career becomes a **Revenant**: a Stalker-frame enemy carrying that
career's final loadout, appearing at the depth it died at, dropping exactly one
of its Augs. Per §3 the fiction is already there — it is a runner who did not
make it home and got continued.

- It is asynchronous. No netcode, no matchmaking, no lobby. Careers ending
  everywhere quietly restock the world's enemy population with real, weird,
  player-assembled builds that no designer would have made.
- Your *own* Revenants can find you. Killing one returns an Aug it was carrying —
  a warmer, more legible version of headstone recovery, and a genuinely eerie
  encounter the first time you round a corner into a thing wearing your last
  face.

**The nemesis.** Any enemy that ends a career is promoted: it gets a name, a
record, and a permanent place at that depth. It keeps the Aug it took from you.
It shows up again — in your delves, in your squadmates' — until somebody kills
it, which retires the name and returns what it took.

Two runs later, "Ninefold is down there with my launcher" is a sentence a player
says out loud, and that sentence is worth more than any quest text we could
write.

---

# V — Meta

## 17. The Ledger

The game writes your career down, because §3 says writing things down is the only
thing that lasts. Terse, factual, in vault-terminal type, readable in the
Reliquary and exportable as a card:

```
CAREER 07 — Runner "Wick"          22 delves · deepest D8 · 41h
  Kit:      Kessler sidearm (Armory tier 3)
  Peak:     7 slots · Apex "Untethered" · Strain 88%
  Firsts:   Vaultborne "Long Sunday" (D6, The Choir)
            Contract chain "Cassin Relief" complete → base slot 3
  Losses:   Dweller MARA VOSS (Hydroponics, Cassin) — D7, Cold Storage
  Ended:    D8, Cold Storage, Collapse phase
            Herald "NINEFOLD", carrying a Brand launcher
            recovered from Career 05.
```

The last two lines are the whole design in a paragraph, and the game assembled
them without a writer. A run history that names the dweller you got killed and
the enemy that has been carrying your old gun for two careers is what "lived in"
actually means.

The Hall of Cycles is the physical version: every career, on the wall, in order,
with its dead.

## 18. First-person feel

- **Inventory:** weight + slots, not Tetris. Spatial grids are legible at a desk
  and illegible in a tense first-person moment. Weight governs sprint, jump and
  extraction channel speed, so greed is physical.
- **Aug wheel** is the core input surface: radial select, hold to swap, readable
  at a glance with three slots or seven. The single most important UI in the game
  and the first thing to prototype.
- **Looting is channelled** and audible — a pacing tool and a vulnerability.
- **Sound is the primary intel channel.** Pads, Collapse phases, another squad
  looting, a Kinetic Aug firing, the PA announcing a shift change to a dead room.
- **Enemies read by silhouette plus held Aug.** Per §6 this is a rendering
  requirement, not a nice-to-have: every enemy must visibly wear its drop.
- **Character screen is a room**, not an overlay: paperdoll, Strain bar, the
  wheel on the wall, the Archive behind you, the Hall of Cycles down the corridor.
- **Accessibility.** Because sound carries intel, every audio cue needs a visual
  redundancy (directional damage/pad/phase indicators) or the game is unplayable
  deaf. Rarity must not be colour-only — shape and material carry it too. Aim
  assist, FOV, motion and channel-hold-vs-toggle are all settings, and the
  Collapse phase clock is generous enough that reaction time is never the gate.

## 19. Keeping careers finite

With talents on the run ledger, the balance risk is one unbroken 200-delve
career. Five levers:

1. **Strain** caps simultaneous power regardless of slot count (§7).
2. **One Apex.** However many rim capstones you unlock, exactly one may be
   active. Your ceiling is a per-delve choice.
3. **Depth pressure.** Charge and loot from content below your Clearance decay
   sharply. A career that refuses to go deeper stops growing, so every long
   career is necessarily deep in lethal territory. Self-correcting.
4. **Notoriety.** The deeper and longer a career runs, the more the vaults know
   it. Hunters spawn — Stalker frames carrying *your own* Aug families, tuned to
   counter you. Loot rises with it. A great career gets more thrilling and more
   finite at once, and it dies to something that felt personal.
5. **Aberrant costs** are career-scoped, so the strongest Augs shorten the career
   that holds them.

The number to hold ourselves to: **best possible loadout beats a fresh one-slot
career by roughly 5×, not 50×.**

**Legacy** is the one thin permanent thread: earned by career milestones —
deepest Clearance, first-time Archive entries, contract chains, dwellers retired
alive — and spent only on the vault. It buys floor, never a stat.

## 20. Solo, squads, and the PvP decision

**Recommendation: PvE-primary, opt-in PvP as a Key modifier.**

- Squads of **1–3**, plus companions (§11), so a solo player is never actually
  alone in a corridor. Vault size, density and cache count are set at insert from
  squad size. Loot scales sublinearly, so solo is more loot-per-player and far
  more risk.
- **Breach Key.** Opens your instance to other squads. Doubles loot, makes pads
  single-use, and lets you take the Augs off a career you just ended. Killing
  another player ends *their* career and creates a Revenant with your name in its
  Ledger entry. That should be a heavy thing, and it should be rare.

Building PvP-first means every system is hostage to netcode, matchmaking,
anti-cheat and balance-by-committee before the game is playable at all. As a Key
modifier, **the entire game ships and is fun with zero PvP**, and §16's Revenants
already deliver most of the "other players are out there" feeling with none of
the cost.

**No auction house, no market, no currency trading.** Trading is squad-only,
in-vault, hand to hand.

## 21. The death spiral, and the valve

Losing a career must not lose the player. Five countermeasures:

1. **Scav Key** (Marathon's Rook). Always free, always available. Fixed body, one
   fixed Aug, capped bag, nothing to lose.
2. **The Kit.** A new career always spawns holding something you chose.
3. **The floor moves.** Contract-granted base slots, Archive passives and
   facility levels mean career #12 starts materially better-equipped than #1,
   with no stat inflation.
4. **Idle dwellers** pay junk while you are offline, so the night your career
   dies, tomorrow already has something in it.
5. **The vault is still there and still needs you.** This is the real answer.
   A player who loses everything still has forty people, a contract from Cassin,
   a wall to hang something on, and a nemesis with their launcher. The management
   layer is not a side dish; it is the reason a bad night ends with "one more"
   instead of a refund request.

## 22. Economy

Three currencies, no gold.

- **Junk** — bulk trash. Feeds facilities, decoration and cleansing.
  Deliberately heavy, so hauling junk competes with hauling Augs.
- **Cores** — mid-rare. Keys, cleansing, Workshop crafting. The gate on how often
  you choose your run.
- **Charge** — the wheel only, career-scoped, deleted on death.

## 23. The first hour

The onboarding has to teach three rules, one slot, and a reason to care, without
a tutorial voice. Beat sheet:

| Minutes | Beat |
| --- | --- |
| 0–5 | Wake in your vault. It is small, lit, half-staffed. Walk it. Three dwellers, names, one of them talks to you. The Vault Door is the only thing that is obviously important. |
| 5–8 | Locker room. One Aug in the rack — a battered Kessler sidearm. One slot. The game never says "slot 1 of 1"; the rack has one hook and six empty ones. |
| 8–20 | Depth 1, Habitation, Cache Hunt. Husks only. The PA is running. You find a bunk with a name plate. You kill a Husk holding a *hammer* and it drops the hammer, and the hook in your head — *that is how you get things* — lands without a line of text. |
| 20–24 | You can hold the hammer **or** the sidearm. Not both. This is the moment the game explains itself. |
| 24–30 | Extract. Dump junk on the counter. A dweller comes to look. Spend first Charge at the wheel: **Second Socket** is visible, expensive, and two delves away. |
| 30–45 | Second delve. Rescue objective. You carry someone out. She has a name, a former job, and an opinion about your vault. |
| 45–60 | Radio Room lights up: Cassin is calling. The contract chain that ends in permanent slot 2 begins. Somewhere in here, first death — cheap, at one slot, teaching the rule for almost nothing. |

The design goal of that hour: the player should be able to explain the entire
game to a friend afterwards, and should already have one name they do not want
to lose.

## 24. Open questions

Honest gaps, priority order:

1. **Does losing the whole wheel land as tragedy or as tedium?** Isaac gets away
   with it because a run is 40 minutes; ours is potentially 20 hours. §19's
   Notoriety and §11's dwellers exist so a career ends at a dramatic peak with
   something worth mourning, but that is theory until it is played. Riskiest
   assumption in the document.
2. **Is one starting slot too thin for the first hour?** §23 bets that the
   constraint *is* the hook. If playtests disagree, the fix is to move permanent
   slot 2 into the first session rather than to start at two.
3. **Companion death may be too cruel.** Losing a career and a friend in the same
   second could read as punitive rather than tragic. Possible softener: a
   companion is *downed and captured*, recoverable from a rescue delve, and only
   dies if you leave them. Test both.
4. **Vault management competing with the shooter.** If upkeep, contamination,
   assignment and decoration together cost more than five minutes a session, the
   game has two halves that resent each other. Bands-not-chores (§12) is the
   guard rail; watch it in testing.
5. **How much authored room content is the real minimum?** 60 is an estimate. If
   it is 200, the project shape changes.
6. **Aug library size.** Enemy variety is downstream of Aug count, so a thin
   library is a thin bestiary. Guess: **~50 Augs across six families**.
7. **Losing a neighbour vault (§15) may just feel bad.** It is designed as one
   memorable arc, not a system; if it reads as a punish-the-player timer it
   should become a scripted one-time story beat instead.
8. **Server authority cost.** Instanced PvE co-op with an authoritative host is
   tractable; Breach is a different problem. Revenants are asynchronous and cheap
   and should carry the multiplayer feeling until PvE ships.

## 25. If this gets built here

| System | Owner |
| --- | --- |
| Room prefabs, archetype tilesets, dressing, the home vault itself | **`jgengine-editor`** — authored into `editor.scene.json`; the graph pass composes authored prefabs. No hardcoded geometry or coordinate arrays. |
| Vault graph generation, movement, enemy AI, companion AI, interaction, hazards | **`jgengine-world`** |
| Augs as abilities, damage, ammo, cooldowns, enemy Aug assembly, drop tables | **`jgengine-combat`** |
| Career state, Charge, wheel, slots/Strain, dwellers, facilities, upkeep bands, shift clock, save | **`jgengine-gameplay`** — serializable state, injected RNG |
| Aug wheel, HUD, inventory, character room, talent circle, Radio Room, the Ledger | **`jgengine-ui`** |
| Squads, instance authority, Breach, Revenant distribution | **`jgengine-multiplayer`** |

Reusable seams this pushes upstream, per the build-capability-upstream invariant
— all genre-agnostic, all otherwise handrolled game-locally:

- **Procedural item assembly** — frame + parts + affixes + rarity
- **Shared ability sockets** — one primitive where an NPC's equipped ability set
  *is* its behaviour set *is* its drop table
- **Radial talent graph** — rings, spokes, adjacency gating
- **Risk-ledger state** — at-risk vs. anchored partitions, atomic commit on
  extract
- **Roster primitive** — named NPCs with stats, bonds, assignment, idle tasking
  and permadeath, usable by any game with a base and a crew
- **Asynchronous ghost distribution** — a dead player state re-entering other
  players' worlds as content

First slice should be the Aug wheel, one archetype, and §6's enemy assembly —
that trio is the game. Everything in Parts III and IV is what turns the game into
a place, and none of it should be started before that trio is fun.

Before code lands: a `[FEATURE]` issue per vertical slice, and a `CREDITS.md`
entry recording the six lineages in §4.

---

## References

- [Vault Hunters Official Wiki](https://wiki.vaulthunters.gg/Main_Page) · [Skills](https://vault-hunters.fandom.com/wiki/Skills) · [Vault Hunters 3](https://vault-hunters.fandom.com/wiki/Vault_Hunters_3)
- [Fallout Shelter rooms](https://fallout.fandom.com/wiki/Fallout_Shelter_rooms) · [Dwellers](https://fallout-archive.fandom.com/wiki/Vault_dwellers_(Fallout_Shelter)) · [Wasteland exploration](https://gamerant.com/fallout-shelter-best-tips-for-exploring-wasteland/)
- [Dark and Darker extraction](https://www.thegamer.com/dark-and-darker-extraction-guide/) · [Escape portals](https://gamerant.com/dark-and-darker-how-to-extract-escape/)
- [Marathon Runner shells and abilities](https://kotaku.com/marathon-runner-shells-trailer-abilities-bungie-2000660170) · [Class list](https://gamerant.com/bungie-marathon-game-full-list-of-confirmed-classes-comparison/)
- [Borderlands weapon parts](https://borderlands.fandom.com/wiki/Borderlands_2_Weapons) · [BL4 licensed parts](https://www.sportskeeda.com/esports/what-licensed-parts-system-borderlands-4)
- [Isaac level generation](https://www.boristhebrave.com/2020/09/12/dungeon-generation-in-binding-of-isaac/) · [Rebirth wiki](https://bindingofisaacrebirth.fandom.com/wiki/Level_Generation)
