# Vaultbreak — design

A first-person extraction RPG. You own a vault full of people. You key into other
vaults — dead ones — kill what lives there now, take what you can carry, and get
out. Extract and you keep going. Die and the character ends.

**There are no classes.** Every ability in the game — a fireball, a rifle, a
shield, super speed, a rocket launcher — is an *item you find on something you
killed*. Your class is whatever is in your slots this hour.

Status: design only. No code exists yet. This document is the spec to argue with
before anything gets built.

---

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

---

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

---

## 3. What the references actually give us

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
tap-to-collect monetisation shape, Marathon's PvP-first foundation (§12).

---

## 4. Augs — the ability system

An **Aug** is any equippable active. One category, six families:

| Family | Examples | Feels like |
| --- | --- | --- |
| **Arms** | rifles, SMGs, launchers, bows | Ammo, reloads, recoil |
| **Edge** | swords, hammers, gauntlets, whips | Stance, momentum, parry timing |
| **Focus** | fireball, chain arc, frost lance, unmaking | Cast time, mana-ish charge, channel |
| **Ward** | bubble shield, deflect plate, phase skin | Uptime and cooldown windows |
| **Kinetic** | super speed, flight, blink, leap, ironhide | Movement as a weapon |
| **Field** | turrets, totems, gravity wells, healing pools | Placement and zoning |

They all occupy **the same slot type**. This is the whole point. A veteran with
seven slots running *rocket launcher + fireball + flight + bubble shield + sword +
turret + blink* is not a class, is not a build archetype anyone designed, and is
exactly what you were asking for.

**Anatomy.** Aug = **Frame** + 2–4 **Parts** + rolled **Affixes** + **Rarity**.
Parts come from opinionated Foundries and are swappable at home (§9), so a bad
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

---

## 5. Enemies are the drop table

Because Rule 1 says abilities are loot, the enemy roster and the ability roster
are the same roster. **Enemies are assembled exactly like players are: a Frame
plus Augs.** What an enemy is holding is what it fights you with, and what it
fights you with is what it drops.

| Enemy frame | Role | Typical Augs |
| --- | --- | --- |
| **Husk** | Chaff, swarms | 1 low-tier Arm or Edge |
| **Warden** | Line-holder, armored | 1 Arm + 1 Ward |
| **Choirman** | Caster, backline | 2 Focus |
| **Stalker** | Flanker, fast | 1 Kinetic + 1 Edge |
| **Engineer** | Zoner | 1 Field + 1 Arm |
| **Titan** | Elite, room-boss | 3 Augs + a modifier |
| **Herald** | Named, objective boss | Vaultborne Aug |

Four things fall out of this for free, which is why it is worth building the
enemy system this way rather than hand-authoring monsters:

1. **Perfect telegraphing.** You can see the fireball on the Choirman's arm
   before it casts. You know how the fight goes *and* what the reward is, at a
   glance, in first person. Threat-read and loot-lust are the same read.
2. **Hunting is a real verb.** Want a launcher? Ordnance-biased archetypes have
   Wardens carrying them. Want flight? The Choir's Stalkers have it. Vault
   archetype is a shopping list, and Cartography (§9) tells you which.
3. **Difficulty and reward move together automatically.** An enemy that got
   scarier got scarier by carrying something better, which is the thing you now
   want. No separate tuning pass.
4. **Content scales with the Aug library, not with a monster budget.** Every new
   Aug is also a new enemy behaviour.

**Rules that keep it honest:** an enemy drops one of its visible Augs, never all
of them, at a rarity roll below its own. Elites drop with certainty; chaff
rarely. Enemy Augs use player cooldowns and player numbers with AI-facing
tuning — if it felt unfair to fight, it will feel great to hold, and that
symmetry is the sales pitch.

---

## 6. Slots — the real progression

Slots come from three places, and they are deliberately different in kind:

| Source | Scope | Ceiling |
| --- | --- | --- |
| **Quest / contract chains** | **Anchored — permanent, all future careers** | +2 over the whole game (so: careers start at 1, then 2, then 3) |
| **Talent wheel — Capacity spoke** | **Career — lost on death** | +3 or so, expensive, deep in the spoke |
| **Rig chassis** | **Career — lost with the rig** | +1 to +2 on good chassis, at a Strain cost |

