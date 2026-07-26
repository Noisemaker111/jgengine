# Vaultbreak — design

A first-person extraction RPG. You own a vault full of people. You key into other
vaults — dead ones — kill what lives there now, take what you can carry, and get
out. Extract and it is yours. Die and it is not.

Status: design only. No code exists yet. This document is the spec to argue with
before anything gets built.

---

## 1. The pitch in one loop

```
HOME VAULT (first person, safe, permanent)
  assign dwellers → upgrade facilities → craft a Key → equip a Rig
        │
        ▼
INSERT (solo or 1–3 squad, instanced)
        │
EXPEDITION VAULT (procgen, timed, escalating)
  loot caches → complete objective → rescue dwellers → bank Charge
        │
    ┌───┴────┐
    ▼        ▼
 EXTRACT    DIE
  keep      lose the rig, the bag, the unbanked Charge
  all of it keep the vault, the talents you banked, everything you learned
        │        │
        └───┬────┘
            ▼
        HOME VAULT
```

Target cadence: **12–25 min** in a vault, **3–5 min** turnaround at home. Log in,
do one full loop, log off, in under half an hour.

---

## 2. What the references actually give us

| Source | The one thing we take |
| --- | --- |
| **Vault Hunters 3rd Ed.** | The *Key*: a craftable, modifiable run token that sets theme, objective, difficulty and loot multiplier before you insert. Plus unidentified gear you carry home to open. Plus talents+abilities as one skill-point pool. |
| **Fallout Shelter** | The home base as a persistent, stat-driven, *idle-productive* second game. Dwellers with stats, rooms that want specific stats, offline expeditions that pay out while you are gone. |
| **Dark and Darker** | Extraction as a physical place you must reach, contested, spawning late, one-use. Losing your gear is the price of the fantasy. Classes with hard identity. |
| **Marathon (2025)** | Runner shells + swappable cores/implants: build identity split between a chassis you pick and modules you mix. And **Rook** — a free, no-loadout, no-risk drop-in. That is our anti-death-spiral valve. |
| **Borderlands** | Guns as procedural part assemblies from opinionated manufacturers. Rarity that means something. The joy of a drop that recontextualises a build. |
| **Binding of Isaac** | Hand-authored rooms shuffled by a graph, not noise. Item *synergies* over item *stats*. The Devil Room: real power for a real permanent cost. |

Explicitly **not** taken: Isaac's per-run reset (we are persistent), Fallout
Shelter's tap-to-collect monetisation shape, Marathon's PvP-first foundation
(see §11), Borderlands' auction-house-free-for-all loot spam volume.

---

## 3. The two ledgers — what death costs, exactly

The single most important rule in the game. Everything you own sits in one of two
ledgers.

**Anchored ledger — never lost, ever.**

- The vault itself, every facility and its level
- The dweller roster and their stats
- The stash (everything you left at home)
- **Banked talent points** and the tree you have unlocked
- Blueprints, foundry licences, recipes
- The Archive (item codex) and every passive it has granted
- Clearance rank — which key depths you may craft
- Cosmetics, vault decoration, titles

**Run ledger — at risk on every insert.**

- Everything equipped: weapons, armor, trinkets — the whole **Rig**
- Everything in the backpack: loot, junk, consumables, sealed gear
- **Unbanked Charge** (see §4)
- Your **Kit** (the free Bonded starter gear from the Armory)
- Any dweller you were carrying out

Die and the run ledger is gone. Full stop. No partial bag recovery, no "keep 3
items". The clean rule is what makes the tension legible in the first thirty
seconds of play.

**Two softeners, both costed:**

- **Echo insurance.** Before insert you may tag exactly one item as Insured for
  a junk fee. If you die, it returns to your stash. Cooldown per item, not per
  run, so you cannot insure the same god-roll every time. Insuring the item you
  are actually scared of losing should feel like a real expense.
- **Body recovery.** Your corpse persists for 24h as a one-room recovery
  instance seeded from where you fell. You may re-enter naked, or a squadmate
  may, or you may spend a dweller on a chance-based retrieval run. The instance
  is hostile and the clock is real.

