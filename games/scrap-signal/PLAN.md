# scrap-signal plan

Brief: a Borderlands-like looter-shooter with a thought-out loop and hours of content, modelled on how Borderlands 2's first hours work.

## Direction

- References: Borderlands 2 (its opening hours: start unarmed, a guide robot, a chest with a plain pistol, quests one at a time from people, rolled guns from makers, a hub town with a vendor and a bank, a boss per act, "fight for your life"); Destiny 2 (gunfeel, a tracker that never covers the reticle); Diablo III (power you feel per level, loot you compare in the field).
- Faithfulness: inspired by. Borderlands 2's structure and pacing, Scrap Signal's own world (Ferralon), makers, numbers and names.
- Breadth in: first-person shooting, three characters with skill trees, XP and levels to 30, rolled guns (maker, family, element, parts, rarity, perks), element weaknesses, quests from NPCs, story gates between zones, a hub with vendors, a black market and a bank, a boss per act, second wind, side activities (signal mast, relay contract), Overdrive as the endgame.
- Out: co-op, vehicles, a second campaign, class mods and relics, a level cap past 30.
- Look and controls: first person, mouse and keyboard on desktop, the existing Ferralon desert art and rig HUD. Solo.
- Length: about 5 hours to finish the story and side quests, then Overdrive. A sitting is one zone or one act (30-60 minutes).
- Teaching: Bolt, a guide robot, gives the first quests and says what each new thing is the first time it matters; hints blend into the crash site and Rustflat Waste.
- Done scenario: from a new game, talk to Bolt, open the crash chest, take the plain pistol, clear the brats, learn a skill, beat Old Tusk and walk the opened road to Breakwater Shelf.
- Player promise: every kill can drop a better gun, and every level makes you stronger in a way you chose.
- Pillars: loot you want to read; power you chose; a world that opens in order.
- Anti-pillars: no handing out late-game kit at the start; no quest dump; no menu-only progress.
- Falsifier: if a new player has a second gun, three quests or an elemental weapon before the first fight, the opening is broken.

## Design brief

- Core loop: shoot a camp of scrapjacks and beasts, read the guns they drop, keep the better one
- Session loop: take one quest from an NPC, finish it in its zone, turn it in, level up and spend the skill point
- Long loop: three acts across six zones from Rustflat Waste (level 1) to Cores Blight (level 24), each opened by the story and ended by a boss, with rarer guns and a fuller skill tree on the way, then Overdrive
- Second 0: crashed and unarmed at the bus wreck with Bolt in sight, so the first verbs are walking and talking, and the first gun is earned from a chest
- Onboarding: Bolt says what each thing is the first time it matters, and hints sit in the crash site; nothing is taught from a menu
- Pace: something new every 2 minutes
- Longest cycle: 60 minutes, one act from its first quest to its boss
- Minutes to see everything: 300

### First 10 minutes

- 0:00 crashed and unarmed by the bus wreck; teaches walking and talking to Bolt with E
- 0:15 Bolt gives My First Gun; teaches opening the crash chest and picking up; unlocks the first weapon slot with a plain common pistol
- 0:45 back to Bolt, who gives Target Practice; teaches aiming, shooting and reloading on the bruiser brats
- 2:00 level 2; unlocks the skill tree and teaches spending the first point with K
- 2:30 Bolt gives Bruiser Bash; teaches armour and the element chart on the bruisers by the convoy
- 4:00 level 3; unlocks green (uncommon) and elemental guns; teaches comparing a drop before taking it
- 5:00 Bolt gives Old Tusk, the crash site's mini-boss; teaches the second wind (kill while down to get back up)
- 7:00 Old Tusk down; unlocks the second weapon slot and a guaranteed green gun
- 8:00 Bolt gives Road to the Shelf; unlocks the Breakwater Shelf gate and its fast-travel station
- 9:30 Breakwater Shelf, level 4; teaches new enemies (husk drones, scav drones) and fast travel

### Start state

| Probe | At most |
| --- | --- |
| gunsSeen | 0 |
| questsSeen | 0 |
| enemiesSeen | 0 |
| skillsSeen | 0 |
| zonesSeen | 1 |
| unlocks | 0 |
| taught | 0 |