So the numbers: a first-ever career runs **one** slot. A late-game player starts
every career at **three**. A great career peaks around **seven**, then ends.

**Strain.** Slots say how many; Strain says how good. Your rig has a Strain
budget and every equipped Aug costs Strain by rarity and tier. Seven slots does
not mean seven Relics — it means seven things you could afford to carry at once.
This is the primary anti-power lever and it is a knob we can turn per patch
without touching content.

**Swapping.** Augs can be swapped mid-delve at any **Bench** (found in
Residential rooms) or instantly if you have the Kinesis talent for it. What you
are *not* carrying goes in the bag, and the bag dies with you.

The first quest chain is therefore the most important onboarding in the game:
going from one slot to two is the moment the whole "any combination you want"
promise becomes real, and it should land inside the first hour.

---

## 7. The talent wheel

**Talents are career-scoped. You lose them when you die.** They are not a
second ability system — they are the layer that says how much you can carry, how
hard it hits, how fluidly you use it, and what happens when two Augs touch.

Charge accrues in a delve (kills, objectives, first-time rooms, cracked caches,
rescued dwellers), levels the career, and buys nodes. Extract and you keep it.
Die and it is gone with everything else. **There is no banking and no
conversion tax** — extraction itself is the save.

A circle. You start at the centre. Five spokes, four rings.

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
| **Kinesis** | Movement, use-while-moving, cooldowns, reloads, recharge | Fluid Cast, Sprint-Reload, Momentum, *Apex:* **Untethered** — every Aug usable airborne and while sprinting |
| **Vitality** | Health, shields, sustain, revive, downed resistance | Ironbone, Second Wind, Leech, *Apex:* **Refusal** — one death per delve becomes a downed state |
| **Fortune** | Loot quality, cache detection, seal cracking, extraction speed, junk yield | Diviner, Pry, Fast Hands, *Apex:* **Prospect** — Sealed drops roll one tier higher |

Note what is *absent*: no fire spoke, no gun spoke, no melee spoke. Damage type
is loot's job. The wheel never gives you a power — it decides what you can do
with the powers you found.

**Resonance seams.** Between every pair of adjacent spokes sit nodes requiring
points in both. This is where two equipped Augs start talking to each other, and
it is the Isaac lesson: synergy over stats.

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
speed. It exists so a one-slot fresh career has somewhere to put its first point
immediately.

**Respec** is free at the vault between delves. Experimentation is content.
Punishing it in a game that already deletes your character is piling on.

---

## 8. Death, and the two ledgers

**Run ledger — lost on death.** The whole character.

- Every equipped Aug and everything in the bag
- The rig: chassis, armor, trinkets
- **Every talent point and the entire wheel**
- Unspent Charge and the career level
- Any dweller you were carrying out
- The career's Notoriety, streak, and record — it closes and gets a headstone

**Anchored ledger — never lost, ever.**

- The vault, every facility and its level
- The dweller roster and their stats
- The stash — *materials only* (see the hard rule below)
- **Base slot count** from completed quest chains
- Blueprints, foundry licences, recipes
- The Archive (item codex) and every small passive it has granted
- Clearance rank — which key depths you may craft
- Legacy (§11), cosmetics, career records, titles

**The hard rule that protects the whole design: Augs and rigs cannot be
stashed.** The vault stores junk, cores, parts, reagents and knowledge — it
stores *potential*, never power. The instant a player can bank a Relic launcher
for next time, death stops mattering and the entire game unwinds. Everything in
§9 is designed to respect this.

**Two softeners, both costed:**

- **Echo insurance.** Before a delve you may insure exactly one Aug for a junk
  fee. If the career ends, that Aug is issued to your *next* career at its start
  — not to the stash. Long per-item cooldown. It is a soft landing, not a
  savings account.
- **Headstone recovery.** A dead career leaves a headstone: a one-room hostile
  instance, live for 24h, seeded where you fell. Your *new* career may enter it
  — at whatever slot count it currently has — and try to take back one item.
  Losing a fresh career to your own corpse is a very funny way to lose.

---

## 9. The home vault

First person, walkable, quiet, yours. Not a menu with a background. Your
dwellers live there, your Archive uniques are on the wall, and the career you
just ended is a headstone in the atrium.