---

## 4. Charge — how a build survives death without making death cheap

This is the fix for the gap you named ("you die you lose your build, but that
feels awful, but you also can't spawn overpowered").

Talent points are not bought with a level-up. They are bought with **Charge**.

- Charge accrues *inside* a vault: kills, objectives, first-time rooms, cracking
  a cache, rescuing a dweller. It sits in your body as a visible HUD meter.
- Charge in your body is **run-ledger**. Die at 4,000 Charge and it is all gone.
- Extract and you may **Bank** it at the Reactor. Banking converts Charge to
  permanent Talent Points at a tax — start at **60% conversion**, raised toward
  ~90% by Reactor level and a high-Wit dweller assignment.
- Banked points are **anchored**. They never burn.

Consequences that make this worth it:

1. A long greedy run is a growing pile of unbanked value. The decision to push
   one more room is a decision about your *character*, not just your bag.
2. A veteran who dies keeps their spine. They do not restart the tree. Nobody
   ragequits over losing 60 hours.
3. New players and wiped veterans still bank Charge every single run, so the
   permanent line always goes up, even on a bad night.
4. Extraction is not just "save loot" — it is "save who you are becoming". That
   is a better verb than a loot cash-out.

---

## 5. The talent wheel

A circle. You start at the centre and grow outward. Five spokes, four rings.

```
                    ORDNANCE
                        │
          VECTOR ───────┼─────── AETHER
                    ╲   │   ╱
                     ╲  ●  ╱          ● = the Spark (centre, free)
                      ╲   ╱
              ASCENDANT ─── STEEL

  rings, centre → rim:  Initiate · Adept · Master · Apex
```

**The five spokes.** Each is a damage-and-verb identity, not a class:

| Spoke | Fantasy | Sample nodes |
| --- | --- | --- |
| **Ordnance** | Guns, ammo, explosives, rocket launchers | Mag Discipline, Overpressure, Cluster Payload, *Apex:* Danger Close |
| **Aether** | Spells, elemental channels, sustained casts | Kindle, Chain Arc, Ward Weave, *Apex:* Unmaking |
| **Steel** | Swords, parry, momentum, close-range dominance | Riposte, Bloodwork, Momentum Carry, *Apex:* Sever |
| **Ascendant** | Superman powers — flight, raw strength, invulnerability windows | Leap, Ironhide, Lift, *Apex:* Terminal Velocity |
| **Vector** | Mobility, stealth, intel, extraction tech | Blink, Sonar Ping, Silent Step, *Apex:* Fold Space |

**Confluence seams.** Between every pair of adjacent spokes sits a set of nodes
that require points in *both* neighbours. This is where every good build in the
game actually lives, and it is the Isaac lesson: synergy over stats.

- Ordnance × Aether → **Charged Magazine**: your gun's element is your last cast
- Aether × Steel → **Runeblade**: melee hits store a spell charge in the blade
- Steel × Ascendant → **Comet**: a flight is a slam is an AoE
- Ascendant × Vector → **Terminal Escape**: extraction channel while airborne
- Vector × Ordnance → **Painted Target**: pings become homing corrections

Five spokes means five seams. That is the whole point of the circle rather than
a tree: adjacency is a real design surface, and the geometry teaches you that
Ordnance and Aether talk to each other while Ordnance and Steel do not (you must
go round the rim or through the centre).

**The Spark (centre).** Free nodes available to everyone, cheap, generic: health,
carry weight, loot speed, revive speed. It exists so a wiped player has somewhere
to put a point immediately and so cross-rim builds have a bridge.

**Respec.** At the vault's Reactor, for junk plus a cooldown. Free respec at every
Clearance rank-up. Build experimentation is content; punishing it is not.

---

## 6. The rig — why a level-90 player spawning naked is not a problem

Knowing a talent and *having* it are separate. Talents must be **slotted**, and
slots come from gear.

- Your **Rig** (chassis + armor + trinkets) provides **Talent Slots** and a
  **Strain budget**.
- Every slotted talent costs Strain. Higher-ring talents cost more.
- A naked spawn with the free Armory Kit has ~3 slots and low Strain. A fully
  geared veteran has ~10–12 and a fat Strain budget.

So the same character, same 40 known talents, plays completely differently
depending on what they are wearing *right now*. A veteran who just died is not
weak in the "start over" sense — they know the tree, they own the vault, they
will rebuild in two runs — but on the run immediately after death they are
running three talents and a bonded pistol. **The gap between a new player and a
veteran becomes knowledge and infrastructure, not raw numbers.** That is the
whole design in one paragraph.

---

## 7. Anti-overpowered levers

You flagged this as the risk. Eight levers, deliberately overlapping:

1. **Slots and Strain** (§6) — knowledge is uncapped, equipped power is not.
2. **One Apex.** You may have exactly one rim-tier capstone slotted at a time,
   however many you have unlocked. Choosing your ceiling is a per-run decision.
3. **Confluence gating** forces breadth-vs-depth: you cannot max two spokes and
   still afford the seams between them.
4. **Ascension Debt.** Every slotted Ascendant node makes you *louder*: larger
   AI aggro radius, visible to other squads in Breach vaults, slower extraction
   channel. Superman powers cost visibility, not damage numbers. Power that
   makes you a target is self-balancing in a way a stat penalty never is.
5. **Depth scaling, not player scaling.** Enemies scale to *key depth*. Growing
   stronger means keying deeper, not farming trivial content faster. Clearance
   gates depth, and Clearance only comes from completing objectives.
6. **Kit is Bonded.** Armory-issued starting gear cannot be sold, traded,
   stashed, upgraded past its Armory tier, or stacked. It is a floor, never a
   ceiling.
7. **Facilities give rate and floor, never ceiling.** No facility may produce an
   item better than the best a vault can drop. The base accelerates you; it does
   not replace the vault.
8. **Aberrant items carry real costs** (§8), so the strongest items in the game
   are the ones you are nervous to run.

Sanity check to hold ourselves to: *the best possible loadout should beat the
worst possible loadout by roughly 3×, not 30×.* Everything above exists to keep
that ratio.

---

## 8. Loot

**Item = Frame + Parts + Affixes + Rarity.** Borderlands assembly, Vault Hunters
sealing.

- **Frame** — the archetype: SMG, launcher, arming sword, focus, gauntlet, rig
  chassis, backpack.
- **Parts** — 3–5 slots (barrel/receiver/mag/optic, or hilt/core/edge/binding),
  each stamped by a **Foundry**. Parts are swappable at the home Foundry Bench,
  which is where a mediocre drop becomes a component instead of trash.
- **Affixes** — rolled modifiers, some of which are *verbs* not numbers.
- **Rarity** — Salvage · Standard · Marked · Sealed · Relic · **Vaultborne**.

**Foundries have personality and a downside.** Each is a build direction, not a
stat tier:

| Foundry | Identity | Cost |
| --- | --- | --- |
| **Kessler** | Volume of fire, cheap ammo, forgiving | Terrible accuracy at range |
| **Orrery** | Aether-conductive; guns that cast, blades that hold spells | Needs Aether points to function at all |
| **Brand** | Enormous damage | Self-harm, overheat, recoil that hurts you |
| **Hallow** | Melee/ranged hybrids, bayonets, gunblades | Neither half is best-in-class |
| **Meridian** | Mobility, utility, extraction tech | Low raw damage |
| **Preserve** | Shields, healing, squad support | Almost no solo carry potential |

**Sealed gear.** Better drops come out sealed and unidentified. You may crack one
in the field — instant, worse roll distribution — or carry it home to the Assay
Lab for a better roll biased by your assigned dweller's Wit. A sealed Relic in
your bag is exactly the thing you should die for. That is a Vault Hunters idea
and it is the best single tension generator in this whole document.

**Aberrant items** (the Devil Room). Found in **Toll Rooms**. Genuinely
overpowered, and each carries a permanent-for-the-run cost: burn a talent slot,
take a hard health cap, become visible to every enemy in the vault, or forfeit
one extraction pad. Aberrants cannot be unequipped mid-run. Taking one is a
decision to change what kind of run this is.

**Vaultborne uniques.** One hand-authored named item per vault archetype, low
drop rate, with a scripted behaviour rather than a stat line. These are the
screenshots people post.

**The Archive.** Every item type you extract for the first time is recorded and
grants a tiny permanent passive (Isaac's collection page married to Vault
Hunters' artifacts). It is small, it is anchored, and it means a player who dies
constantly still measurably progresses. Every game needs one line that only goes
up.

---

## 9. The home vault

First person, walkable, quiet, yours. Not a menu with a background.

| Facility | Does | Fed by |
| --- | --- | --- |
| **Vault Door** | Insert a Key, form a squad, launch | — |
| **Reactor** | Banks Charge → talent points; sets the tax; respec | Junk + cores |
| **Armory / Smith** | Sets your **Kit** — the free Bonded loadout you spawn with when you have nothing. Upgrading raises the floor. | Junk + scrap |
| **Assay Lab** | Cracks sealed gear, rerolls one affix | Junk + reagents |
| **Foundry Bench** | Swap parts between items; apply foundry licences | Parts + licences |
| **Cartography** | Craft and modify Keys; see archetypes and modifiers | Cores |
| **Reliquary** | The Archive; displays extracted uniques | — |
| **Barracks** | Dweller roster, assignment, training, idle expeditions | Food + beds |
| **Terminal** | Contracts, squad-finding, leaderboards, credits | — |

**Why walk it in first person?** Because your dwellers live there, your uniques
are on the wall, and the run you just survived is visible as things in a room.
The alternative — a facility menu — throws away the entire emotional payoff of
extraction. It must cost the player about 60 seconds to walk the loop, not five
minutes; facilities cluster around a central atrium with the Vault Door at the
end.

**Dwellers.** Rescued from expedition vaults; they are a side objective that
competes with loot, since carrying one slows you and it must be extracted alive.

- Three stats: **Grit** (labour, defence), **Wit** (analysis, crafting),
  **Nerve** (risk, exploration).
- Assign to facilities. High Wit in the Assay Lab improves seal rolls; high Grit
  in the Armory raises Kit tier; high Nerve in Cartography unlocks deeper Key
  modifiers.
- **Idle expeditions.** Send dwellers out while you are offline. They return
  junk, cores, and rumours (which reveal a specific Vaultborne's archetype).
  They can die out there. This is the Fallout Shelter loop and it is what makes
  logging in tomorrow worth it.

---

## 10. Expedition vaults

**Keys.** A Key is the Vault Hunters crystal. Crafted at Cartography, consumed on
insert, and it fully determines the run:

- **Depth** (1–10) — enemy tier, loot tier, gated by Clearance
- **Archetype** — the theme: *Hydroponics, Cold Storage, The Choir, Reactor Deck,
  Habitation, The Long Hall*. Sets tileset, enemy family, hazard, music.
- **Objective** — Elimination · Cache Hunt · Awakening (survive escalating waves
  at the core) · Rescue (extract N dwellers) · Blueprint (reach and hack a
  terminal)
- **Modifiers** — negatives you *choose* to accept for a loot multiplier: no
  minimap, doubled enemy density, halved extraction pads, elemental affliction,
  a hunter that tracks you. A **Cursed Key** is a stacked pile of these.

**Objective completion is the only source of next-tier Keys.** You cannot
rat-loot your way up. You must actually do the thing sometimes.

**Generation: authored rooms, procedural graph.** Isaac's lesson, not noise.

1. A graph pass lays out nodes against a budget: 1 entry, 8–16 loot rooms, 2–4
   objective rooms, 1 vault core, 3+ extraction pads, 1–3 secrets behind
   conditions (a Vector talent, a key item, a wall you can break with Steel).
2. A room pass fills each node from a hand-authored prefab set for that
   archetype, then dresses it procedurally: enemy packs, cache placement,
   hazards, lighting, ambient story.

Room kinds: **Cache** (loot, light resistance) · **Arena** (a fight you must
solve) · **Environmental** (a hazard or traversal puzzle) · **Residential**
(dwellers, story, quiet dread) · **Toll** (Aberrant offer) · **Core** (objective
or boss).

Minimum viable authored content: roughly **60 room prefabs across 3 archetypes**
before the shuffle stops feeling repetitive. Budget for that honestly — it is the
biggest content cost in the project and the most common way games in this genre
ship feeling thin.

**Collapse, not a countdown.** Three phases with visible, audible transitions:

| Phase | What changes |
| --- | --- |
| **Quiet** | Full map open. Standard enemies. All extraction pads dormant. |
| **Stirring** | Extraction pads activate. Enemy tier +1. Un-looted caches upgrade a rarity tier. |
| **Collapse** | Rooms begin sealing from the perimeter inward. Elite spawns. Un-looted caches upgrade again. Half the pads go dark. |

Un-looted loot getting *better* as the vault gets *worse* is the lever that makes
staying a genuine temptation rather than a math error. Dark and Darker's
shrinking map, made into a greed engine.

**Extraction.** Pads are physical, they announce themselves audibly across the
level, and the channel takes time you cannot spend fighting. In Breach vaults
(§11) they are single-use. Your carried dweller must be alive when the channel
completes.

---

## 11. Solo, squads, and the PvP decision

**Recommendation: PvE-primary, opt-in PvP as a Key modifier.**

- Squads of **1–3**. Vault size, enemy density, and cache count are set at insert
  from squad size. Loot scales sublinearly, so solo is more loot-per-player and
  far more risk — no revives, one consumable self-revive, no one to carry the
  dweller.
- **Breach Key.** A modifier that opens your instance to other squads. Doubles
  loot, single-use extraction pads, and you can take what they were carrying.
  Ascension Debt makes you visible here.

The reasoning, because this is the biggest scope call in the document: building
PvP-first means every system is hostage to netcode, matchmaking, anti-cheat, and
balance-by-committee before the game is playable at all. Making contested play a
Key modifier means **the entire game ships and is fun with zero PvP**, and PvP
becomes content we add when the foundation is solid. Marathon is the reference
for *shells and modules*; it is not the reference for *what the game is*.

**No auction house, no player market, no currency trading.** Trading is
squad-only, in-vault, hand-to-hand. Gear inflation and RMT kill extraction
economies faster than any balance mistake, and once a market exists you can never
remove it.

---

## 12. The death spiral, and the valve

Every extraction game dies the same way: a player loses everything, cannot afford
to re-enter, and quits. Four independent countermeasures:

1. **Scav Key** (Marathon's Rook). Always available, free, unlimited. No
   loadout, no Rig, no risk — you drop in with a fixed body, a capped bag, and
   nothing to lose. It is the bottom rung and it is always there.
2. **The Kit.** The Armory always issues a free Bonded loadout. You are never
   literally naked.
3. **Charge banks every run.** Even a bad run that you barely escape moves the
   permanent line.
4. **Idle dwellers** pay junk while you are offline, so the vault economy never
   hits zero.

---

## 13. First-person feel

- **Inventory:** weight + slots, not full Tetris. Spatial inventory is legible on
  a monitor at a desk and illegible in a tense first-person moment. Weight
  governs sprint, jump, and extraction channel speed, so the greed decision is
  physical.
- **Looting is channelled** and audible. It is a pacing tool and, in Breach
  vaults, a vulnerability.
- **Sound is the primary intel channel.** Extraction pads, Collapse phases,
  another squad's looting, an Ascendant's flight — all read by ear before eye.
  Vector talents are largely about hearing and being heard.
- **The HUD is diegetic where cheap to do so** — Charge on the wrist, ammo on the
  weapon — with a clean fallback. Charge must be *always* visible; it is the
  number the whole risk model turns on.
- **Character screen** is a real room in the vault, not an overlay: paperdoll,
  Strain budget bar, the talent wheel on the wall, the Archive behind you.

---

## 14. Economy

Three currencies. No gold.

- **Junk** — bulk trash you extract. Feeds facility upgrades. Deliberately heavy,
  so hauling junk competes with hauling treasure.
- **Cores** — mid-rare. Craft and modify Keys. The gate on how often you can
  choose your run.
- **Charge** — talents only, and only via banking.

---

## 15. Open questions

Honest gaps, in priority order:

1. **Is the Charge tax fun or annoying?** 60% conversion may read as
   "the game is stealing my XP". Alternative: bank at 100% but cap per-run
   banking, so the pressure is to run *often* rather than to run *long*. Needs a
   prototype to feel.
2. **How much authored room content is the real minimum?** 60 is an estimate.
   If it is actually 200, the project shape changes.
3. **Does the Rig-slot model feel like progression or like a leash?** The risk is
   that unlocking a talent you cannot slot reads as a non-reward.
4. **Server authority cost.** PvE instanced co-op with an authoritative host is
   tractable; Breach vaults are not the same problem. Do not design Breach in
   detail until the PvE loop ships.
5. **Ascension Debt tuning.** "Powerful but loud" is elegant on paper and
   frequently just feels bad in play. Needs early testing.
6. **Dweller idle loop vs. session length.** If idle income outpaces active runs,
   the whole game becomes a phone game with an FPS attached.

---

## 16. If this gets built here

Mapping to JGengine, so the first implementation issue does not have to invent
its own architecture:

| System | Owner |
| --- | --- |
| Room prefabs, archetype tilesets, vault dressing | **`jgengine-editor`** — authored into `editor.scene.json`. The graph pass composes authored prefabs; no hardcoded geometry or coordinate arrays. |
| Vault graph generation, movement, AI, interaction, hazards | **`jgengine-world`** |
| Weapons, spells, melee, abilities, damage, ammo, loot tables | **`jgengine-combat`** |
| Charge, talents, Rig/Strain, dwellers, facilities, save state | **`jgengine-gameplay`** — serializable state, injected RNG |
| HUD, inventory, character screen, the talent wheel widget | **`jgengine-ui`** |
| Squads, instance authority, Breach | **`jgengine-multiplayer`** |

Reusable seams this would push upstream, per the build-capability-upstream
invariant: a **procedural item assembly** primitive (frame + parts + affixes +
rarity), a **radial talent graph** primitive (rings, spokes, adjacency gating), a
**risk-ledger** primitive (at-risk vs. anchored state with an atomic commit on
extract), and an **idle-worker assignment** primitive. All four are
genre-agnostic and all four would otherwise get handrolled game-locally.

Before code lands: file a `[FEATURE]` issue per vertical slice, and add a
`CREDITS.md` entry recording the six lineages in §2.

---

## References

- [Vault Hunters Official Wiki](https://wiki.vaulthunters.gg/Main_Page) · [Skills](https://vault-hunters.fandom.com/wiki/Skills) · [Vault Hunters 3](https://vault-hunters.fandom.com/wiki/Vault_Hunters_3)
- [Fallout Shelter rooms](https://fallout.fandom.com/wiki/Fallout_Shelter_rooms) · [Dwellers](https://fallout-archive.fandom.com/wiki/Vault_dwellers_(Fallout_Shelter)) · [Wasteland exploration](https://gamerant.com/fallout-shelter-best-tips-for-exploring-wasteland/)
- [Dark and Darker extraction](https://www.thegamer.com/dark-and-darker-extraction-guide/) · [Escape portals](https://gamerant.com/dark-and-darker-how-to-extract-escape/)
- [Marathon Runner shells and abilities](https://kotaku.com/marathon-runner-shells-trailer-abilities-bungie-2000660170) · [Class list](https://gamerant.com/bungie-marathon-game-full-list-of-confirmed-classes-comparison/)
- [Borderlands weapon parts](https://borderlands.fandom.com/wiki/Borderlands_2_Weapons) · [BL4 licensed parts](https://www.sportskeeda.com/esports/what-licensed-parts-system-borderlands-4)
- [Isaac level generation](https://www.boristhebrave.com/2020/09/12/dungeon-generation-in-binding-of-isaac/) · [Rebirth wiki](https://bindingofisaacrebirth.fandom.com/wiki/Level_Generation)