### Content budget

| Kind | Count |
| --- | --- |
| quests | 48 |
| enemies | 32 |
| guns | 66 |
| skills | 27 |
| zones | 6 |

### Systems

| System | Probe |
| --- | --- |
| combat | kills |
| quests | questsDone |
| loot | gunsLooted |
| leveling | xp |
| skills | skillsLearned |
| economy | cash |

The kinds are counted from the game's data: `quests` is every quest in the catalog; `enemies` every enemy type a zone, camp or boss spawns; `guns` every gun model (a maker and a family) plus every named legendary; `skills` the active character's skill-tree nodes; `zones` the six zones. A kind's `Seen` is what the player has accepted, killed, held, learned or entered.

## Features

- unarmed start — no weapon, no quest at second 0; Bolt in sight
- quest givers — NPCs offer one quest at a time and take it back when it is done
- starter chest — the first quest's chest holds a plain common pistol
- XP and levels — kills and quests pay XP; each level gives health and one skill point
- skill tree — three characters × three branches × nine nodes with real choices and a paid respec
- rolled guns — maker, family, element, parts and perks, named from their parts
- rarity by level — green from level 3, blue 6, purple 12, legendary 18
- element weaknesses — flesh burns, armour corrodes, shields short out; shown on the target
- hub — Coretown with a gun vendor, a medic, the black market and a bank
- bank — guns kept in Coretown across the run
- zone gates — each zone opens with a story quest and shows its enemy level
- bosses — one per act: Captain Rusk, Wreck-Maw, the Foundry Heart, plus Old Tusk at the crash site
- side quests — given by the hub's NPCs, the signal mast and the relay contract
- second wind — down at zero health, a kill gets you back up
- onboarding hints — Bolt's lines and field notes blended into the crash site, one hint at a time
- quest marker — a pin over the tracked objective, an edge arrow with the distance when it is off screen
- ammo for what you carry — kills drop ammo for the carried gun that is emptiest
- from-zero proof — a new game played for ten minutes through real input

## Engine coverage

| Feature | Engine | Verdict |
| --- | --- | --- |
| quest givers | `@jgengine/core/mission/quest` (`QuestDef.giver`, `turnIn`, `requires`, `rewards.quests`) | covered |
| XP and levels | `@jgengine/core/progression/leveling` | covered |
| skill tree | `@jgengine/core/progression/skillTree` | covered |
| rolled guns | `@jgengine/core/item/itemgen`, `@jgengine/core/loot/lootGen` | covered |
| rarity by level | `@jgengine/core/progression/gates` (`createGateSet`) | partial: the game reads its own rarity table through the gate set |
| element weaknesses | `@jgengine/core/combat/damage/damageRuntime` resistance chart | covered |
| hub vendors | `@jgengine/core/economy/transactionLedger` | covered |
| bank | `@jgengine/core/inventory/inventoryModel` | covered: a named inventory the hub terminal opens |
| zone gates | `@jgengine/core/progression/gates` | covered |
| bosses | `@jgengine/core/ai/director/boss` | covered |
| second wind | `@jgengine/core/combat/downed` | covered |
| onboarding hints | `@jgengine/core/onboarding/onboardingSystem` (blended style) and `OnboardingHud` | covered |
| quest marker | `@jgengine/core/map/waypointMarkers.view` | covered: the game picks the point, the engine draws the pin and edge arrow |
| from-zero proof | `@jgengine/core/play/headlessFlow.draw` | covered |

## Milestones

- [x] 1. Design brief.
- [x] 2. The opening: unarmed start, Bolt gives quests one at a time, the crash chest's plain pistol, quests turned in to their giver, Old Tusk as act 1's boss, zones closed until their story quest, rarity tiers and the skill tree opening with level, weapon slots opening with the story.
- [x] 3. Gates: element weakness on the target, a bank in Coretown in place of the field stash.
- [ ] 4. Content to the budget: quests, enemy types, gun parts and gun models as data.
- [ ] 5. From-zero proof: ten minutes from a new game through real input; Scrap Signal off the known-failing list.
- [x] 6. Onboarding hints in the crash site through the engine onboarding system.