| Facility | Does | Fed by |
| --- | --- | --- |
| **Vault Door** | Insert a Key, form a squad, start or resume a career | — |
| **Armory** | Sets the **Kit**: the Aug you spawn a new career holding. Upgrading widens the *menu* you may choose from, drawn from your Archive. | Junk + scrap |
| **Assay Lab** | Cracks sealed Augs, rerolls one affix | Junk + reagents |
| **Foundry Bench** | Swap parts between Augs; apply foundry licences | Parts + licences |
| **Cartography** | Craft and modify Keys; shows which archetypes' enemies carry which Aug families | Cores |
| **Reliquary** | The Archive; displays uniques you have extracted; career headstones | — |
| **Barracks** | Dweller roster, assignment, training, idle expeditions | Food + beds |
| **Terminal** | Contracts (the quest chains that grant permanent slots), squad-finding, leaderboards, credits | — |
| **Workshop** | Craft rigs and baseline Augs from stashed parts — always below field-drop quality | Parts + cores |

**The Armory is the interesting one.** It cannot give you a Relic. What it can do
is let you *choose* what your one starting Aug is, from the families you have
archived. Starting a career with a fireball instead of a pistol is enormous for
how the first ten minutes play, and costs nothing in power. That is the shape
every facility should have: **facilities raise the floor and never the ceiling.**

**Dwellers.** Rescued from delves; they are a side objective that competes with
loot, since carrying one slows you and it must be extracted alive.

- Three stats: **Grit** (labour, defence), **Wit** (analysis, crafting),
  **Nerve** (risk, exploration).
- Assign to facilities: high Wit in the Assay Lab improves seal rolls, high Grit
  in the Armory widens the Kit menu, high Nerve in Cartography unlocks deeper Key
  modifiers.
- **Idle expeditions.** Send them out while you are logged off. They return junk,
  cores, parts and rumours (a rumour reveals which archetype holds a specific
  Vaultborne). They can die out there. This is the Fallout Shelter loop and it is
  what makes logging in tomorrow worth it — especially the morning after a career
  died.

---

## 10. Delves

**Keys.** Crafted at Cartography, consumed on insert, and they fully determine
the run:

- **Depth** (1–10) — enemy tier, Aug tier, gated by Clearance
- **Archetype** — *Hydroponics, Cold Storage, The Choir, Reactor Deck,
  Habitation, The Long Hall.* Sets tileset, enemy frames, hazard, music, **and
  which Aug families you will find**, because the enemies are the drop table.
- **Objective** — Elimination · Cache Hunt · Awakening (survive escalating waves
  at the core) · Rescue (extract N dwellers) · Blueprint (reach and hack a
  terminal)
- **Modifiers** — negatives you *choose* for a loot multiplier: no minimap,
  doubled density, halved extraction pads, elemental affliction, a hunter that
  tracks you. A **Cursed Key** is a stack of them.

Objective completion is the only source of next-tier Keys and the only source of
Clearance. You cannot rat-loot your way down.

**Generation: authored rooms, procedural graph.** Isaac's lesson, not noise.

1. A graph pass lays out nodes to a budget: 1 entry, 8–16 loot rooms, 2–4
   objective rooms, 1 core, 3+ extraction pads, 1–3 secrets behind conditions (a
   Kinesis talent, a key item, a wall a heavy Edge Aug can break).
2. A room pass fills each node from a hand-authored prefab set for the
   archetype, then dresses it: enemy packs assembled per §5, cache placement,
   hazards, lighting, ambient story.

Room kinds: **Cache** · **Arena** · **Environmental** (hazard/traversal) ·
**Residential** (dwellers, benches, story, quiet dread) · **Toll** (Aberrant
offer) · **Core** (objective or Herald).

Minimum viable authored content: roughly **60 room prefabs across 3 archetypes**
before the shuffle stops feeling repetitive. Budget for that honestly — it is the
largest content cost in the project and the usual way games in this genre ship
feeling thin.

**Collapse, not a countdown.** Three phases, each with a visible and audible
transition:

| Phase | What changes |
| --- | --- |
| **Quiet** | Full map. Standard enemies. Extraction pads dormant. |
| **Stirring** | Pads activate. Enemy frames upgrade a tier. Un-looted caches upgrade a rarity tier. |
| **Collapse** | Rooms seal from the perimeter inward. Titans spawn. Caches upgrade again. Half the pads go dark. |

