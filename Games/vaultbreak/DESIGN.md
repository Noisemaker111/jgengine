# Vaultbreak — design

A first-person extraction RPG. You own a vault full of people. You key into other
vaults — dead ones — kill what lives there now, take what you can carry, and get
out. Extract and you keep going. Die and the character ends.

**There are no classes.** Every ability in the game — a fireball, a rifle, a
shield, super speed, a rocket launcher — is an *item you find on something you
killed*. Your class is whatever is in your slots this hour.

**There are no character levels, and nobody goes out but players.** No AI
companion, no hireling, no follower. The only thing that walks into a vault
beside you is a friend, and the only thing that ever brings loot home is a
person. That constraint is load-bearing: it is what lets a veteran and a
first-timer run the same corridor and both have a real time (§20).

Status: design only. No code exists yet. This document is the spec to argue with
before anything gets built.

| | |
| --- | --- |
| **I — The game** | [1 Loop](#1-the-pitch-in-one-loop) · [2 Three rules](#2-the-three-rules-everything-hangs-off) · [3 Fiction](#3-fiction-what-a-vault-is-and-why-they-go-dark) · [4 References](#4-what-the-references-actually-give-us) |
| **II — Systems** | [5 Augs](#5-augs--the-ability-system) · [6 Enemies](#6-enemies-are-the-drop-table) · [7 Slots](#7-slots--the-real-progression) · [8 Wheel](#8-the-talent-wheel) · [9 Death](#9-death-and-the-two-ledgers) |
| **III — Home** | [10 The vault](#10-the-home-vault) · [11 The crew](#11-the-crew-halloway-vesk-and-forty-strangers) · [12 Vault life](#12-vault-life-time-upkeep-and-contamination) · [13 Rituals](#13-rituals-of-departure-and-return) |
| **IV — The world** | [14 Delves](#14-delves) · [15 The radio](#15-the-radio-and-the-vaults-that-are-still-lit) · [16 Revenants](#16-revenants-and-the-nemesis) |
| **V — Meta** | [17 The Ledger](#17-the-ledger) · [18 Feel](#18-first-person-feel) · [19 Finite careers](#19-keeping-careers-finite) · [**20 Playing together**](#20-playing-together-power-bands-squads-and-pvp) · [21 Death spiral](#21-the-death-spiral-and-the-valve) · [22 Economy](#22-economy) · [23 First hour](#23-the-first-hour) · [24 Open questions](#24-open-questions) · [25 Build mapping](#25-if-this-gets-built-here) |

---

# I — The game

## 1. The pitch in one loop

A **Career** spans many delves. It survives extraction and ends at death.

```
HOME VAULT (first person, safe, permanent)
  crew processes what you brought → upgrade facilities → craft a Key → gear up
        │
        ▼
DELVE (you, or up to four of you, instanced, 12–25 min)
  kill things → take the Augs they were using → spend Charge on the wheel
        │
    ┌───┴────┐
    ▼        ▼
 EXTRACT    DIE
    │        │
 keep the   lose the Augs, the rig, the bag,
 whole      the talents, the Charge — the whole
 career     Career. Keep the vault and everyone in it.
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

**Rule 3 — You start every career with one slot.** Talents widen it. Contracts
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
| **Fallout Shelter** | The home base as a persistent, stat-driven second game: named residents, rooms that want specific stats, work that continues while you are logged off. |
| **Dark and Darker** | Extraction as a physical place you must reach, spawning late, one-use. Losing the character is the price of the fantasy. |
| **Marathon (2025)** | Cores and implants as swappable modules that define a build. And **Rook** — a free, no-loadout, no-risk drop-in. That is our anti-death-spiral valve. |
| **Borderlands** | Items as procedural part assemblies from opinionated manufacturers, and the drop that recontextualises everything you were doing. |
| **Binding of Isaac** | Hand-authored rooms shuffled by a graph, not noise. Item *synergies* over item *stats*. Devil-deal power at a permanent cost. And the honest one: a run ends. |

Explicitly **not** taken: classes with fixed kits (Dark and Darker, Marathon),
permanent account-level power growth (Borderlands), Fallout Shelter's
send-dwellers-to-loot-the-wasteland loop (§11 — players are the only source of
loot here), Marathon's PvP-first foundation (§20).

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
spread) or carry it home to the Assay Lab (better roll, biased by the Wit of the
crew member running it). A sealed Relic in your bag is the thing you should die
for.

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
rarely. **Enemy Augs use player numbers** with AI-facing tuning — if it felt
unfair to fight, it will feel great to hold, and that symmetry is both the sales
pitch and, per §20, the reason nothing is ever safe for anybody.

## 7. Slots — the real progression

| Source | Scope | Ceiling |
| --- | --- | --- |
| **Contract chains** | **Anchored — permanent, all future careers** | +2 over the whole game (careers start at 1, then 2, then 3) |
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

**Anchored ledger — never lost.**

- The vault, every facility and its level
- The crew, their stats, and their work in progress
- The stash — *materials only* (see the hard rule)
- **Base slot count** from completed contract chains
- Blueprints, foundry licences, recipes
- The Archive and every small passive it has granted
- Clearance rank; Legacy; cosmetics; the Ledger (§17)

**The hard rule that protects the whole design: Augs and rigs cannot be
stashed.** The vault stores junk, cores, parts, reagents and knowledge — it
stores *potential*, never power. The instant a player can bank a Relic launcher
for next time, death stops mattering and the game unwinds. Every facility in §10
respects this, and so does trade in §15 and §20.

**Two softeners, both costed:**

- **Echo insurance.** Insure one Aug before a delve for a junk fee. If the career
  ends, it is issued to your *next* career at its start — not to the stash. Long
  per-item cooldown. A soft landing, not a savings account.
- **Headstone recovery.** A dead career leaves a headstone: a one-room hostile
  instance, live 24h, seeded where you fell. Your *new* career may enter it — at
  whatever slot count it currently has — and try to take back one item. A friend
  may come with you. Losing a fresh career to your own corpse is a very funny way
  to lose.

---

# III — Home

## 10. The home vault

First person, walkable, quiet, yours. Not a menu with a background. Your crew
lives there, your Archive uniques are on the wall, and the career you just ended
is a name in the Hall of Cycles.

| Facility | Does | Fed by |
| --- | --- | --- |
| **Vault Door** | Insert a Key, form a squad, start or resume a career | — |
| **Armory** | Sets the **Kit**: the Aug you spawn a new career holding. Upgrading widens the *menu*, drawn from your Archive. | Junk + scrap |
| **Assay Lab** | Cracks sealed Augs, rerolls one affix | Junk + reagents |
| **Foundry Bench** | Swap parts between Augs; apply foundry licences | Parts + licences |
| **Cartography** | Craft and modify Keys; shows which archetypes carry which Aug families | Cores |
| **Reliquary** | The Archive; mounted uniques; the Hall of Cycles; the Ledger | — |
| **Barracks** | Crew roster, assignment, training, bunks | Food + beds |
| **Refinery** | Breaks junk down into parts and reagents — the crew's main job | Junk + power |
| **Radio Room** | The world outside: neighbour vaults, contracts, distress calls (§15) | Power |
| **Infirmary** | Treats Hollow exposure and contamination (§12) | Reagents |
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

## 11. The crew: Halloway, Vesk, and forty strangers

**Nobody but a player ever leaves the vault.** The crew does not delve, does not
scavenge, does not run wasteland expeditions, and never brings home a single
piece of loot, gear or junk. Every material in the economy was carried in by a
person, on their back, at risk.

**The crew processes; players acquire.** That is the whole division, and it is a
better base loop than Fallout Shelter's because it means the vault can never
become a second income stream that plays itself. What the crew does with what you
drop on the intake counter:

- **Refine** junk into parts and reagents (the bulk job, gated by Grit)
- **Assay** sealed Augs, with roll quality gated by Wit
- **Craft** rigs, baseline Augs and Keys at the Workshop
- **Maintain** facilities and hold the upkeep bands steady (§12)
- **Cleanse** contamination at the Infirmary, slowly, at a cost

All of it is a **queue with real duration** that keeps running while you are
logged off. You never come back to *new* loot — you come back to *finished
work*. That distinction is what keeps §21's valve alive without breaking the
players-only rule.

**Forty strangers.** The general crew is procedurally generated: name, face,
former job, three stats (**Grit** / **Wit** / **Nerve**), a couple of traits, and
a **vault of origin** they will mention. They arrive as rescues from delves and
as applicants over the radio. You can favourite and rename them. They form
friendships and rivalries that shift morale by who is bunked and assigned next to
whom. They react to what you bring home, to the state of the vault, and to who
did not come back.

They are population, not cast — and that is a deliberate downgrade from an
earlier draft of this document. Forty authored characters is a writing budget
nobody has, and forty *shallow* authored characters is worse than forty good
procedural ones. Attachment here should be emergent and cheap: you will end up
caring about a Records clerk called Ottoline because she has been running your
Assay for thirty hours, not because someone wrote her a questline.

**Two people are written.** They are the vault, they never leave it, and they
cannot die in normal play.

**HALLOWAY** — Steward. Old, dry, practical, here before you were. Runs the
upkeep, knows every pipe, and quietly does not want you going out again. He is
the vault's past and its conscience: he will tell you what the contamination is
doing, what the crew is saying, and which of your habits is going to kill you. He
delivers bad news well.

**VESK** — a runner who came back from Depth 9 and never went out again. Lives in
the Radio Room, tunes frequencies that should not carry, and is visibly a little
Hollowed and entirely honest about it. She knows the Deep. She wants you to go
further, and she is not sure any more whether that is her talking. She is the
vault's future.

Between them they carry the entire story: one wants you to stop, one knows you
will not, and both are right. They react to every career death, every Vaultborne
you hang on the wall, every neighbour vault that goes quiet. Over the long arc
Halloway ages and Vesk gets worse, and the endgame is about that. **Two
characters, unlimited reactivity, a writing budget a small team can actually
afford.**

**Where the emotional weight sits now.** Not on an AI companion who dies — the
game has none. It sits on three things, all cheaper and all more durable: **the
friends who actually came with you** (§20), **Halloway and Vesk**, and **the
Ledger and the nemesis who has your gun** (§16–17).

## 12. Vault life: time, upkeep, and contamination

**The shift clock.** The vault runs three shifts on a compressed real-time cycle.
Coming home on Night shift is a different place: dim corridors, the skeleton
crew, someone eating alone in the mess, Vesk awake in the Radio Room because Vesk
is always awake. Same rooms, different game. Costs almost nothing, buys enormous
atmosphere.

**Upkeep is bands, not chores.** Four meters — **Power, Water, Food, Morale** —
each in a band: *Failing · Thin · Steady · Surplus*. They modulate processing
rate, Assay quality, crew chatter, and the lighting and soundscape of the vault
itself.

They never gate a delve. **The Vault Door always opens.** A management layer that
can stop you from playing the game has become the game, and this one is texture
and stakes, not a chore list.

**Contamination — the Hollow follows you home.** Everything you carry back
carries trace: sealed Augs most, Aberrants worst, rescued survivors a little.
Contamination accumulates and is cleansed at the Infirmary with cores.

At low levels it is only atmosphere — a corridor light that fails and gets fixed,
a crew member who goes quiet for a shift, a sound in the ducts on Night shift
that nobody comments on and Halloway pointedly does not explain. At high levels
crew refuse assignments and processing throughput drops. At maximum: **Breach
Night**, a one-off defence set piece fought inside your own vault, in your own
corridors, against your own crew's frames.

Breach Night is now **the only way a crew member can die**, which is exactly
where the stakes should be concentrated: in one authored, avoidable, entirely
self-inflicted event rather than in idle-loop attrition you cannot watch. Survive
it and the vault is cleansed. Lose and you lose people — never the vault, and
never Halloway or Vesk.

**Ownership.** Junk buys paint, lighting, furniture and mounts. Vaultborne Augs
hang on the Reliquary wall and the crew gathers at a new one. Cheapest "lived in"
per hour of work in the entire project; do not cut it.

## 13. Rituals of departure and return

Games feel real at the seams. Three of them are worth animating properly.

**Departure.** You gear at a physical rack in the locker room — Augs into slots,
Strain bar filling on the wall behind you. Your friends gear at the racks beside
yours, and you can see exactly what they are bringing, which is most of what a
pre-run lobby is for anyway. The Vault Door cycles for six seconds and cannot be
skipped, and you hear it seal behind you. That six seconds is the single most
valuable animation in the game: it is the last moment you own anything.

**Return.** You come back heavy. You physically dump junk onto the intake
counter and the Refinery queue ticks up. Someone comes to look at what you
brought. The Reliquary shelf populates itself while you watch. The first time you
carry home a Vaultborne, the vault gathers.

**The funeral.** A career ending gets a service: the crew who knew you take a
mood hit and a line about the person you were, Halloway says something short and
true, and the name goes on the wall in the Hall of Cycles. Your next career walks
past that wall on the way to the door. Ninety seconds, not a popup, and never
longer.

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
  at the core) · Rescue (extract N survivors, who become crew) · Blueprint (reach
  and hack a terminal)
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
**Residential** (survivors, benches, story, quiet dread) · **Toll** (Aberrant
offer) · **Core** (objective or Herald).

Minimum viable authored content: roughly **60 room prefabs across 3 archetypes**
before the shuffle stops feeling repetitive. Budget for that honestly — it is the
largest content cost in the project and the usual way games in this genre ship
feeling thin. Every prefab must also read and fight correctly with **four bodies
in it** — two entrances minimum, cover in clusters, no single-file chokepoints in
a combat room. That is a hard authoring constraint, not a guideline, and §20 has
the reasoning and the rest of the cost.

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
and the channel takes time you cannot spend fighting. Rescued survivors must be
alive when it completes. Squadmates extract individually: leaving with the loot
while your friend is still three rooms back is possible, and whether you do it is
between the two of you.

## 15. The radio, and the vaults that are still lit

Yours is not the only vault with the lights on. The Radio Room is a physical set
you tune — Vesk is usually already there — and it is how the world proves it
exists without you.

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

That is the single strongest "this world is real" lever in the document, because
it is the only system that gets *worse* if you do nothing and the only one whose
consequences you have to physically walk through afterwards. Use it sparingly —
one such loss per player per long arc, not a treadmill of guilt.

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
- It is also how a mostly-solo player still feels other people in the world, which
  matters more now that nothing else follows you into a vault.

**The nemesis.** Any enemy that ends a career is promoted: it gets a name, a
record, and a permanent place at that depth. It keeps the Aug it took from you.
It shows up again — in your delves, in your friends' — until somebody kills it,
which retires the name and returns what it took.

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
  With:     REEVE (11 delves) · TOLLAND (4) · sponsored SILT to D6 twice
  Ended:    D8, Cold Storage, Collapse phase
            Herald "NINEFOLD", carrying a Brand launcher
            recovered from Career 05.
```

The last two lines are the whole design in a paragraph, and the game assembled
them without a writer. A run history that names the friends you ran with and the
enemy that has been carrying your old gun for two careers is what "lived in"
actually means.

The Hall of Cycles is the physical version: every career, on the wall, in order.

## 18. First-person feel

- **Inventory:** weight + slots, not Tetris. Spatial grids are legible at a desk
  and illegible in a tense first-person moment. Weight governs sprint, jump and
  extraction channel speed, so greed is physical.
- **Aug wheel** is the core input surface: radial select, hold to swap, readable
  at a glance with one slot or seven. The single most important UI in the game
  and the first thing to prototype.
- **Looting is channelled** and audible — a pacing tool and a vulnerability.
- **Sound is the primary intel channel.** Pads, Collapse phases, a friend's
  Kinetic Aug two rooms away, the PA announcing a shift change to a dead room.
- **Enemies read by silhouette plus held Aug.** Per §6 this is a rendering
  requirement, not a nice-to-have: every enemy must visibly wear its drop. The
  same applies to squadmates — you should know what your friend is running by
  looking at them.
- **Solo is genuinely alone.** With no companions, a solo delve has no voice in
  it but the vault's. That is a feature: the game should be quieter, slower and
  more frightening by yourself, and bringing a friend should audibly change the
  texture of a corridor.
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
   sharply, so a career that refuses to go deeper stops growing and every long
   career is necessarily deep in lethal territory. **Patron contracts (§20) are
   the deliberate carve-out** — running shallow with a friend pays anchored
   rewards instead, so the one thing depth pressure must never punish is
   generosity.
4. **Notoriety.** The deeper and longer a career runs, the more the vaults know
   it. Hunters spawn — Stalker frames carrying *your own* Aug families, tuned to
   counter you. Loot rises with it. A great career gets more thrilling and more
   finite at once, and it dies to something that felt personal.
5. **Aberrant costs** are career-scoped, so the strongest Augs shorten the career
   that holds them.

The number to hold ourselves to: **best possible loadout beats a fresh one-slot
career by roughly 5×, not 50×.**

**Legacy** is the one thin permanent thread: earned by career milestones —
deepest Clearance, first-time Archive entries, contract chains, players
sponsored — and spent only on the vault. It buys floor, never a stat.

## 20. Playing together: power bands, squads, and PvP

The requirement: a player a thousand hours in and a player on their first night
run the same corridor, and it feels right for both. The veteran does not get
nerfed into a wet noodle. The newcomer does not get one-shot or reduced to a
spectator. **The enemies are the same enemies for both of them.**

Nine rules get us there, and none of them scale a number to a player.

**0. There is no character level, and the veteran is regularly a beginner.**
Nothing in this game multiplies your damage by a rank. "Level 1000" means
Clearance 10 and a mature career — and per §9 that career is one bad corridor
from being a one-slot career again. The power curve is already flattened by
permadeath in a way no MMO's ever is. Half of this problem solves itself.

**1. The power budget is 5×, and it is a hard constraint, not an aspiration.**
Everything from slot 1 to slot 7 with Relics has to fit inside a five-fold swing
in effective output. In an FPS that is roughly the distance between a starting
pistol and a good rifle — a gap two friends play across in every shooter ever
made without noticing. Every tuning and content decision is checked against this
budget. If a build breaks it, the build is the bug.

**2. Enemies never scale to who is shooting them.** No per-attacker health, no
hidden difficulty band, no rubber-banding. A Warden at Depth 4 is the same Warden
for everyone in the room. This is non-negotiable: the moment bullets do different
things for different people, both players stop trusting the game.

**3. One squad, one depth.** The Key sets depth for everybody. A veteran running
Depth 2 with a friend finds Depth 2 easy — exactly as easy as it is when he
solos Depth 2, which is the correct and honest answer. He is over-geared for the
content, not scaled against his friend.

**4. Loot rolls per player, against that player's own Clearance.** Same corpse,
two different rewards, no shared pool, nothing to argue over. The newcomer's
drops roll near their tier so a Depth 8 carry does not hand them a Relic they
cannot slot; the veteran's roll against his. Friend groups never have a loot
fight, ever.

**5. You can be carried to riches, never to depth.** Clearance advances **one
tier at a time**, and only by completing an objective at your *own* current tier.
A veteran can sponsor a friend into Depth 8 and that friend will come out richer
and better-equipped — but their Clearance still moves one step, earned. Gear is
shareable progress; access is not. This is the guard rail that keeps a boosted
player from standing at the endgame with no idea how anything works.

**6. Notoriety makes the veteran the target.** §19's Notoriety already tracks how
deep and how long a career has run, and enemies preferentially hunt the
highest-Notoriety player in the room. **The veteran is the aggro magnet, by
mechanic and by fiction** — the vault knows him and has been waiting. That is
what makes a newcomer survivable at Depth 8 without softening a single enemy:
the vault is busy with the person it recognises. It also makes his accumulated
power the literal thing that shields his friend, which is the best version of
this fantasy.

**7. Objectives reward bodies, not damage.** Cache Hunt, Rescue and Blueprint all
scale with headcount and hands rather than DPS. A one-slot player at Depth 8
cracks caches, carries survivors, hacks terminals, revives, and watches a
corridor — all of which the objective actually needs. Nobody should ever be
cargo.

**8. Enemy Augs use player numbers (§6), so nothing is ever safe.** The veteran
one-shots Husks — of course he does, he does that solo too, and that is allowed.
But a Titan carrying Relic gear is running *his* numbers back at him, and a
Herald is dangerous to a thousand-hour player for exactly the reason it is
dangerous to a beginner. Content stays lethal because content is armed with the
same catalogue you are.

**9. The stakes are asymmetric even when the power is not.** A veteran forty
hours into a career is risking forty hours. His friend is risking twenty minutes.
The strong player is the scared player, the new player is the reckless one, and
that inversion produces better co-op conversation than any balance patch could.

**Patron contracts** close the incentive loop. A veteran needs a reason to run
shallow that is not charity, so the Radio Room offers contracts that pay **only
in anchored currency** — Legacy, foundry licences, Archive access, crew
applicants, cosmetics — for completing a delve alongside a lower-Clearance
player. His career power does not grow (§19.3 still applies), but his *vault*
does. The two-ledger split earns its keep here: there is a whole category of
reward that cannot inflate a build.

**What it actually feels like.**

*Veteran runs Depth 2 with a first-timer.* He is comfortable and she is not. He
clears rooms fast, she loots them, and the danger she feels is real because the
Wardens are real Wardens — he is just better at them than she is, visibly, in a
way she can see herself becoming. He is there for a Patron contract and to watch
her find her second Aug. Nobody was scaled.

*First-timer sponsored to Depth 8.* Everything in the vault wants him
specifically, and she is running behind him cracking caches with a pistol and
one slot. It is the most frightening twenty minutes she has had and she is
useful the whole time. She comes out with gear that outclasses anything at her
tier — and Clearance 2, because you do not get to skip Depth 3. And the whole run
he was the one sweating, because he had thirty hours on the line and she had
none.

**Squad size: 1–4. Decided, and locked before room authoring begins.** Four is
what a friend group actually is, and a co-op game that cannot seat the fourth
friend loses that group entirely. Four bodies do not fit a first-person shooter
for free, though, so the cost is paid explicitly in five places:

1. **Room geometry.** Every combat prefab needs **two entrances minimum** and a
   fighting floor that four people can spread across without a conga line.
   Doorways widen, cover comes in clusters of three-plus rather than single
   pillars, and the minimum combat-room footprint goes up roughly 40% over a
   three-body layout. Corridors stay tight on purpose — that is where four
   becomes a liability, and it should.
2. **Loot density scales sublinearly.** Caches per delve go as roughly
   `1 + 0.6 × (squad − 1)`, so four players find more in total and less each.
   Combined with per-player rolls (rule 4), a full squad is a social choice and
   a mild efficiency loss, never the optimal farming configuration.
3. **Enemy packs scale by count and composition, never by individual strength.**
   Rule 2 holds absolutely: the Warden is the same Warden. What changes at four
   is how many of them and how many elites are mixed in, resolved once at
   insert.
4. **Revives need a real cost or four bodies makes death optional.** Reviving is
   a long, loud, stationary channel; a downed player's bleed-out clock does not
   pause for it; and each player can be revived **twice per delve**, after which
   downed means dead and the career ends. Four people should mean four chances
   to make a mistake, not immortality.
5. **Extraction pads are squad-capacity in PvE and single-use in Breach.** A
   four-stack cannot be forced to extract one at a time in normal play. In
   Breach, being forced to is the whole point.

Solo remains fully supported and separately tuned: vault size, pack count and
cache density all scale down with headcount, so a one-player Depth 6 is a
smaller, quieter, more frightening vault rather than a four-player vault with
three people missing.

**PvP: opt-in, as a Key modifier.** The **Breach Key** opens your instance to
other squads. Doubles loot, makes pads single-use, and lets you take the Augs off
a career you just ended. Killing another player ends *their* career and creates a
Revenant with your name in its Ledger entry. That should be heavy, and rare.

Building PvP-first means every system is hostage to netcode, matchmaking,
anti-cheat and balance-by-committee before the game is playable at all. As a Key
modifier, **the entire game ships and is fun with zero PvP**, and §16's Revenants
already deliver most of the "other players are out there" feeling for none of the
cost. Note also that rules 2–9 above are tuned for *co-operative* mixed bands;
Breach deliberately abandons that fairness, which is exactly why it is a modifier
a player chooses rather than the default.

**No auction house, no market, no currency trading.** Trading is squad-only,
in-vault, hand to hand, and only for materials — never Augs (§9).

## 21. The death spiral, and the valve

Losing a career must not lose the player. Five countermeasures:

1. **Scav Key** (Marathon's Rook). Always free, always available. Fixed body, one
   fixed Aug, capped bag, nothing to lose.
2. **The Kit.** A new career always spawns holding something you chose.
3. **The floor moves.** Contract-granted base slots, Archive passives and
   facility levels mean career #12 starts materially better-equipped than #1,
   with no stat inflation.
4. **The work queue keeps running.** Your crew is still refining the junk you
   already hauled, still finishing an Assay, still building a rig. The night your
   career dies, tomorrow already has *finished work* in it — not new loot, which
   only players can get, but the processed value of the last thing you did right.
5. **The vault is still there and still needs you.** This is the real answer. A
   player who loses everything still has forty people, Halloway with an opinion
   about it, a contract from Cassin, a wall to hang something on, and a nemesis
   with their launcher. The management layer is not a side dish; it is the reason
   a bad night ends with "one more" instead of a refund request.

## 22. Economy

Three currencies, no gold. Every unit of all three entered the world on a
player's back.

- **Junk** — bulk trash. Refined into parts and reagents; feeds facilities,
  decoration and cleansing. Deliberately heavy, so hauling junk competes with
  hauling Augs.
- **Cores** — mid-rare. Keys, cleansing, Workshop crafting. The gate on how often
  you choose your run.
- **Charge** — the wheel only, career-scoped, deleted on death.

## 23. The first hour

Teach three rules, one slot, and a reason to care, with no tutorial voice:

| Minutes | Beat |
| --- | --- |
| 0–5 | Wake in your vault. Small, lit, half-staffed. Halloway is fixing something and does not stop to greet you properly. Walk the ring. The Vault Door is the only thing that is obviously important. |
| 5–8 | Locker room. One Aug in the rack — a battered Kessler sidearm. The game never says "slot 1 of 1"; the rack has one hook and six empty ones. |
| 8–20 | Depth 1, Habitation, Cache Hunt. Husks only. The PA is running. You find a bunk with a name plate. You kill a Husk holding a *hammer* and it drops the hammer, and the hook lands without a line of text: **that is how you get things.** |
| 20–24 | You can hold the hammer **or** the sidearm. Not both. This is the moment the game explains itself. |
| 24–30 | Extract. Dump junk on the intake counter; the Refinery queue starts ticking. Spend first Charge: **Second Socket** is visible, expensive, two delves away. |
| 30–45 | Second delve, Rescue objective. You carry someone out. She has a name, a former job, an opinion about your vault, and by tomorrow she is running your Refinery. |
| 45–60 | The Radio Room lights up. Vesk is already in there and has been listening to Cassin call for two days. The contract chain that ends in permanent slot 2 begins. Somewhere in here, first death — cheap at one slot, teaching the rule for almost nothing. |

Afterwards the player should be able to explain the whole game to a friend — and
should want to, because the next beat is bringing that friend along.

## 24. Open questions

Honest gaps, priority order:

1. **Does losing the whole wheel land as tragedy or as tedium?** Isaac gets away
   with it because a run is 40 minutes; ours is potentially 20 hours. §19's
   Notoriety and §16's nemesis exist so a career ends at a dramatic peak against
   something that felt personal, but that is theory until it is played. Riskiest
   assumption in the document.
2. **Can the 5× power budget actually hold?** §20 rests entirely on it. Seven
   slots of Relics with Resonance seams firing is exactly the situation where a
   designer's 5× quietly becomes 30×, and every mixed-band promise in this
   document dies with it. Needs a build calculator before content authoring, not
   after.
3. **Is one starting slot too thin for the first hour?** §23 bets the constraint
   *is* the hook. If playtests disagree, move permanent slot 2 into the first
   session rather than starting at two.
4. **Does four bodies flatten the horror?** Squad size is settled at 1–4 (§20)
   and the geometry cost is priced in, but the remaining risk is tonal, not
   mechanical: a vault that is genuinely frightening solo may be a comedy with
   four people in it. Levers if it goes that way, in order of preference —
   tighten the revive economy further, separate the squad by design (objectives
   that need two rooms at once), and lean the Collapse phase harder on isolating
   players rather than on spawning more enemies. Do not fix it by making a
   four-stack weaker; that breaks rule 2.
5. **Does Notoriety-driven aggro (§20.6) read as fair or as cheating?** Being
   hunted specifically is great fiction and might feel awful in practice for the
   veteran who just wanted a quiet run with a friend. Test whether it needs a
   ceiling.
6. **Vault management competing with the shooter.** If upkeep, contamination,
   assignment and decoration together cost more than five minutes a session, the
   game has two halves that resent each other. Bands-not-chores (§12) is the
   guard rail; watch it.
7. **How much authored room content is the real minimum?** 60 is an estimate. If
   it is 200, the project shape changes.
8. **Aug library size.** Enemy variety is downstream of Aug count. Guess: **~50
   Augs across six families**.
9. **Losing a neighbour vault (§15) may just feel bad.** Designed as one
   memorable arc, not a system; if it reads as a punish-the-player timer it should
   become a scripted one-time story beat.
10. **Server authority cost.** Instanced PvE co-op with an authoritative host is
    tractable; Breach is a different problem. Revenants are asynchronous and cheap
    and should carry the multiplayer feeling until PvE ships.

## 25. If this gets built here

| System | Owner |
| --- | --- |
| Room prefabs, archetype tilesets, dressing, the home vault itself | **`jgengine-editor`** — authored into `editor.scene.json`; the graph pass composes authored prefabs. No hardcoded geometry or coordinate arrays. |
| Vault graph generation, movement, enemy AI, Notoriety threat targeting, interaction, hazards | **`jgengine-world`** |
| Augs as abilities, damage, ammo, cooldowns, enemy Aug assembly, per-player drop rolls | **`jgengine-combat`** |
| Career state, Charge, wheel, slots/Strain, crew roster, processing queue, facilities, upkeep bands, shift clock, save | **`jgengine-gameplay`** — serializable state, injected RNG |
| Aug wheel, HUD, inventory, character room, talent circle, Radio Room, the Ledger | **`jgengine-ui`** |
| Squads, sponsorship and Clearance gating, instance authority, Breach, Revenant distribution | **`jgengine-multiplayer`** |

Reusable seams this pushes upstream, per the build-capability-upstream invariant
— all genre-agnostic, all otherwise handrolled game-locally:

- **Procedural item assembly** — frame + parts + affixes + rarity
- **Shared ability sockets** — one primitive where an NPC's equipped ability set
  *is* its behaviour set *is* its drop table
- **Radial talent graph** — rings, spokes, adjacency gating
- **Risk-ledger state** — at-risk vs. anchored partitions, atomic commit on
  extract
- **Per-player reward rolls** — one kill, N independent reward resolutions
  against each observer's own progression tier, so mixed-power co-op never needs
  a shared loot pool
- **Roster and work queue** — named NPCs with stats, assignment and a durable
  offline processing queue, usable by any game with a base and a crew
- **Asynchronous ghost distribution** — a dead player state re-entering other
  players' worlds as content

First slice should be the Aug wheel, one archetype, and §6's enemy assembly —
that trio is the game. Everything in Parts III and IV turns the game into a
place, and none of it should start before that trio is fun.

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
