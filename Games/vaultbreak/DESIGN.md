# Vaultbreak — design

A first-person extraction RPG. You live in one of the last lit vaults. You drive
out to dead ones, take what you can carry, and retrace your route to the entrance
before your oxygen runs out.

There are no classes. Every ability in the game — a rifle, a fireball, a shield,
super speed, a rocket launcher — is a **hand item**, and hand items compete for
your hands. You start the game with one hand and end it with four.

You die and the character is over. Some of what it was carrying comes back, and
the vault and everyone in it survive.

Status: design only. No code exists yet. This document records decisions and
marks what is still open. Anything labelled a proposal has not been approved.

**The words.**

| | |
| --- | --- |
| **Life** | One character. Ends at death. |
| **Dive** | One trip into one dead vault. |
| **Hand** | An equip position. You have one at the start and four at most. |
| **Hand item** | Anything you equip into a hand — a rifle, a fireball, a sword. |
| **Cache** | The grid you carry loot in. |
| **Equipment** | Head, chest, legs, boots, two rings, neck. Carries stats, pools and your oxygen tank. |
| **Pool** | A named resource a hand item spends: stamina, rage, mana, ammo, power. |
| **Print** | Anything walking a dead vault. A copy of somebody who worked there. |
| **Item level** | How strong an item's numbers are. Set by where you found it. |
| **Rarity** | How good one item turned out: common, uncommon, rare, epic, legendary, and named above all of them. |
| **Found** | How rare the kind of item is at all: issue, stocked, restricted, sealed, one-off. |
| **Drift** | Accumulated printer inaccuracy at home. The cost of dying often. |
| **Purge** | The gas a dead vault releases once it notices you. Your oxygen clock. |
| **Stash** | Home storage for what death returns and what a squadmate lends you. |
| **Marrow** | Your vault. Renameable. |
| **Diver** | What the homefolk call you. |