Un-looted loot getting *better* as the vault gets *worse* is the lever that makes
staying a genuine temptation rather than a math error.

**Extraction.** Pads are physical, announce themselves audibly across the level,
and the channel takes time you cannot spend fighting. Carried dwellers must be
alive when it completes.

---

## 11. Keeping careers finite

With talents on the run ledger, the balance risk is no longer a permanently
overpowered account — it is one unbroken 200-delve career. Five levers:

1. **Strain** caps simultaneous power regardless of slot count (§6).
2. **One Apex.** However many rim capstones you unlock, exactly one may be
   active. Your ceiling is a per-delve choice.
3. **Depth pressure.** Charge and loot from content below your Clearance decay
   sharply. A career that refuses to go deeper stops growing, so every long
   career is necessarily deep in lethal territory. Self-correcting.
4. **Notoriety.** The deeper and longer a career runs, the more the vaults know
   it. Hunters spawn — Stalker frames carrying *your own* Aug families, tuned to
   counter you. Loot rises with it. A great career gets more thrilling and more
   finite at the same time, and it dies to something that felt personal.
5. **Aberrant costs** are career-scoped, so the strongest Augs make the career
   they belong to shorter.

The number to hold ourselves to: **best possible loadout beats a fresh one-slot
career by roughly 5×, not 50×.** Everything above exists to keep that ratio.

**Legacy** is the one thin permanent thread: earned by career *milestones*
(deepest Clearance, first-time Archive entries, contract chains), spent only on
the vault. It buys floor — a better Kit menu, a faster Assay, another dweller
bunk — never a stat.

---

## 12. Solo, squads, and the PvP decision

**Recommendation: PvE-primary, opt-in PvP as a Key modifier.**

- Squads of **1–3**. Vault size, enemy density and cache count are set at insert
  from squad size. Loot scales sublinearly, so solo is more loot-per-player and
  far more risk — no revives, and one Vitality Apex is the only safety net.
- **Breach Key.** Opens your instance to other squads. Doubles loot, makes pads
  single-use, and lets you take the Augs off a career you just ended. Killing
  another player ends *their* career. That should be a heavy thing.

Building PvP-first means every system is hostage to netcode, matchmaking,
anti-cheat and balance-by-committee before the game is playable at all. As a Key
modifier, **the entire game ships and is fun with zero PvP**, and contested play
becomes content added on a solid foundation.

**No auction house, no market, no currency trading.** Trading is squad-only,
in-vault, hand to hand. This also follows from the no-stashing rule: a market for
Augs is a stash with extra steps.

---

## 13. The death spiral, and the valve

Losing a career must not lose the player. Four independent countermeasures:

