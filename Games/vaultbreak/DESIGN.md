# Vaultbreak — design

A first-person extraction RPG. You live in one of the last lit vaults. You dive
into dead ones, take what you can carry, and get out before the place finishes
printing enough bodies to stop you.

**There are no classes.** Every ability in the game — a rifle, a fireball, a
shield, super speed, a rocket launcher — is a **Module**: a lootable object, all
competing for the same sockets. Your class is whatever is socketed this hour.

**Nobody goes out but players.** No AI companion, no hireling, no follower. The
only thing that walks into a vault beside you is a friend, and the only thing
that ever brings loot home is a person.

**You die, you get reprinted.** The printer at home makes you a new body. It does
not carry your gear, your level, or your talents. It carries nothing but you.

Status: design only. No code exists yet. This document is the spec to argue with
before anything gets built.

| | |
| --- | --- |
| **I — The game** | [1 Loop](#1-the-pitch-in-one-loop) · [2 Rules](#2-the-rules-everything-hangs-off) · [3 Fiction](#3-fiction-the-printers-never-stopped) · [4 References](#4-what-the-references-give-us) |
| **II — Systems** | [5 Modules](#5-modules) · [6 Equipment and resources](#6-equipment-and-resources) · [7 Enemies](#7-enemies-are-the-drop-table) · [8 XP and the wheel](#8-xp-levels-and-the-talent-wheel) · [9 Death](#9-death-and-reprinting) |
| **III — Home** | [10 Stations](#10-the-home-vault-and-its-stations) · [11 Homefolk](#11-homefolk) · [12 Vault life](#12-vault-life) |
| **IV — The dive** | [13 Keys and generation](#13-keys-and-vault-generation) · [14 Mission shape](#14-the-shape-of-a-dive-quiet-alarm-beacon-driller) · [15 Salvage](#15-salvage) · [16 The radio](#16-the-radio) |
| **V — Meta** | [17 The log](#17-the-log) · [18 Feel](#18-first-person-feel) · [19 Playing together](#19-playing-together) · [20 Death spiral](#20-the-death-spiral-and-the-valve) · [21 First hour](#21-the-first-hour) · [22 Open questions](#22-open-questions) · [23 Build mapping](#23-if-this-gets-built-here) |

---

# I — The game

## 1. The pitch in one loop

A **Life** is one printed body. It survives extraction and ends at death.

```
HOME VAULT (first person, safe, permanent)
  homefolk work the salvage → upgrade stations → craft a Key → gear up
        │
        ▼
DIVE (you, or up to four of you, instanced, 15–25 min)
  quiet: explore, loot, kill patrols
  crack the objective → ALARM → the printers spin up
  reach the beacon → defend it → the Driller comes down → board
        │
    ┌───┴────┐
    ▼        ▼
 EXTRACT    DIE
    │        │
 keep the   lose the modules, the equipment, the cache,
 whole      the talents, the level — the whole Life.
 Life       Keep the vault and everyone in it.
    │        │
    └───┬────┘
        ▼
  HOME VAULT — dive again, or get reprinted at level 1 with nothing
```

Target cadence: **15–25 min** in a vault, **3–5 min** turnaround at home. A Life
worth bragging about is 10–40 dives.

## 2. The rules everything hangs off

**Rule 1 — Every active ability is loot.** Guns, spells, powers, shields, melee:
all Modules, all found, none learned. No spellbook, no class kit, no unlock
screen.

**Rule 2 — All Modules compete for the same sockets.** A fireball and a rocket
launcher want the same hole. "Fireball *and* a gun" is a real decision with a
real cost, which is what makes it feel earned.

**Rule 3 — You start every Life with one socket.** Better equipment and talents
widen it. Contracts permanently raise the floor.

**Rule 4 — Enemies are built like you are.** Same modules, same numbers. What an
enemy is visibly holding is how it fights and what it drops.

## 3. Fiction: the printers never stopped

The vaults kept their people alive by printing them. Sealed underground, no
surface to bury anyone in, so when you died your vault ran you off again from
pattern — same body, same issued kit, back to your post by second shift.

Then the vaults went dark, one at a time, and the printers **kept running**.

Centuries of that. Every print taken from the last print, every copy a little
worse than the copy before it, for so long that what walks a dead vault now is
the four-hundredth generation of a maintenance tech who died before anyone's
grandmother was born. They still wear the kit. They still walk the route. They
are not anyone any more, and they will kill you for standing in the corridor.

This one idea carries the entire game:

- **It explains why enemies carry Modules.** The print includes the loadout. A
  security officer prints holding a rifle because a security officer always held
  a rifle.
- **It explains why they never run out.** Trip the alarm and the vault does what
  it was built to do in an emergency: it *makes more staff*. Fast. Forever. You
  cannot win that fight, only leave it (§14).
- **It explains rarity.** Everything down there is a copy of a copy. An item's
  quality is literally which generation it is (§5).
- **It explains you.** Your vault's printer still works and still has your
  pattern. That is why you can afford to die, and why you come back with
  nothing — the pattern is a body, not a life.
- **It aims the whole game at one dread.** Your printer is a machine. Machines
  drift. Every vault down there was once a vault like yours with a printer like
  yours.

**The Deep.** Vaults are strung together by rail. Deeper means older — sealed
earlier, printing longer, more generations from the original. Depth 10 is not
"bigger numbers", it is *further from the truth*, and it is where the first
prints are.

## 4. What the references give us

| Source | The one thing we take |
| --- | --- |
| **Vault Hunters 3rd Ed.** | The *Key*: a craftable, modifiable token that sets where you go, how deep, and how bad it gets. |
| **Fallout Shelter** | The home base as a persistent second game: named residents, rooms that want specific stats, work that continues while you are logged off. |
| **Dark and Darker** | Extraction as a place you must physically reach. Losing the character is the price of the fantasy. |
| **Marathon (2025)** | Swappable modules as the whole of build identity. And a free, no-loadout, no-risk drop-in as the anti-death-spiral valve. |
| **Borderlands** | Items as procedural part assemblies from opinionated manufacturers, and the drop that recontextualises everything. |
| **Binding of Isaac** | Hand-authored rooms shuffled by a graph, not noise. Synergies over stats. And the honest one: a run ends. |

Explicitly **not** taken: classes with fixed kits, permanent account-level power
growth, send-your-villagers-to-loot-the-map idle loops, and a PvP-first
foundation (§19).

---

# II — Systems

## 5. Modules

A **Module** is any equippable active. One category, six families:

| Family | Examples | Runs on | Feels like |
| --- | --- | --- | --- |
| **Arms** | rifles, SMGs, launchers, bows | Ammo | Mags, reloads, recoil |
| **Edge** | swords, hammers, gauntlets, whips | Stamina | Stance, momentum, parry timing |
| **Focus** | fireball, chain arc, frost lance | Mana | Cast time, charge, channel |
| **Ward** | bubble shield, deflect plate, phase skin | Heat | Uptime, overheat, vent windows |
| **Kinetic** | super speed, flight, blink, leap | Stamina | Movement as a weapon |
| **Field** | turrets, totems, gravity wells, healing pools | Heat | Placement and zoning |

That resource column is the real balance system, and §6 explains why.

**Anatomy.** Module = **Pattern** + 2–4 **Parts** + rolled **Affixes** +
**Generation**. Parts come from opinionated makers and are swappable at home, so
a bad drop is a component rather than trash.

| Maker | Identity | Cost |
| --- | --- | --- |
| **Kessler** | Volume, cheap ammo, forgiving | Awful at range |
| **Orrery** | Makes Focus and Ward modules sing | Weak unless paired with another Orrery part |
| **Brand** | Enormous damage | Self-harm, overheat, recoil that hurts you |
| **Corvin** | Hybrids: gunblades, spell-swords, bayonets | Neither half is best-in-class |
| **Meridian** | Kinetic and utility | Low raw damage |
| **Preserve** | Ward, Field, healing, squad support | Almost no solo carry |

**Generation is the rarity ladder, and it is literal.** Everything in a dead
vault is a copy of a copy, so an item's quality is how many prints it is from the
original:

| Gen | Called | Where |
| --- | --- | --- |
| 5+ | **Worn** | Everywhere, shallow |
| 4 | **Common** | Everywhere |
| 3 | **Clean** | Uncommon; deeper |
| 2 | **Proof** | Rare; deep, on elites |
| 1 | **Firstprint** | The original. Hand-authored, named, one per archetype. Scripted behaviour, not a stat line. |
| — | **Misprint** | Off-ladder. See below. |

Nobody has to be taught this ladder. "It's a third-gen rifle" explains itself,
and it is the only rarity system I know of where the fiction *is* the mechanic.

**In the case.** Better modules drop still sealed in their issue case. Crack one
in the field for a worse roll spread, or carry it home for a better roll. A
cased Proof in your cache is the thing you should die for.

**Misprints** come out of printers that have gone properly wrong, and they are
the devil deal: genuinely overpowered, each with a permanent-for-the-Life cost —
a socket burned, a hard health cap, permanent visibility to enemies, no beacon
call. Misprints cannot be unsocketed. Taking one changes what Life this is.

## 6. Equipment and resources

**Seven equipment slots.** Head · Chest · Legs · Boots · Ring · Ring · Neck.

Equipment is not a power number. It does three jobs:

1. **It carries your sockets.** A piece has 0–2 module sockets. Your total socket
   count is the sum, and that is the single most valuable stat in the game. A
   fresh print wears one socket. A good Life ends up around seven.
2. **It sizes your resource pools** — Health, Stamina, Mana, Heat capacity, and
   carry weight.
3. **It carries affixes** — the ordinary RPG layer: resistances, reload speed,
   cast speed, vent rate, salvage yield.

**Resources are the balance system.** There is no abstract power budget. Instead,
every module family draws on a different pool, and your seven pieces of equipment
cannot max all four pools at once:

| Pool | Spent by | Recovers by |
| --- | --- | --- |
| **Stamina** | Edge, Kinetic, sprint, heavy carry | Time, fast |
| **Mana** | Focus | Time, slow; or on-kill affixes |
| **Ammo** | Arms | Not at all in the field — mags come off the dead and out of stockrooms |
| **Heat** | Ward, Field | Venting, which is loud and stationary |

This is why a fireball *and* a rocket launcher is a real build rather than a free
lunch. You can socket both. But the gear that gives you the mana to keep casting
is not the gear that gives you the ammo capacity to keep firing, and a hybrid
runs dry on both halves before a specialist runs dry on one. **Specialisation is
the cap, and it is a cap players already understand from every RPG they have
played.**

Four pools also means four different rhythms in a fight, which is most of what
makes a mixed build fun to play rather than merely legal.

**Where sockets come from:**

| Source | Scope |
| --- | --- |
| Equipment | Lost with the Life |
| Talent wheel — Capacity spoke | Lost with the Life |
| Contract chains | **Permanent — every future Life starts with them** |

## 7. Enemies are the drop table

Because Rule 1 says abilities are loot, the enemy roster and the module roster
are the same roster. **Enemies are assembled exactly like you: equipment plus
modules.** Everything in a dead vault is a **print** of somebody who worked
there:

| Print | Was | Role | Typically carries |
| --- | --- | --- | --- |
| **Hand** | General population | Chaff, swarms | 1 low-gen Edge or Arm |
| **Guard** | Vault security | Line-holder, armored | Arm + Ward |
| **Fitter** | Maintenance | Zoner, repairs the others | Field + Arm |
| **Chorister** | The morale office — every vault had one | Caster, backline | 2 Focus |
| **Runner** | Sent to another vault. Came back. | Flanker, fast | Kinetic + Edge |
| **Overrun** | A print that came out of a printer that never stopped | Elite, room-boss | 3 modules, all wrong |
| **First** | An early, near-perfect print of whoever ran this place | Named objective boss | Firstprint module |

**Five things fall out of this:**

1. **Perfect telegraphing.** You see the fireball on the Chorister's arm before it
   casts. Threat-read and loot-lust are the same read.
2. **Hunting is a real verb.** Want a launcher? Some vaults' Guards carry them.
   The archetype is a shopping list, and the map station tells you which.
3. **Difficulty and reward move together.** Something scarier got scarier by
   carrying something better. No separate tuning pass.
4. **Content scales with the module library, not a monster budget.** Every new
   module is a new enemy behaviour too.
5. **The alarm can print anything.** Wave composition during §14's alarm is just
   a spawn table over the same assembly system, so escalation is a data change,
   not new content.

**Rules that keep it honest:** a print drops one of its visible modules, never
all, at a generation roll worse than its own. Elites drop with certainty; chaff
rarely. **Enemy modules use player numbers**, so an Overrun holding Proof gear is
dangerous to anybody — which is exactly why nothing is ever safe, at any level
(§19).

## 8. XP, levels, and the talent wheel

Plain RPG progression, with one twist: **it belongs to the Life, not the
account.**

- Kills, objectives, first-time rooms, cracked stockrooms and rescues give **XP**.
- XP gives **Levels**. Levels give **talent points**. Level 1 to roughly 40 across
  a good Life.
- Extract and you keep all of it. Die and it is gone with everything else. There
  is no banking step and no conversion tax — **extracting is the save**.

A circle. Five spokes, four rings.

```
                    CAPACITY
                        │
         FORTUNE ───────┼─────── MASTERY
                    ╲   │   ╱
                     ╲  ●  ╱          ● = the centre, free nodes
                      ╲   ╱
                VITALITY ─── KINESIS

  rings, centre → rim:  I · II · III · Apex
```

| Spoke | Governs | Sample nodes |
| --- | --- | --- |
| **Capacity** | Sockets, pool sizes, carry weight, swap speed | Second Socket, Deep Pockets, Reserve, *Apex:* **Wide Load** — a socket that costs no equipment |
| **Mastery** | Potency of what is socketed; refining and upgrading modules | Amplify, Refine, Overtune, *Apex:* **Restore** — permanently raise one module a generation |
| **Kinesis** | Movement, use-while-moving, cooldowns, reloads, vent rate | Fluid Cast, Sprint-Reload, Momentum, *Apex:* **Untethered** — every module usable airborne and sprinting |
| **Vitality** | Health, regeneration, revives, downed resistance | Ironbone, Second Wind, Leech, *Apex:* **Refusal** — one death per dive becomes a downed state |
| **Fortune** | Loot quality, stockroom detection, case-cracking, salvage yield | Diviner, Pry, Fast Hands, *Apex:* **Prospect** — cased drops roll a generation better |

No fire spoke, no gun spoke, no melee spoke. Damage type is loot's job. The wheel
never gives you a power — it decides what you can do with the powers you found.

**Seams.** Between every pair of adjacent spokes sit nodes requiring points in
both. This is where two socketed modules start talking to each other:

- Capacity × Mastery → **Harmonic**: each empty socket buffs your filled ones
- Mastery × Kinesis → **Cascade**: a kill with one module refunds another's cooldown
- Kinesis × Vitality → **Barrier**: any movement module grants a shield
- Vitality × Fortune → **Tithe**: cracking a stockroom heals
- Fortune × Capacity → **Field Kit**: an extra socket usable only by something
  found *this dive*

**Respec** is free at home between dives. Punishing experimentation in a game
that already deletes your character is piling on.

## 9. Death and reprinting

**Lost with the Life:**

- Every socketed module and everything in the **cache** (your bag)
- All seven pieces of equipment
- Every talent point and the whole wheel
- Your level and XP

**Kept, always:**

- The vault, every station and its level
- The homefolk, their stats, and their work in progress
- The store — *materials only* (see the hard rule)
- **Permanent socket count** from completed contract chains
- Blueprints, maker licences, recipes
- The Index (every module you have ever brought home, and the small permanent
  bonus each first-time entry grants)
- Keys you have earned the right to craft; standing; cosmetics; the Log (§17)

**The hard rule that protects the whole design: modules and equipment cannot be
stored.** Home holds salvage, parts, patterns and knowledge — it holds
*potential*, never power. The instant a player can bank a Proof launcher for next
time, death stops mattering and the game unwinds. Every station in §10 respects
this, and so does trade in §16.

**Reprinting.** Death is not a menu. You wake on the printer table at home, and
Halloway is already there because he always is. The printer gives you a body and
the Armorer gives you whatever the shop can currently issue — which is the one
thing that improves permanently, with salvage, over the whole game (§10).

**One softener, costed.** Before a dive you may put one module **on the plate**
for a salvage fee. If the Life ends, the printer runs that module for your next
one. Long per-item cooldown. A soft landing, not a savings account.

---

# III — Home

## 10. The home vault and its stations

First person, walkable, quiet, yours. Not a menu with a background.

| Station | Does | Fed by |
| --- | --- | --- |
| **The Door** | Insert a Key, form a squad, dive | — |
| **The Printer** | Brings you back. The heart of the vault, and the room everyone is quietest in. | Ink + power |
| **Armorer** | Sets what a fresh print is issued. Upgrading raises the **floor** for every future Life. | Scrap + alloy |
| **Case Bench** | Cracks cased modules, rerolls one affix | Wire + optics |
| **Parts Bench** | Swaps parts between modules; applies maker licences | Parts + licences |
| **Map Room** | Craft and modify Keys; shows which vaults carry which module families | Cells + fragments |
| **Index** | Everything you have ever brought home, mounted; the Log; the wall of dead Lives | — |
| **Bunks** | Homefolk roster, assignment, training | Food + beds |
| **Breaker** | Tears salvage down into parts and reagents — the main job in the vault | Salvage + power |
| **Radio** | The world outside: other lit vaults, contracts, distress calls (§16) | Power |
| **Shop** | Craft equipment and baseline modules from stored parts — always below field-drop quality | Parts + cells |

**The Armorer is the one that matters.** It cannot give you a Proof. What it can
do is improve what you are handed when you wake up on the plate with nothing —
better boots, a second socket, a starting module you actually chose. That is the
answer to "you lose everything but you keep your vault", and it is where the
salvage goes. **Stations raise the floor and never the ceiling.**

**Layout.** Stations ring an atrium with the Door at one end and the Index at the
other, so the walk from "I am back" to "I am going again" passes the trophies and
the dead. Budget the full loop at ~60 seconds of walking.

## 11. Homefolk

**Nobody but a player ever leaves.** The homefolk do not dive, do not scavenge,
and never bring home a single piece of loot, gear or salvage. Every material in
the economy was carried in by a person, on their back, at risk.

**They process; players acquire.** That division is the whole base loop, and it
is better than the idle-expedition version because the vault can never become a
second income stream that plays itself. What they do with what you drop on the
intake counter: break salvage into parts, crack cases, craft equipment and Keys,
maintain the stations, keep the printer running. All of it is **a queue with real
duration** that keeps working while you are logged off. You never come back to
new loot — you come back to *finished work*.

**Forty strangers.** Procedurally generated: name, face, former job, three stats
(**Grit** / **Wit** / **Nerve**), a couple of traits, and a vault of origin they
will mention. They arrive as rescues from dives and as applicants over the radio.
You can favourite and rename them. They form friendships and rivalries that shift
morale by who is bunked next to whom, and they react to what you bring home and
to who did not come back.

They are population, not cast. Forty authored characters is a writing budget
nobody has; attachment here should be emergent and cheap.

**Two people are written**, never leave, and cannot die in normal play.

**Halloway** — runs the machines, here before you were, dry and practical, and
quietly does not want you going out again. He is the one standing at the plate
when you come back wrong. He delivers bad news well.

**Vesk** — went down to Depth 9 once and never went again. Lives at the radio,
tunes frequencies that should not carry, and knows more about the printers than
she will say plainly. She wants you to go deeper. She is not entirely sure that
is her talking.

One wants you to stop, one knows you will not, and both are right. **Two
characters, unlimited reactivity, a writing budget a small team can afford.**
(Names are placeholders — swap freely.)

## 12. Vault life

**Shift clock.** Three shifts on a compressed real-time cycle. Coming home on
night shift is a different place: dim corridors, skeleton crew, Vesk awake
because Vesk is always awake. Same rooms, different game, almost free.

**Upkeep is bands, not chores.** Power, Water, Food, Morale, each in a band —
*failing · thin · steady · surplus* — modulating processing rate, case-crack
quality, chatter, and the lighting and soundscape of the vault. They never gate a
dive. **The Door always opens.** A management layer that can stop you from
playing the game has become the game.

**Drift.** Every reprint costs the vault a little accuracy. It accumulates, it is
cleaned at the Printer with ink, and it is mostly atmosphere — a light that
fails, a homefolk who goes quiet for a shift, a sound in the ducts that Halloway
pointedly does not explain. Left long enough it starts costing you: worse issue
on reprint, homefolk refusing assignments. At maximum it is a one-off set piece
fought in your own corridors against your own vault's output.

That is the best sink in the economy because it is thematically load-bearing:
dying often is what makes home worse, and it is the one pressure in the game that
is entirely self-inflicted.

**Ownership.** Salvage buys paint, lighting, furniture and mounts. Firstprints
hang on the Index wall and the homefolk gather at a new one. Cheapest "lived in"
per hour of work in the project; do not cut it.

---

# IV — The dive

## 13. Keys and vault generation

**Keys.** Crafted at the Map Room, consumed on insert, and they fully determine
the dive:

- **Depth** (1–10) — print generation, enemy tier, module tier. You can only craft
  a Key one depth beyond the deepest objective you have personally completed, so
  a friend can carry you *into* depth but never *past* it (§19).
- **Vault** — *Hydroponics, Cold Storage, the Choir, Reactor Deck, Habitation, the
  Long Hall.* Sets tileset, print roster, hazard, music, **and which module
  families you will find**, because the enemies are the drop table.
- **Objective** — the thing that trips the alarm. Crack the core · take the
  pattern archive · kill the First · restart a printer long enough to read it ·
  find and carry out survivors.
- **Modifiers** — negatives you *choose* for a loot multiplier: no map, doubled
  patrols, faster alarm escalation, a hunter print that tracks you, no beacon
  until the objective is done.

**Generation: authored rooms, procedural graph.** Isaac's lesson, not noise.

1. A graph pass lays out nodes to a budget: 1 entry, 8–16 loot rooms, 2–4
   objective rooms, 1 core, 2–3 beacon sites, 1–3 secrets behind conditions.
2. A room pass fills each node from a hand-authored prefab set for that vault,
   then dresses it: patrol packs assembled per §7, stockroom placement, hazards,
   lighting, ambient story.

Room kinds: **Stockroom** (loot) · **Arena** · **Environmental** (hazard or
traversal) · **Quarters** (survivors, benches, story, quiet dread) · **Printhouse**
(a working printer — Misprint offers, and during the alarm it is a spawner you can
destroy) · **Core** (objective).

Minimum viable authored content: roughly **60 room prefabs across 3 vaults**
before the shuffle stops feeling repetitive. Every prefab must read and fight
correctly with **four bodies in it** — two entrances minimum, cover in clusters,
no single-file chokepoints in a combat room. That is a hard constraint (§19).

**It should read as a place people lived.** Cheap, high-yield dressing over
authored props: name plates on bunks, a shift roster with the same names you keep
seeing, a half-finished meal, drawings in Habitation, a barricade built from the
inside, a room somebody sealed themselves into. And the audio: a PA still running
its shift announcements to nobody. **Every vault gets one running system that
never noticed everyone died.**

## 14. The shape of a dive: quiet, alarm, beacon, driller

The best structural change in this document, and it is yours. Three acts, and
**you** decide when act two starts.

**Act I — Quiet.** You are inside a working building that does not know you are
there. Patrols on routes. Stockrooms to crack. Prints to kill carefully, because
a fight you lose control of is a fight that finds the next patrol. You can loot
the whole vault this way and leave with a decent haul and no drama.

**Act II — The alarm.** Cracking the objective trips it. The vault does the one
thing it was built to do in an emergency: **it starts printing staff.** Not a
timer, not a shrinking circle — a spawn rate that rises and never stops. You
cannot outlast it. Nobody can. Everything un-looted is still down there and you
are now deciding, under fire, how much of it you actually need.

Printhouse rooms become live spawners during the alarm, and you can destroy
them. That is the single best tactical decision in the game: burn thirty seconds
and some ammo now to make the next four minutes survivable.

**Act III — The beacon and the Driller.** Beacon sites are fixed, marked, and
audible from across the level. Slam the beacon, and it calls a drill rig down
from home through however much rock is between you. **You defend that spot for
two to three minutes**, through waves that get worse the whole time, and then the
Driller punches through the ceiling and you board it.

Why this is better than everything it replaced:

- **Extraction becomes a fight you chose to start**, at a place you chose, at a
  moment you chose. A timer takes agency away; this hands it over.
- **It gives the squad one place to be**, which is what a four-player co-op game
  needs and what scattered one-use extraction points actively prevent.
- **It makes the low-level player useful.** Waves attack the *beacon*, so holding
  a corridor and shooting things that are not looking at you is a real job that
  does not require a good build (§19).
- **The greed decision is legible to everyone.** "Do we crack the core or leave
  with what we have" is a sentence four friends can argue about out loud, and
  every answer is defensible.
- **You can leave before act two.** Call the beacon in Act I and the defence is
  short and cheap, because nothing is hunting you yet. Cowardice is a build.

**Downed and revives.** Reviving is a long, loud, stationary channel; the
bleed-out clock does not pause for it; and each player can be revived **twice per
dive**, after which downed is dead. Four bodies should mean four chances to make
a mistake, not immortality.

## 15. Salvage

Not one grey currency. Salvage is **the reason you look at a room**, so it is
several things with different weights, sources and uses — and the good stuff is
heavy.

| Material | From | Feeds |
| --- | --- | --- |
| **Scrap** | Everything, everywhere, heavy | Armorer, structure, station levels |
| **Wire** | Panels, terminals, Fitter prints | Case Bench, sockets, electronics |
| **Cells** | Power rooms, Guard prints | Keys, Shop, station power |
| **Optics** | Sensors, Chorister prints, sealed labs | Case Bench, ranged equipment, map upgrades |
| **Polymer** | Quarters, medical, hydroponics | Armor, seals, reagents |
| **Alloy** | Deep only, structural, very heavy | High-tier equipment, the good Armorer levels |
| **Ink** | Printhouse rooms only. Guarded. | **The Printer.** Reprints, drift cleaning, Restore |
| **Reagents** | Medical, hydroponics | Consumables, drift cleaning |

**Ink is the interesting one.** It is the only thing that keeps you coming back
after you have everything else, because it is what brings *you* back, and it only
exists in the rooms full of the machines making more enemies. Wanting ink is
wanting to walk into the worst room on the level.

**Weight is the whole game.** Carry capacity is equipment (§6), alloy is heavy,
and every stack of scrap is a stack you are not filling with something better.
Hauling salvage should compete directly with hauling modules, and the answer
should change depending on what your Armorer needs this week.

## 16. The radio

Yours is not the only vault with the lights on. The Radio is a physical set you
tune, and Vesk is usually already there.

Four to six named living vaults, each with an identity, an inventory and a way of
talking — *Cassin* (agricultural, generous, naive), *Ossuary Nine*
(records-obsessed, trades knowledge only), *Foreman's Rest* (industrial,
mercenary, sells parts), *the Wick* (one surviving voice who should not still be
broadcasting). Between them, automated loops from vaults that died decades ago,
still cheerfully announcing shift change.

**They ask you for things.** Contracts come from people, not a job board, and
contract chains are where the **permanent socket unlocks** live — so both anchored
progressions in the game come from other people needing you.

**They can go dark.** A vault that broadcasts distress and gets ignored across
enough real days goes quiet, and weeks later shows up in your Map Room as a
divable archetype. You can walk in and loot a place you knew, and meet the voice
you used to talk to as a First. Use sparingly — one such loss per player per long
arc, never a treadmill of guilt.

**Trade** is salvage, parts, patterns and rumours. **Never modules or
equipment** — a market for those is a store with extra steps, and §9's hard rule
holds everywhere.

---

# V — Meta

## 17. The log

The game writes each Life down, terse and factual, readable at the Index and
exportable as a card:

```
LIFE 07                        22 dives · deepest D8 · 41h
  Issued:   Kessler sidearm, patched boots (Armorer III)
  Peak:     level 38 · 7 sockets · Apex "Untethered"
  Firsts:   Firstprint "Long Sunday" (D6, the Choir)
            Cassin relief chain complete → permanent socket 3
  With:     REEVE (11 dives) · TOLLAND (4)
  Ended:    D8, Cold Storage, 40s into the beacon defence,
            carrying a cased Proof launcher nobody ever opened.
```

The last line is the whole design in a sentence, and the game assembled it
without a writer. The Index wall is the physical version: every Life, in order.

## 18. First-person feel

- **Inventory:** weight and slots, not Tetris. Spatial grids are legible at a desk
  and illegible in a tense first-person moment. Weight governs sprint, jump and
  beacon-channel speed, so greed is physical.
- **The module wheel** is the core input surface: radial select, hold to swap,
  readable at a glance with one socket or seven. First thing to prototype.
- **Four resource meters must read at a glance** — stamina, mana, ammo, heat.
  This is the hardest HUD problem in the game and the one most likely to be
  solved by making three of them diegetic (heat on the weapon, ammo on the mag)
  and one of them loud.
- **Looting is channelled** and audible. A pacing tool and a vulnerability.
- **Sound is the primary intel channel.** Patrol routes, the alarm, a friend's
  module two rooms away, the PA announcing a shift change to a dead room.
- **Prints read by silhouette plus held module.** Per §7 this is a rendering
  requirement: every enemy visibly wears its drop. Same for squadmates.
- **Solo is genuinely alone.** No companions means a solo dive has no voice in it
  but the vault's. That is a feature — quieter, slower, more frightening.
- **Accessibility.** Sound carries intel, so every audio cue needs visual
  redundancy or the game is unplayable deaf. Generation must not be colour-only.
  Aim assist, FOV, motion and hold-vs-toggle are settings, and the beacon defence
  is the one timed thing in the game, so its length is a difficulty modifier.

## 19. Playing together

A player a thousand hours in and a player on their first night should run the
same corridor and both have a real time. **The enemies are the same enemies for
both of them.** Eight rules, none of which scale a number to a player:

**0. There is no account level, and the veteran is regularly a beginner.** Level
belongs to the Life, and per §9 that Life is one bad corridor from being level 1
again. The power curve is flattened by permadeath in a way no persistent-level
game's ever is. Half of this problem solves itself.

**1. The power band is 5×, and it is a hard constraint.** Everything from one
socket to seven with Proof gear fits inside a five-fold swing in effective
output. In an FPS that is roughly starting-pistol to good-rifle — a gap friends
play across in every shooter ever made. If a build breaks the budget, the build is
the bug.

**2. Enemies never scale to who is shooting them.** No per-attacker health, no
hidden band, no rubber-banding. A Guard at Depth 4 is the same Guard for
everyone in the room. The moment bullets do different things for different people,
both players stop trusting the game.

**3. One squad, one Key, one depth.** A veteran running Depth 2 with a friend
finds Depth 2 easy — exactly as easy as when he solos it, which is the honest
answer. He is over-geared for the content, not scaled against his friend.

**4. Loot rolls per player, against that player's own level.** Same corpse, two
different rewards, no shared pool, nothing to argue over. Friend groups never
have a loot fight, ever.

**5. You can be carried into depth, never past it.** Key crafting is gated on
objectives *you* completed (§13). Your friend takes you to Depth 8 and you come
out rich; you still cannot make a Depth 4 Key until you have finished Depth 3
yourself. Gear is shareable progress; access is not.

**6. The beacon defence is where the low-level player earns their seat.** Waves
target the beacon, not the strongest player. Holding an approach, destroying a
printhouse, reviving, and carrying are all jobs the objective genuinely needs and
none of them require a good build. Nobody is ever cargo.

**7. Enemy modules use player numbers (§7), so nothing is ever safe.** The
veteran one-shots Hands — of course he does, he does that solo too, and that is
allowed. But an Overrun holding Proof gear is running *his* numbers back at him.
Content stays lethal because content is armed from the same catalogue.

**8. The stakes are asymmetric even when the power is not.** A veteran forty
hours into a Life is risking forty hours; his friend is risking twenty minutes.
The strong player is the scared one, the new player is the reckless one, and that
inversion produces better co-op than any balance patch.

**Sponsor contracts** close the incentive loop: the Radio pays **only in
permanent currency** — standing, maker licences, Index access, applicants,
cosmetics — for completing a dive alongside a lower-level player. His Life does
not grow; his *vault* does.

**Squad size: 1–4, locked.** Four is what a friend group actually is. The cost is
paid in room geometry (§13), sublinear stockroom density — roughly
`1 + 0.6 × (squad − 1)` — packs that scale by count and composition but never by
individual strength, the revive cap in §14, and a beacon defence tuned per
headcount. Solo is separately tuned: smaller vault, fewer patrols, shorter
defence. A one-player Depth 6 is a quieter, more frightening vault, not a
four-player vault with three people missing.

**PvP: opt-in, as a Key modifier.** A **Breach** Key opens your instance to
another squad, doubles loot, and lets you take what they were carrying. Killing
another player ends their Life. That should be heavy, and rare. Building
PvP-first means every system is hostage to netcode, matchmaking and anti-cheat
before the game is playable; as a modifier, **the whole game ships and is fun with
zero PvP**.

**No auction house, no market, no currency trading.** Trading is squad-only,
in-vault, hand to hand, materials only.

## 20. The death spiral, and the valve

Losing a Life must not lose the player. Five countermeasures:

1. **The free Key.** Always available. Fixed body, one fixed module, capped
   cache, nothing to lose, shallow only. The bottom rung is always there.
2. **The Armorer.** A fresh print is always issued something you chose, and that
   floor rises permanently with salvage across the whole game.
3. **The floor moves.** Contract-granted permanent sockets and Index bonuses mean
   Life #12 starts materially better than Life #1, with no stat inflation.
4. **The work queue keeps running.** The homefolk are still breaking down the
   salvage you already hauled. The night your Life ends, tomorrow already has
   *finished work* in it — not new loot, which only players can get.
5. **The vault is still there and still needs you.** A player who loses everything
   still has forty people, Halloway with an opinion about it, a contract from
   Cassin, and a wall to hang something on.

## 21. The first hour

Teach four rules, one socket, and a reason to care, with no tutorial voice:

| Min | Beat |
| --- | --- |
| 0–5 | Wake on the printer plate. Halloway is there and does not make a thing of it. Walk the ring. The Door is the only thing that is obviously important. |
| 5–8 | The Armorer hands you a battered sidearm. Your chest piece has one socket and your other six pieces have none. The game never says "1 of 7"; you can see the empty holes. |
| 8–20 | Depth 1, Habitation. Quiet act. Hands only. The PA is running. A bunk has a name plate. You kill a Hand holding a *hammer* and it drops the hammer, and the hook lands with no text: **that is how you get things.** |
| 20–24 | You can socket the hammer **or** the sidearm. Not both. This is the moment the game explains itself. |
| 24–32 | You crack the core. The alarm goes. Something starts printing down the hall and does not stop. You run for a beacon you passed ten minutes ago and were not paying attention to. |
| 32–36 | Beacon defence, ninety seconds, deliberately winnable. The Driller comes through the ceiling. Nobody forgets their first one. |
| 36–45 | Dump salvage on the intake counter; the Breaker queue starts. Spend first points. **Second Socket** is visible, expensive, two dives away. |
| 45–60 | The Radio lights up — Vesk has been listening to Cassin call for two days. The contract chain that ends in permanent socket 2 begins. Somewhere in here, first death: cheap at one socket, and you meet the printer from the other side. |

Afterwards a player should be able to explain the whole game to a friend, and
want to, because the next beat is bringing that friend along.

## 22. Open questions

1. **Can the 5× band hold?** §19 rests entirely on it, and seven sockets of Proof
   gear with seams firing is exactly where a designer's 5× quietly becomes 30×.
   Needs a build calculator before content authoring, not after.
2. **Four resource pools may be one too many.** §6 is the balance system, but four
   meters is a lot of HUD and a lot to track in a firefight. Fallback: merge Heat
   into Stamina and let Ward/Field cost the same pool as Kinetic, leaving three.
3. **Does losing the whole Life land as tragedy or tedium?** Isaac gets away with
   it at 40 minutes a run; ours is potentially 20 hours. The alarm helps — a Life
   usually ends at a peak, mid-defence, holding something — but it is theory until
   played.
4. **Is the alarm's infinite escalation readable enough?** Players must understand
   in their first thirty seconds that this is not a fight to win. If it reads as
   "we can hold here", the whole act structure fails.
5. **Should lost Lives come back as enemies?** Cut for now. The system is cheap
   and asynchronous — a dead Life walking a vault in its final loadout — and the
   fiction already supports it, but it needs a reason to exist beyond novelty.
6. **Does four bodies flatten the horror?** Geometry cost is priced in (§13); the
   remaining risk is tonal. Levers in order: tighten revives, split the squad with
   objectives that need two rooms at once, lean the alarm on isolating players.
   Never by making a four-stack weaker — that breaks rule 2.
7. **How much authored room content is the real minimum?** 60 is an estimate. If
   it is 200, the project shape changes.
8. **Module library size.** Enemy variety is downstream of module count. Guess:
   **~50 modules across six families**.
9. **Server authority cost.** Instanced four-player PvE with an authoritative host
   is tractable; Breach is a different problem and should wait.

## 23. If this gets built here

| System | Owner |
| --- | --- |
| Room prefabs, vault tilesets, dressing, the home vault itself | **`jgengine-editor`** — authored into `editor.scene.json`; the graph pass composes authored prefabs. No hardcoded geometry. |
| Vault graph generation, movement, print AI, patrols, alarm director, hazards | **`jgengine-world`** |
| Modules as abilities, resource pools, damage, enemy assembly, per-player drop rolls | **`jgengine-combat`** |
| Life state, XP/levels, wheel, equipment and sockets, homefolk, work queue, stations, upkeep bands, shift clock, save | **`jgengine-gameplay`** — serializable state, injected RNG |
| Module wheel, four-pool HUD, inventory, character screen, talent circle, Radio, the Log | **`jgengine-ui`** |
| Squads, Key gating, instance authority, beacon defence sync, Breach | **`jgengine-multiplayer`** |

Reusable seams this pushes upstream, per the build-capability-upstream
invariant — all genre-agnostic, all otherwise handrolled game-locally:

- **Procedural item assembly** — pattern + parts + affixes + generation
- **Shared ability sockets** — one primitive where an NPC's equipped ability set
  *is* its behaviour set *is* its drop table
- **Multi-pool resource costs** — abilities that draw on named, separately-sized
  pools, with equipment sizing the pools
- **Radial talent graph** — rings, spokes, adjacency gating
- **Risk-ledger state** — at-risk vs. permanent partitions, atomic commit on
  extract
- **Per-player reward rolls** — one kill, N independent resolutions against each
  observer's own progression
- **Hold-the-point director** — escalating waves against a defended object with
  destructible spawners
- **Roster and work queue** — named NPCs with stats, assignment and a durable
  offline processing queue

First slice: the module wheel, one vault, §7's enemy assembly, and §14's
alarm-to-Driller act structure. That is the game. Everything in Parts III and IV
turns it into a place, and none of it should start before that slice is fun.

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