| | |
| --- | --- |
| **I — The game** | [1 Loop](#1-the-loop) · [2 Rules](#2-the-rules-everything-hangs-off) · [3 Fiction](#3-fiction-the-printers-never-stopped) · [4 References](#4-what-the-references-give-us) |
| **II — Systems** | [5 Hand items](#5-hand-items) · [6 Equipment, stats and pools](#6-equipment-stats-and-pools) · [7 Enemies](#7-enemies-are-the-drop-table) · [8 Progression](#8-character-level-and-item-trees) · [9 Death](#9-death-and-reprinting) |
| **III — Home** | [10 Stations](#10-marrow-and-its-stations) · [11 Homefolk](#11-homefolk) · [12 Vault life](#12-vault-life) |
| **IV — The dive** | [13 The map](#13-the-map-and-vault-generation) · [14 Dive shape](#14-the-shape-of-a-dive) · [15 Salvage](#15-salvage) · [16 The radio](#16-the-radio) |
| **V — Meta** | [17 The log](#17-the-log) · [18 Feel](#18-first-person-feel) · [19 Playing together](#19-playing-together) · [20 Death spiral](#20-the-death-spiral-and-the-valve) · [21 First hour](#21-the-first-hour) · [22 Open questions](#22-open-questions) · [23 Build mapping](#23-if-this-gets-built-here) |

---

# I — The game

## 1. The loop

A **Life** is one character. It survives extraction and ends at death.

```
MARROW (first person, safe, permanent)
  homefolk process salvage and scavenge → upgrade stations → pick a
  destination on the map → gear up → drive
        │
        ▼
DIVE (you, or up to four of you, 15–25 min)
  drop in on a full tank
  loot, fight, push deeper — the tank is the clock
  the vault notices you and starts the purge
  retrace your route to the entrance and get out
        │
    ┌───┴────┐
    ▼        ▼
 EXTRACT    DIE
    │        │
 keep       the Life is over. A few of the items it carried and
 everything  some of its XP come back to the stash. The further
    │        above your level the place was, the less returns.
    │        │
    └───┬────┘
        ▼
  MARROW — drive again, or get reprinted at level 1
```

Target cadence: 15–25 min in a vault, 3–5 min at home. A Life worth talking about
is 10–40 dives.

## 2. The rules everything hangs off

**Rule 1 — Every active ability is loot.** Guns, spells, powers, shields, melee:
all hand items, all found, none learned. No spellbook and no class kit.

**Rule 2 — All hand items compete for the same hands.** A fireball and a rocket
launcher want the same position, so carrying both means giving up something else.

**Rule 3 — One hand at the start, four at the end.** The second hand arrives at
the end of the tutorial. The third and fourth are quest rewards, spaced a long way
apart. Four hands is a fireball, a gun, a sword and a bow at the same time, and
that is the ceiling.

**Rule 4 — Enemies are built like you are.** Same items, same numbers. What an
enemy is visibly holding is how it fights and what it drops.

## 3. Fiction: the printers never stopped

The vaults kept their people alive by printing them. Sealed underground, no
surface to bury anyone in, so when you died your vault ran you off again from
pattern — same body, same issued kit, back to your post by second shift.

Then the vaults went dark, one at a time, and the printers kept running.

Centuries of that. Every print taken from the last print, every copy a little
worse than the copy before it, for so long that what walks a dead vault now is
the four-hundredth generation of a maintenance tech who died before anyone's
grandmother was born. They still wear the kit. They still walk the route. They
are not anyone any more, and they will kill you for standing in the corridor.

This carries most of the game:

- **It explains why enemies carry items.** The print includes the loadout. A
  security officer prints holding a rifle because a security officer always held
  a rifle.
- **It explains why they never run out.** Push far enough in and the vault does
  what it was built to do in an emergency: it makes more staff.
- **It explains you.** Your vault's printer still works and still has your
  pattern. That is why you can afford to die, and why you come back with almost
  nothing.
- **It aims the game at one idea.** Your printer is a machine, machines drift,
  and every vault out there was once a vault like yours.

**The purge.** *Proposal, not approved.* Dead vaults still run their
decontamination system, and it treats a living body as contamination. Some time
after you drop in, the vault begins flooding its own corridors with suppressant
gas and you are on tank time from then on. This gives the oxygen clock in §14 a
reason to exist and reuses the idea that these buildings are still doing their
jobs. If you would rather the air simply be dead from the moment you enter, that
is simpler and I can write it that way instead.

**The deep.** Vaults are strung together by rail. Further out means older —
sealed earlier, printing longer. The far end of the map is not only bigger
numbers, it is further from the original.

## 4. What the references give us

| Source | The one thing we take |
| --- | --- |
| **Fallout Shelter** | The home base as a persistent second game: named residents, rooms that want specific stats, work and scavenging that continue while you are logged off. |
| **Dark and Darker** | Extraction as a place you must physically reach, and losing the character as the price of the fantasy. |
| **Marathon (2025)** | Swappable items as the whole of build identity, and a free no-risk drop-in as the anti-death-spiral valve. |
| **Borderlands** | Opinionated manufacturers with real trade-offs, and rarity tiers a player already understands. |
| **Diablo** | A grid you arrange, item levels, and per-item progression rather than one character tree. |
| **Binding of Isaac** | Synergies over stats, and the honest one: a run ends. |

Not taken: classes with fixed kits, a permanent power ceiling that grows with the
account, and a PvP-first foundation (§19). Permanent progress exists — the
Armorer, the stash, stations, quest-granted hands — but most of it raises the
floor a fresh character starts from.

---

# II — Systems

## 5. Hand items

A **hand item** is any equippable active. One category, six families:

| Family | Examples | Runs on | Feels like |
| --- | --- | --- | --- |
| **Guns** | rifles, SMGs, launchers, bows | Ammo | Mags, reloads, recoil |
| **Melee** | swords, hammers, gauntlets, whips | Rage | Stance, momentum, parry timing |
| **Spells** | fireball, chain arc, frost lance | Mana | Cast time, charge, channel |
| **Shields** | bubble shield, deflect plate, phase skin | Power | Uptime, coverage, drop timing |
| **Movement** | super speed, flight, blink, leap | Stamina | Movement as a weapon |
| **Devices** | turrets, totems, gravity wells, healing pools | Power | Placement and zoning |

*Proposal:* melee spends rage, which builds as you fight rather than starting
full, while stamina covers movement items and sprinting. Say the word if you want
rage and stamina the other way round, or on different families.

**Elements are presentation, not a separate system.** A fireball and a fire
breath are both spells spending mana; one throws a ball and one is a cone.
Fire, frost and shock are how an item looks and what status it applies, never a
different resource or a different rule.

**Anatomy.** Hand item = a type + a maker + rolled affixes + item level + rarity
+ whatever its own tree has bought. There are no swappable components. A rifle is
a rifle, and what it becomes it becomes by being used (§8).

| Maker | Identity | Cost |
| --- | --- | --- |
| **Kessler** | Volume, cheap ammo, forgiving | Awful at range |
| **Orrery** | Makes spells and shields sing | Weak unless another Orrery item is in another hand |
| **Kiln** | Enormous damage | Self-harm, overheat, recoil that hurts you |
| **Corvin** | Hybrids: gunblades, spell-swords, bayonets | Neither half is best-in-class |
| **Meridian** | Movement and utility | Low raw damage |
| **Vigil** | Shields, devices, healing, squad support | Almost no solo carry |

**An item has two ratings and they answer different questions.** How rare the
kind of thing is to find at all, and how good this particular one turned out.

**How rare the type is** never changes and belongs to the item, not the roll. A
pistol is in every locker; a rocket tube is not.

| Found | Means |
| --- | --- |
| **Issue** | Everybody was given one |
| **Stocked** | Kept in supply rooms |
| **Restricted** | Armoury and secure storage only |
| **Sealed** | Locked away, far out, or on something that will fight about it |
| **One-off** | A single authored item, one place, one holder |

**How good this one is** is the ordinary five-tier ladder. Rarity controls how
many affixes an item rolls. Nothing about it needs explaining to a player who has
seen an RPG before.

| Rarity | Affixes | Where |
| --- | --- | --- |
| **Common** | 0 | Everywhere |
| **Uncommon** | 1 | Everywhere |
| **Rare** | 2 | Uncommon, further out |
| **Epic** | 3 | Rare, deep, on elites |
| **Legendary** | 4 | Very rare, deep, on elites and bosses |
| **Named** | Fixed | Above the ladder. Hand-authored, one per archetype, scripted behaviour rather than a stat line. |

The two multiply. A legendary pistol is a great roll on a boring thing and you
will own several. A common rocket tube is a poor roll on something you were glad
to find. Both are interesting for opposite reasons, and neither exists with one
axis.

**Item level comes from where you found it, not from you.** Every location on the
map has a level range (§13), and a drop rolls inside that range. This is the axis
that keeps deep places worth visiting: a high-level rare will beat a low-level
legendary on raw numbers, while the legendary carries more affixes. Two items of
the same rarity found five ranges apart are not the same item.

**Named items** are the top of the game's item list and they are authored rather
than rolled. Each one drops from a specific enemy in a specific kind of vault, so
losing one costs the trip back rather than the item itself.

**In the case.** Better items drop still sealed in their issue case. Crack one in
the field for a worse roll spread, or carry it home for a better roll.

**Every hand item carries its own skill tree** (§8), so two players holding the
same rifle can have spent it differently.

**Some items take two hands, and some pay you for empty ones.** A two-hand item
is unusable at one hand and a real trade at four, which gives the hand
progression something to unlock besides quantity. Empty-hand items scale with how
many hands you leave open, so a one-hand character is a different character
rather than a worse one, and a four-hand player can still choose one enormous
thing over four small ones.

The catalogue itself lives in [ITEMS.md](ITEMS.md).

**Misprints** come out of printers that have gone wrong. They are deliberately
overpowered and each carries a permanent cost for that Life: a hand burned, a
hard health cap, permanent visibility to enemies. Misprints cannot be unequipped.

## 6. Equipment, stats and pools

**Seven equipment pieces.** Head · Chest · Legs · Boots · Ring · Ring · Neck.

Equipment does not carry hands. It does four jobs:

1. **It carries your oxygen tank.** Tank size is the length of a dive (§14), and
   it is the stat you will feel most.
2. **It sizes your pools** — health, and every pool your equipped items draw on.
3. **It sizes your cache grid** — how much you can bring back in one trip (§15).
4. **It carries affixes** — resistances, reload speed, cast speed, vent rate,
   salvage yield.

**Equipment levels through use.** A piece you wear gains its own experience and
improves as you dive in it, so the set you have been living in is worth something
beyond its roll. It is still lost with the Life.

**Pools are the cost system.** Every family draws on a named pool, and your seven
pieces cannot max all of them at once.

| Pool | Spent by | Recovers by |
| --- | --- | --- |
| **Stamina** | Movement, sprint | Time, fast |
| **Rage** | Melee | Builds by dealing and taking damage; decays out of combat |
| **Mana** | Spells | Time, slow; or on-kill affixes |
| **Ammo** | Guns | Not at all in the field — mags come off the dead and out of stockrooms |
| **Power** | Shields, devices | Time, slowly; or a device that recharges it |

Overheating is a property of individual items rather than a pool that fills
backwards. An item that overheats says so and forces a loud, stationary vent;
most items do not.

Ammo is one pool shared by every gun you carry, so a second gun gives you
another option and not more bullets.

**Health does not regenerate.** You restore it with a Vigil device in a hand,
a healing consumable made from reagents, or an equipment affix. Each one costs
you a hand, cache space, or an affix slot.

**The HUD only draws the pools you are using.** One hand is one meter, and meters
appear as you add families.

## 7. Enemies are the drop table

Because Rule 1 says abilities are loot, the enemy roster and the item roster are
the same roster. **Enemies are assembled exactly like you: equipment plus hand
items.** Everything in a dead vault is a print of somebody who worked there:

| Print | Was | Role | Typically carries |
| --- | --- | --- | --- |
| **Hand** | General population | Chaff, swarms | 1 low-rarity melee or gun |
| **Guard** | Vault security | Line-holder, armored | Gun + shield |
| **Fitter** | Maintenance | Zoner, repairs the others | Device + gun |
| **Chorister** | The morale office — every vault had one | Caster, backline | 2 spells |
| **Courier** | Sent to another vault. Came back. | Flanker, fast | Movement + melee |
| **Overrun** | A print that came out of a printer that never stopped | Elite, room-boss | 3 items, all wrong |
| **First** | An early, near-perfect print of whoever ran this place | Named boss | A named item |

What falls out of this:

1. **Telegraphing and loot-lust are the same read.** You see the fireball on the
   Chorister's arm before it casts.
2. **Hunting is a real verb.** Want a launcher? Some vaults' Guards carry them,
   and the map tells you which.
3. **Difficulty and reward move together.** Something scarier got scarier by
   carrying something better.
4. **Content scales with the item library.** Every new item is a new enemy
   behaviour too.
5. **The purge can print anything.** Wave composition during §14's escalation is a
   spawn table over the same assembly system.

**Rules that keep it honest:** a print drops one of its visible items, never all,
at a rarity roll no better than its own. Elites drop with certainty; chaff
rarely. Enemy items use player numbers, so an elite holding legendary gear is
dangerous to anybody.

## 8. Character level and item trees

Progression is split. The character carries stats. The items carry skills.

**The character has XP and a level**, earned from kills, first-time rooms,
cracked stockrooms and rescues, and lost when the Life ends. Levelling gives
**stat points** and nothing else — no talent tree, no powers.

*Proposal, not approved:* five stats, each doing one obvious job.

| Stat | Does |
| --- | --- |
| **Might** | Melee damage, carry stamina, downed resistance |
| **Intellect** | Mana pool, cast speed, spell damage |
| **Reflex** | Movement, reload and swap speed, vent rate |
| **Grit** | Health, oxygen efficiency, hazard resistance |
| **Luck** | Rarity odds, stockroom detection, case-cracking |

**Every hand item has its own skill tree.** Using an item earns that item
experience, and its points buy nodes on its own tree — a rifle's tree is about
mags, recoil and penetration; a fireball's is about radius, ignition and cast
time. Two players with the same drop end up with different weapons.

**Milestone nodes are hardware, not percentages.** The small nodes on a tree tune
numbers. The big ones bolt something on, visibly, and change what the item is:

| Item | A milestone might be |
| --- | --- |
| Service rifle | An underbarrel grenade launcher |
| Scattergun | A second barrel, fired together or apart |
| Fireball | It splits into three on the way out |
| Frost lance | It leaves the ground frozen behind it |
| Fire axe | A spike on the reverse for armour |
| Bubble shield | It becomes a dome instead of a plate |
| Grapple winch | A second line, so you can anchor two points |
| Turret | It reloads itself from your ammo pool |

A milestone changes the silhouette, which matters because §7 makes silhouettes
the way players read a fight. A rifle with a launcher under it looks like a rifle
with a launcher under it, on you and on a print.

This replaces the character talent tree, item upgrading, and swappable
components. There is no bench where you bolt a barrel onto something. An item
gets better because you used it, and the things you would have bolted on are the
reward for using it.

**A returned item comes back untrained.** §9 hands a few items to your next Life,
and each one arrives at zero tree progress. You get the weapon, not the hours you
put into it, so the item is a head start and never a shortcut past the part of
the game where you use something until it becomes yours.

**Respec** is free at home, per item, between dives.

## 9. Death and reprinting

**Lost with the Life:**

- Everything equipped and everything in the cache, except what returns below
- Your character level, XP and stat points
- Every item tree on every item that does not come back

**Kept, always:**

- The vault, every station and its level
- The homefolk, their stats, and their work in progress
- The stash and all stored materials
- Blueprints, maker licences, recipes
- Hands granted by quests
- The Index, standing, cosmetics, and the Log (§17)

**What comes back.** Death returns a few random items from the Life — equipped or
in the cache, no distinction — and a portion of its XP, into the stash. **The
further above your level the place was, the less comes back.** Dying in a range
you had earned returns a reasonable share; dying somewhere far beyond you returns
almost nothing. Reaching too far is still allowed and still punished.

This is the one place the game stores gear at home, and it is deliberate. The
stash is a landing pad, not a wardrobe: it fills only from deaths and from
squadmates lending items (§19), never from anything you chose to put there.

**Reprinting.** Death is not a menu. You wake on the printer table at home, and
Halloway is already there because he always is. The printer gives you a body and
the Armorer gives you what the shop can currently issue, which improves
permanently with salvage over the whole game (§10).

---

# III — Home

## 10. Marrow, and its stations

Your vault has a name because the ones on the radio use it. **Marrow** —
renameable, and the default the game ships with. First person, walkable, quiet,
yours. Not a menu with a background. The homefolk call you a **diver**.

| Station | Does | Fed by |
| --- | --- | --- |
| **The Garage** | Pick a destination on the map, form a squad, drive out | Cells + fuel |
| **The Printer** | Brings you back | Ink + power |
| **Armorer** | Sets what a fresh character is issued. Upgrading raises the floor for every future Life. | Waste + alloy |
| **Case Bench** | Cracks cased items, rerolls one affix | Wire + optics |
| **Stash** | Holds what death returned and what a squadmate lent you | — |
| **Index** | Everything you have ever brought home, mounted; the Log; the wall of dead Lives | — |
| **Bunks** | Homefolk roster, assignment, training. Its level is the roster cap. | Food + beds |
| **Breaker** | Tears salvage into components and reagents | Salvage + power |
| **Radio** | Other lit vaults, contracts, distress calls (§16) | Power |
| **Shop** | Crafts and sells common gear, plus one rare or epic item that changes every day | Alloy + cells |

**Every station is a queue and every queue is staffed.** A station with nobody
assigned does nothing. Homefolk stats set rate and quality, so more people means
more parallel work finished per dive, and food and morale (§12) are the
counterweight.

**The Shop is common stock and one good thing a day.** Everything it makes and
sells is common, which covers a bad week and nothing else. On top of that it
carries a single rare or epic item that changes daily and is the same for
everyone. That is the whole of buying power in the game: a floor you can rely on,
and one thing a day worth walking over to look at. Everything above epic has to
be found.

**Layout.** Stations ring an atrium with the Garage at one end and the Index at
the other. Budget the full loop at about 60 seconds of walking.

## 11. Homefolk

**They process, and they scavenge.** Homefolk break salvage down, crack
cases, craft, maintain the stations, keep the printer running — and they go out.
A scavenging party leaves for a set duration and comes back with materials and
sometimes items, at a rarity and item level meaningfully worse than what you find
yourself. They cost nothing to send.

The intent is a floor under a bad week rather than a second income. If scavenging
ever competes with diving, the numbers are wrong, not the idea.

**A scavenging party never fails and never dies.** It can be unlucky. Some trips
come back with nothing, and a run of nothing can last a while. Sending them is
always right and never reliable, which keeps it a background comfort rather than
a decision you optimise.

**Forty strangers**, capped by the Bunks. Procedurally generated: name, face,
former job, three stats (**Grit** / **Wit** / **Nerve**), a couple of traits, and
a vault of origin they will mention. They arrive as rescues from dives and as
applicants over the radio. You can favourite and rename them. They form
friendships and rivalries that shift morale by who is bunked next to whom, and
they react to what you bring home and to who did not come back.

They are population, not cast. Forty authored characters is a writing budget
nobody has; attachment here should be emergent and cheap.

**Homefolk do not die in normal play.** At the bottom of the morale band they
leave, and drift (§12) can make one go quiet for a shift.

The work queue is **simulated forward when you load**, not held on a server.
Single player works offline; co-op is instanced and host-authoritative (§23).

**Two people are written**, never leave, and cannot die in normal play.

**Halloway** — runs the machines, here before you were, dry and practical, and
quietly does not want you going out again. He is the one standing at the plate
when you come back wrong.

**Vesk** — went out to the far end of the line once and never went again. Lives
at the radio, tunes frequencies that should not carry, and knows more about the
printers than she will say plainly. She wants you to go further out.

(Names are placeholders — swap freely.)

## 12. Vault life

**Shift clock.** Three shifts on a compressed real-time cycle. Coming home on
night shift is a different place: dim corridors, skeleton crew, Vesk awake
because Vesk is always awake.

**Upkeep is bands, not chores.** Power, Water, Food, Morale, each in a band —
failing, thin, steady, surplus — modulating processing rate, case-crack quality,
scavenging yield, chatter, and the lighting and soundscape of the vault. They
never stop you leaving. The Garage always opens.

**Drift.** Every reprint costs the vault a little accuracy. It accumulates, it is
cleaned at the Printer with ink, and it is mostly atmosphere — a light that
fails, a homefolk who goes quiet for a shift, a sound in the ducts that Halloway
does not explain. Left long enough it starts costing you: worse issue on reprint,
homefolk refusing assignments. At maximum it is a one-off set piece fought in
your own corridors against your own vault's output.

**The Printer never fails to print.** If ink is at zero you still come back, and
the run costs drift instead. The Garage always opens and so does the plate.

**Ownership.** Salvage buys paint, lighting, furniture and mounts. Named items
hang on the Index wall and the homefolk gather at a new one.

---

# IV — The dive

## 13. The map and vault generation

**The map, not a key.** The Garage shows a rail map of everything Marrow can
reach. Each location carries, visible before you commit:

- **Level range** — the item levels that drop there, and roughly what fights back.
  Nothing stops you driving somewhere far above you; §9 handles what that costs.
- **Kind** — *Hydroponics, Cold Storage, the Choir, Reactor Deck, Habitation, the
  Long Hall.* Sets tileset, print roster, hazard, music, and which families you
  will find, because the enemies are the drop table.
- **Rarity** — how good the place is. Most locations are ordinary; a few are worth
  the drive, and the good ones do not stay on the map forever.
- **Modifiers** — properties of the location itself rather than something you
  chose: doubled patrols, no map, a hunter print, thin atmosphere that drains the
  tank faster. Better modifiers ride with better loot, so a rich location is a
  worse one to be in.

**The drive** is the loading screen made diegetic and it is where a squad talks.
Length scales with distance.

**Generation: fully procedural, from a small tile set.** Each vault kind gets a
compact set of reusable tiles — corridor runs, junctions, stockrooms, plant
rooms, stairwells — and the generator assembles a fresh layout per visit. A run
should never be a layout you have memorised.

The generator owes the player three things and they are hard constraints:

1. **A findable way back.** §14 makes you retrace your route, so the path from
   entrance to depth must stay legible under pressure. Landmark tiles, consistent
   signage, and directional lighting are generation inputs, not decoration.
2. **Rooms that fight correctly with four bodies in them.** Two entrances minimum,
   cover in clusters, no single-file chokepoints in a combat room.
3. **A reason to look at a room.** Stockrooms, secrets behind conditions, and
   printhouse rooms are placed to a budget, not sprinkled.

Room kinds: **Stockroom** (loot) · **Arena** · **Environmental** (hazard or
traversal) · **Quarters** (survivors, benches, story) · **Printhouse** (a working
printer — Misprint offers, and a spawner you can destroy during the purge) ·
**Deep room** (the far end, best loot, worst trip back).

**It should read as a place people lived.** Cheap dressing over authored props:
name plates on bunks, a shift roster with the same names you keep seeing, a
half-finished meal, a barricade built from the inside, a room somebody sealed
themselves into. And the audio: a PA still running its shift announcements to
nobody.

## 14. The shape of a dive

**You drop in on a full tank and the tank is the whole clock.** There is no
extraction point to find and no rig to call. The way out is the way you came in.

**Going in.** The vault does not know you are there yet. Patrols on routes,
stockrooms to crack, prints to kill carefully. Every room you push past is a room
you will have to cross again on the way out, and the deeper you go the better the
loot gets.

**How a print notices you.** Sight is a cone, shortened by darkness. Hearing is a
radius that grows with what you are doing — crouched, walking, sprinting, looting,
venting, firing. Three states, readable across a room by posture alone:

| State | What it is doing |
| --- | --- |
| **On route** | Walking its shift. It has not registered you. |
| **Looking** | Something landed. It breaks route and goes to check. |
| **Calling** | It has you and it is shouting. Prints in earshot converge. |

Break line of sight and stay quiet and prints drift back to route. Without that,
being seen once would end the quiet part of the dive permanently.

**Stealth does not work on everything.** Overruns, Firsts and some vault kinds
are aware of you regardless, so a stealth build is a strong opener and never a
whole answer. Which prints ignore stealth is a per-roster data decision.

**The purge.** At some point the vault starts flooding its corridors with gas.
From then on you are breathing your tank, the meter is on screen, and it does not
stop. Printhouse rooms become live spawners and you can destroy them.

**The way out.** Retrace to the entrance with whatever you are carrying. This is
the decision the whole dive builds to: every extra room inward is loot you want
and tank you will need to get back, and the trip out crosses ground you already
stirred up.

**Running out of air** is a bleed, not an instant death, so a bad estimate is
survivable if your squad is close. Exact numbers are open.

**Downed and revives.** Reviving is a long, loud, stationary channel, the
bleed-out clock does not pause for it, and each player can be revived twice per
dive, after which downed is dead.

**There is no alarm.** The gas is the only pressure a dive has. Nothing you do to
an objective starts a second clock, nothing escalates on a separate track, and
the one meter on screen is the one that matters. Prints still notice you, converge
and call for help, but that is local and it decays; the vault's own countermeasure
is the purge and nothing else.

## 15. Salvage

Not one grey currency. Salvage is the reason you look at a room, so it is several
things with different sources and uses.

| Material | From | Feeds |
| --- | --- | --- |
| **Waste** | Everything, everywhere | Armorer, structure, station levels |
| **Wire** | Panels, terminals, Fitter prints | Case Bench, electronics |
| **Cells** | Power rooms, Guard prints | The Garage, the Shop, station power |
| **Optics** | Sensors, Chorister prints, sealed labs | Case Bench, ranged equipment, map upgrades |
| **Polymer** | Quarters, medical, hydroponics | Armor, seals, reagents |
| **Alloy** | Far out only, structural | High-tier equipment, the good Armorer levels |
| **Ink** | Printhouse rooms only. Guarded. | The Printer. Reprints and drift cleaning. |
| **Reagents** | Medical, hydroponics | Consumables, drift cleaning |

**Space, not weight.** The cache is a grid you arrange, sized by equipment.
Nothing slows you down for being full; what limits you is what fits. A stack of
waste is squares you are not filling with a rifle, and the decision is made by
looking at the grid rather than at a number.

**Ink is the material that keeps you coming back** after you have everything
else, because it is what brings you back, and it only exists in the rooms full of
the machines making more enemies.

## 16. The radio

Yours is not the only vault with the lights on. The Radio is a physical set you
tune, and Vesk is usually already there.

Four to six named living vaults, each with an identity, an inventory and a way of
talking — *Cassin* (agricultural, generous, naive), *Ossuary Nine*
(records-obsessed, trades knowledge only), *Foreman's Rest* (industrial,
mercenary, sells materials), *the Wick* (one surviving voice who should not still be
broadcasting). Between them, automated loops from vaults that died decades ago,
still announcing shift change.

**They ask you for things.** Contracts come from people rather than a job board,
and contract chains pay in permanent things a Life cannot lose: stat points at
reprint, maker licences, recipes, Shop stock, applicants, cosmetics.

**They can go dark.** A vault that broadcasts distress and gets ignored across
enough real days goes quiet, and later shows up on your map as somewhere you can
drive to. You can walk in and loot a place you knew, and meet the voice you used
to talk to as a First. Use sparingly.

**Trade** is salvage, patterns and rumours.

---

# V — Meta

## 17. The log

The game writes each Life down, terse and factual, readable at the Index and
exportable as a card:

```
MARROW · LIFE 07               22 dives · furthest Cold Storage · 41h
  Issued:   Kessler sidearm, patched boots (Armorer III)
  Peak:     level 38 · 3 hands · tank IV
  Bests:    "Long Sunday" (named, the Choir, ilvl 62)
            Cassin relief chain complete
  With:     REEVE (11 dives) · TOLLAND (4)
  Ended:    Cold Storage, 90m out of air on the way back,
            carrying a cased epic launcher nobody ever opened.
```

The Index wall is the physical version: every Life, in order.

## 18. First-person feel

- **Inventory is a grid you arrange.** Items occupy real shapes and packing is
  part of deciding what comes home. It is read at a stopping point, not mid-fight.
- **The hand wheel** is the primary input surface: radial select, hold to swap,
  readable with one hand or four. First thing to prototype.
- **The oxygen meter is the loudest thing on screen** and it is the only element
  that is always present. Everything else can be diegetic.
- **The HUD only draws pools you are using.** One hand is one meter.
- **Looting is channelled** and audible. A pacing tool and a vulnerability.
- **Sound is the primary intel channel.** Patrol routes, a friend's item two rooms
  away, the PA announcing a shift change to a dead room. What you can hear is
  roughly what can hear you.
- **Prints read by silhouette, posture and held item.** Every enemy visibly wears
  its drop and its posture is its alert state. Both are rendering requirements.
- **Solo is genuinely alone.** No companions on a dive means a solo run has no
  voice in it but the vault's.
- **Accessibility.** Every audio cue needs visual redundancy. Generation must not
  be colour-only. Aim assist, FOV, motion and hold-versus-toggle are settings, and
  tank length is a difficulty modifier.

## 19. Playing together

A player a thousand hours in and a player on their first night should run the
same corridor and both have a real time.

**1. Enemies never scale to who is shooting them.** No per-attacker health, no
hidden band. A Guard is the same Guard for everyone in the room.

**2. Areas have fixed level ranges and you choose the range.** If you think you
are worthy you can drive somewhere far above you. If you want a short, safe run,
take a low one and be quick. The map is the difficulty selector, and §9 prices the
gamble.

**3. Everyone gets their own drop.** A boss killed by four players produces four
independent rolls, each against the location's range. There is nothing to divide
and nothing to argue about.

**4. There is no account level, and the veteran is regularly a beginner.** Level
belongs to the Life, and that Life is one bad corridor from level 1.

**5. Four hands is the ceiling for everyone.** The gap between a new character and
a finished one is one hand versus four plus item levels and item trees, which is a
gap friends play across in every co-op game.

**6. The trip out needs bodies more than builds.** Covering a corridor, carrying,
reviving, and destroying a printhouse are jobs the run genuinely needs and none of
them require a good build.

**7. The stakes are asymmetric even when the power is not.** A veteran forty hours
into a Life is risking forty hours; his friend is risking twenty minutes.

**Lending.** A squadmate can hand you an item and you can take it out on a dive.
You can also pick it up and use it at home, but it returns to their stash when
they ask for it or when the session ends. Items acquired together on a dive belong
to whoever rolled them.

**Sponsor contracts** close the incentive loop: the Radio pays only in permanent
things for completing a dive alongside a lower-level player.

**Squad size: 1–4.** The cost is paid in room geometry (§13), sublinear stockroom
density, packs that scale by count and never by individual strength, the revive
cap in §14, and tank pressure tuned per headcount. Solo is separately tuned:
smaller vault, fewer patrols, a shorter walk back.

**PvP exists.** Form is not decided. The two shapes on the table are an opt-in
mode where two squads meet in the same vault, and a set of deep locations that are
always contested. Whichever it is, the game ships and is fun with zero PvP, and
PvP does not gate any item a solo player needs.

**No auction house and no market.** Trading is squad-only, hand to hand.

## 20. The death spiral, and the valve

Losing a Life must not lose the player.

1. **The free run.** A fixed body, a fixed hand, a capped cache, a shallow
   location, nothing to lose. Always available.
2. **The Armorer.** A fresh character is always issued something you chose, and
   that floor rises permanently with salvage.
3. **The stash is not empty.** §9 returns a few items and some XP from the Life you
   just lost, so the next one does not start from zero.
4. **The homefolk kept working.** Salvage you already hauled is still being broken
   down, and a scavenging party may be back with something.
5. **The vault is still there and still needs you.** Forty people, Halloway with an
   opinion, a contract from Cassin, and a wall to hang something on.

## 21. The first hour

Teach four rules, one hand, and a reason to care, with no tutorial voice:

| Min | Beat |
| --- | --- |
| 0–5 | Wake on the printer plate. Halloway is there. Walk the ring. The Garage is the only thing that is obviously important. |
| 5–8 | The Armorer hands you a battered sidearm. You have one hand and you can see that you have one hand. |
| 8–20 | Drive to the nearest location, low range, Habitation. The PA is running. A bunk has a name plate. You kill a print holding a hammer and it drops the hammer. |
| 20–24 | You can hold the hammer or the sidearm. Not both. This is the moment the game explains itself. |
| 24–32 | You push one room too far. The gas starts. The tank meter appears and does not stop. |
| 32–40 | The walk back, through rooms you already stirred up, watching the meter. You get out with less than you wanted. |
| 40–48 | Dump salvage on the intake counter; the Breaker queue starts. Spend first stat points. Put points into the sidearm's own tree and watch it change. |
| 48–60 | The second hand is granted. The Radio lights up — Vesk has been listening to Cassin call for two days. Somewhere in here, first death: cheap at one hand, and you meet the printer from the other side. |

## 22. Open questions

1. **Does the detection model survive four players?** Four bodies make four times
   the noise, and if quiet is unreachable in a full squad it becomes a solo mode by
   accident.
2. **How far can the tank stretch before the dive stops being tense?** The whole
   act structure is one number and it has not been chosen.
3. **Does losing the whole Life still land, now that some of it comes back?** The
   softener in §9 protects the player and costs the moment some of its weight.
4. **Fully procedural versus a tile set.** §13 asks a generator to produce a
   legible route back out of reusable parts, which is the hardest thing on this
   list and the one most likely to need authored anchors after all.
5. **Do vault and printing items need their own pools?** Both currently spend
   power alongside shields and devices, so a shield build and a vault build
   compete for one meter.
6. **PvP shape.** Contested locations and an opt-in mode are different products.

## 23. If this gets built here

| System | Owner |
| --- | --- |
| Tile sets, dressing, the home vault itself | **`jgengine-editor`** — authored into `editor.scene.json`. No hardcoded geometry. |
| Vault generation, movement, print AI, patrols, purge director, hazards | **`jgengine-world`** |
| Hand items as abilities, pools, damage, enemy assembly, detection and alert states, per-player drop rolls | **`jgengine-combat`** |
| Life state, character stats, item trees, equipment, homefolk, work and scavenging queues, stations, upkeep bands, shift clock, stash, save | **`jgengine-gameplay`** — serializable state, injected RNG |
| Hand wheel, oxygen meter, pool meters, grid inventory, character screen, item trees, map, Radio, the Log | **`jgengine-ui`** |
| Squads, instance authority, lending, PvP | **`jgengine-multiplayer`** |

Reusable seams this pushes upstream, all genre-agnostic:

- **Procedural item assembly** — type, maker, affixes, item level, two rarity axes
- **Shared ability slots** — one primitive where an NPC's equipped ability set is
  its behaviour set is its drop table
- **Multi-pool resource costs** — abilities drawing on named, separately-sized
  pools that equipment sizes
- **Per-item progression trees** — experience and nodes owned by an item instance
  rather than a character, including nodes that add hardware and change its model
- **Grid inventory** — shaped items, packing, and containers
- **Consumable-clock extraction** — a depleting carried resource as the run timer,
  with the entrance as the exit
- **Per-player reward rolls** — one kill, N independent resolutions
- **Roster and work queue** — named NPCs with stats, assignment, and durable
  offline processing and expeditions

First slice: the hand wheel, one vault kind's generator, §7's enemy assembly, and
§14's tank clock with a walk back out. Everything in Parts III and IV turns that
into a place, and none of it should start before that slice is fun.

Before code lands: a `[FEATURE]` issue per vertical slice, and a `CREDITS.md`
entry recording the lineages in §4.

---

## References

- [Fallout Shelter rooms](https://fallout.fandom.com/wiki/Fallout_Shelter_rooms) · [Dwellers](https://fallout-archive.fandom.com/wiki/Vault_dwellers_(Fallout_Shelter)) · [Wasteland exploration](https://gamerant.com/fallout-shelter-best-tips-for-exploring-wasteland/)
- [Dark and Darker extraction](https://www.thegamer.com/dark-and-darker-extraction-guide/) · [Escape portals](https://gamerant.com/dark-and-darker-how-to-extract-escape/)
- [Marathon Runner shells and abilities](https://kotaku.com/marathon-runner-shells-trailer-abilities-bungie-2000660170) · [Class list](https://gamerant.com/bungie-marathon-game-full-list-of-confirmed-classes-comparison/)
- [Borderlands manufacturers](https://borderlands.fandom.com/wiki/Manufacturer)
- [Diablo II item quality](https://diablo.fandom.com/wiki/Item_Quality_(Diablo_II)) · [Item level](https://diablo.fandom.com/wiki/Item_Level)
- [Isaac level generation](https://www.boristhebrave.com/2020/09/12/dungeon-generation-in-binding-of-isaac/) · [Rebirth wiki](https://bindingofisaacrebirth.fandom.com/wiki/Level_Generation)