1. **Scav Key** (Marathon's Rook). Always free, always available. Fixed body, one
   fixed Aug, capped bag, nothing to lose. The bottom rung is always there.
2. **The Kit.** A new career always spawns holding something you chose.
3. **The floor moves.** Quest-granted base slots, Archive passives and facility
   levels mean career #12 starts materially better-equipped than career #1, with
   no stat inflation.
4. **Idle dwellers** pay junk while you are offline, so the vault economy never
   hits zero — and the night your career dies, tomorrow already has something in
   it.

---

## 14. First-person feel

- **Inventory:** weight + slots, not Tetris. Spatial grids are legible at a desk
  and illegible in a tense first-person moment. Weight governs sprint, jump and
  extraction channel speed, so greed is physical.
- **Aug wheel** is the core input surface: radial select, hold to swap, and it
  must be readable at a glance with three slots or seven. This is the single most
  important UI in the game and should be prototyped before anything else.
- **Looting is channelled** and audible — a pacing tool, and a vulnerability.
- **Sound is the primary intel channel.** Pads, Collapse phases, another squad
  looting, a Kinetic Aug firing. Enemy Augs are audible before visible.
- **Enemies read by silhouette + held Aug.** See §5 — this is a rendering
  requirement, not a nice-to-have: every enemy must visibly wear its drop.
- **Character screen** is a real room in the vault: paperdoll, Strain bar, the
  wheel on the wall, the Archive behind you, headstones down the hall.

---

## 15. Economy

Three currencies, no gold.

- **Junk** — bulk trash. Feeds facilities. Deliberately heavy, so hauling junk
  competes with hauling Augs.
- **Cores** — mid-rare. Craft and modify Keys. The gate on how often you choose
  your run.
- **Charge** — the wheel only, career-scoped, deleted on death.

---

## 16. Open questions

Honest gaps, in priority order:

1. **Does losing the whole wheel land as tragedy or as tedium?** Isaac gets away
   with it because a run is 40 minutes; ours is potentially 20 hours. Notoriety
   (§11.4) exists so careers end at a dramatic peak rather than to a bad
   corridor, but that is a theory until it is played. This is the single riskiest
   assumption in the document.
2. **Is one starting slot too thin to be fun for the first hour?** It is the
   cleanest expression of the fantasy and possibly a miserable tutorial. The
   first contract chain may need to grant slot 2 within 20 minutes.
3. **How much authored room content is the real minimum?** 60 is an estimate. If
   it is 200, the project shape changes.
4. **Aug library size.** Enemy variety is now downstream of Aug count, so a thin
   library is a thin bestiary. Guess: **~50 Augs across the six families** before
   the vaults stop repeating themselves.
5. **Server authority cost.** Instanced PvE co-op with an authoritative host is
   tractable; Breach is a different problem. Do not design Breach in detail until
   PvE ships.
6. **Dweller idle loop vs. session length.** If idle income outpaces active
   delves, this becomes a phone game with an FPS attached.

---

## 17. If this gets built here

| System | Owner |
| --- | --- |
| Room prefabs, archetype tilesets, dressing | **`jgengine-editor`** — authored into `editor.scene.json`; the graph pass composes authored prefabs. No hardcoded geometry or coordinate arrays. |
| Vault graph generation, movement, enemy AI, interaction, hazards | **`jgengine-world`** |
| Augs as abilities, damage, ammo, cooldowns, enemy Aug assembly, drop tables | **`jgengine-combat`** |
| Career state, Charge, wheel, slots/Strain, dwellers, facilities, save | **`jgengine-gameplay`** — serializable state, injected RNG |
| Aug wheel, HUD, inventory, character room, talent circle widget | **`jgengine-ui`** |
| Squads, instance authority, Breach | **`jgengine-multiplayer`** |

Reusable seams this pushes upstream, per the build-capability-upstream
invariant — all four genre-agnostic, all four otherwise handrolled game-locally:

- **Procedural item assembly** — frame + parts + affixes + rarity
- **Shared ability sockets** — one primitive where an NPC's equipped ability set
  *is* its behaviour set *is* its drop table
- **Radial talent graph** — rings, spokes, adjacency gating
- **Risk-ledger state** — at-risk vs. anchored partitions with an atomic commit
  on extract

Before code lands: a `[FEATURE]` issue per vertical slice, and a `CREDITS.md`
entry recording the six lineages in §3. First slice should be the Aug wheel plus
one archetype plus §5's enemy assembly — that trio is the game.

---

## References

- [Vault Hunters Official Wiki](https://wiki.vaulthunters.gg/Main_Page) · [Skills](https://vault-hunters.fandom.com/wiki/Skills) · [Vault Hunters 3](https://vault-hunters.fandom.com/wiki/Vault_Hunters_3)
- [Fallout Shelter rooms](https://fallout.fandom.com/wiki/Fallout_Shelter_rooms) · [Dwellers](https://fallout-archive.fandom.com/wiki/Vault_dwellers_(Fallout_Shelter)) · [Wasteland exploration](https://gamerant.com/fallout-shelter-best-tips-for-exploring-wasteland/)
- [Dark and Darker extraction](https://www.thegamer.com/dark-and-darker-extraction-guide/) · [Escape portals](https://gamerant.com/dark-and-darker-how-to-extract-escape/)
- [Marathon Runner shells and abilities](https://kotaku.com/marathon-runner-shells-trailer-abilities-bungie-2000660170) · [Class list](https://gamerant.com/bungie-marathon-game-full-list-of-confirmed-classes-comparison/)
- [Borderlands weapon parts](https://borderlands.fandom.com/wiki/Borderlands_2_Weapons) · [BL4 licensed parts](https://www.sportskeeda.com/esports/what-licensed-parts-system-borderlands-4)
- [Isaac level generation](https://www.boristhebrave.com/2020/09/12/dungeon-generation-in-binding-of-isaac/) · [Rebirth wiki](https://bindingofisaacrebirth.fandom.com/wiki/Level_Generation)
