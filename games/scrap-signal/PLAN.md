# scrap-signal plan

Brief: JUNK DRAWER, a looter-shooter in a sprawling, overgrown suburb after the appliances revolted. Every weapon is assembled from household junk, and every weapon has a personality that talks to you. (Redesigned from an earlier Borderlands-like brief into its own game; the user approved the direction: "just do it, be really creative".)

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
## Suite score

What players must be able to do, proven by headless simulation in `bun test` (`jgengine suite scrap-signal`). This is the headline; the engine coverage table below only hints where the engine has a part.

| Area | Proven | Failing | Not simulatable | Missing | Cut |
| --- | --- | --- | --- | --- | --- |
| onboarding | 2/2 | 0 | 0 | 0 | 0 |
| failure | 1/1 | 0 | 0 | 0 | 0 |
| save | 1/1 | 0 | 0 | 0 | 0 |
| settings | 1/1 | 0 | 0 | 0 | 0 |
| menu | 1/1 | 0 | 0 | 0 | 0 |
| progression | 1/1 | 0 | 0 | 0 | 0 |
| content | 5/5 | 0 | 0 | 0 | 0 |
| shooter | 4/4 | 0 | 0 | 0 | 0 |
| loot | 4/4 | 0 | 0 | 0 | 0 |
| **total** | **20/20** | 0 | 0 | 0 | 0 |

<details><summary>Every required entry</summary>

Genres: shooter, looter. 20/20 proven.

| Entry | Status | What the player does | Detail |
| --- | --- | --- | --- |
| `onboarding.first-goal` | proven | A new game shows a first goal, and the first player action toward it advances it. | proofs/sim/first-goal.proof.ts |
| `onboarding.find-features` | proven | A player following the game's own guidance reaches the first use of every core feature. | proofs/sim/find-features.proof.ts |
| `failure.lose-and-recover` | proven | The player can fail (die, lose the run, go broke) and the game puts them back into play at a stated cost. | proofs/sim/downed-reconstruct.proof.ts |
| `save.continue` | proven | Progress made by playing survives saving and continuing. | proofs/sim/save-continue.proof.ts |
| `settings.controls` | proven | The player opens settings and a change (a binding, volume, sensitivity) takes effect. | proofs/sim/rebind-reload.proof.ts |
| `menu.start-and-credits` | proven | The main menu starts a game and shows the credits. | proofs/sim/menu-credits.proof.ts |
| `progression.runway` | proven | Something new unlocks steadily across the first five hours, up to the progression cap. | content check |
| `content.item-source` | proven | Every item can be obtained by playing. | content check |
| `content.item-use` | proven | Every item does something: crafts, equips, eats, places, feeds, sells or summons. | content check |
| `content.recipes-reachable` | proven | Every recipe and source can actually be used: its inputs, station and unlock are all obtainable. | content check |
| `content.placeables-place` | proven | Every item that says it can be placed can be placed. | content check |
| `content.weapons-have-ammo` | proven | Every weapon that fires has obtainable ammo, or needs none. | content check |
| `shooter.aim-fire-hit` | proven | Aim, fire, and hurt an enemy. | proofs/sim/aim-fire-hit.proof.ts |
| `shooter.reload-ammo` | proven | Weapons run dry and reload from carried ammo. | proofs/sim/reload.proof.ts |
| `shooter.enemy-threat` | proven | Enemies find the player and hurt them. | proofs/sim/enemy-threat.proof.ts |
| `shooter.weapon-swap` | proven | Switch between carried weapons. | proofs/sim/weapon-swap.proof.ts |
| `loot.drops-rarity` | proven | Defeated enemies and containers drop loot of varied rarity. | proofs/sim/drops-rarity.proof.ts |
| `loot.gear-upgrade` | proven | Equipping better gear changes the player's numbers. | proofs/sim/workbench-merge.proof.ts |
| `loot.vendor-or-salvage` | proven | Unwanted loot sells or salvages into something useful. | proofs/sim/workbench-salvage.proof.ts |
| `loot.build-choices` | proven | Perks or skills let the player shape a build. | proofs/sim/skill-spend.proof.ts |

</details>
<!-- /suite-score -->

## Direction

- References: Saturday-morning cartoons and *Toy Story* (household things with big personalities); the looter-shooter loop of reading a drop and keeping the better one; Destiny 2 (gunfeel, a tracker that never covers the reticle); Diablo III (power you feel per level, loot you compare in the field). Its own game, not modelled on any one shooter.
- Faithfulness: original. JUNK DRAWER's world (Maple Hollow), weapons, enemies, numbers and names are its own.
- The pitch: the appliances took a bad firmware update and revolted. A sprawling, overgrown suburb is held by rogue Roombas, lawnmowers, sprinkler turrets, smart fridges, garage doors and delivery drones. The last neighbours hold one cul-de-sac. Every weapon left is household junk with a trigger bolted on, and **every weapon has a personality that talks to you**.
- Breadth in: first-person shooting; weapons built from a **Body** (staple gun, nail gun, leaf blower, garden hose, microwave, toaster, vacuum, fire extinguisher), a **Mod** (duct tape, extension cord, batteries, glitter, cinder block, rubber bands, firecrackers, laundry basket) and a **Personality** (Grumpy, Cheerful, Paranoid, Dramatic, Philosophical, Clingy, Competitive) with a perk, a quirk and voice lines; **Condition** in place of rarity (Busted, Used, Like New, Mint, Heirloom, heirlooms with a backstory); element loads (hot sauce, static, bleach, fizz, glitter); three tinkerers with skill trees; XP and levels to 30; quests from the neighbours; six neighbourhoods opened by the story; Hank's garage workbench to shelve, salvage and merge weapons; a boss per act; the Last Gasp comeback; side activities (the dish watch, the radio contract); the Block Party ladder as the endgame.
- Out: co-op, vehicles, a second campaign, class mods, a level cap past 30, voiced audio (the weapons speak in speech bubbles).
- Look and controls: first person, mouse and keyboard on desktop; a bright suburban afternoon, overgrown lawns, colourful junk, every weapon visibly built from its parts with googly eyes. Solo.
- Length: about 5 hours to finish the story and side quests, then the Block Party. A sitting is one neighbourhood or one act (30-60 minutes).
- Teaching: DING, a video doorbell that defected, gives the first errands and says what each new thing is the first time it matters; the fridge-magnet notes blend into Crabgrass Court. The weapons teach themselves: each one introduces itself when picked up.
- Done scenario: from a new game, talk to DING, open the school bus's toy chest, take the cheerful busted staple gun, mow down the push mowers, learn a skill, beat Big Mulch, walk the opened road to Sprinkler Heights, and merge two weapons at Hank's bench.
- Player promise: every kill can drop a better piece of junk, every piece of junk is somebody, and every level makes you stronger in a way you chose.
- Pillars: junk you want to read (and listen to); power you chose; a suburb that opens in order.
- Anti-pillars: no late-game kit at the start; no quest dump; no menu-only progress; no personality that is only flavour (each one changes how you play it).
- Falsifier: if a new player has a second weapon, three errands or an element-loaded weapon before the first fight, or cannot say what their weapon's personality does after ten minutes, the opening is broken.

## Design brief

- Core loop: clear a yard of rogue appliances, read the junk they drop (body, mod, condition, personality), keep the one you like, and listen to it complain
- Session loop: take one errand from a neighbour, finish it in its neighbourhood, turn it in, level up, spend the skill point, and salvage or merge the spare junk at Hank's bench
- Long loop: three acts across six neighbourhoods from Crabgrass Court (level 1) to the Smart Home Estates (level 24), each opened by the story and ended by a boss (Big Mulch, the Leaf Blower King, the Compactor, Mother Router), with better condition junk and a fuller skill tree on the way, then the Block Party
- Second 0: stranded and empty-handed by the overturned school bus with DING in sight, so the first verbs are walking and talking, and the first weapon is earned from a toy chest
- Onboarding: DING says what each thing is the first time it matters, the notes sit on the fridge-magnet board, and every weapon explains itself on its card and in its own voice; nothing is taught from a menu
- Pace: something new every 2 minutes
- Longest cycle: 60 minutes, one act from its first errand to its boss
- Minutes to see everything: 300

### First 10 minutes

- 0:00 stranded and empty-handed by the school bus; teaches walking and talking to DING with E
- 0:15 DING gives Junk Drawer; teaches opening the toy chest and picking up; unlocks the first weapon slot with a busted, cheerful staple gun that introduces itself
- 0:45 back to DING, who gives Target Practice; teaches aiming, shooting and reloading on the push mowers, and that the weapon talks when it reloads and kills
- 2:00 level 2; unlocks the skill tree and teaches spending the first point with K
- 2:30 DING gives Lawn Order; teaches the element chart (hot sauce melts plastic) on the lawnmower brutes by the driveway
- 4:00 level 3; unlocks Used (uncommon) and element-loaded junk; teaches comparing a drop's body, mod and personality before taking it
- 5:00 DING gives Big Mulch, the crash site's riding-mower boss; teaches the Last Gasp (kill while down to make a comeback)
- 7:00 Big Mulch down; unlocks the second weapon slot (and the first switch-away complaint) and a guaranteed Used drop
- 8:00 DING gives Up the Hill; unlocks the Sprinkler Heights gate and its bus stop
- 9:30 Sprinkler Heights, level 4; teaches new appliances (Roombas, sprinkler turrets) and the bus route

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
| guns | 114 |
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

The kinds are counted from the game's data: `quests` is every errand in the catalog; `enemies` every appliance type a neighbourhood, camp or boss spawns; `guns` every weapon model (each mod on each body: 8 × 8) plus the 22 heirlooms and the 28 neighbours' quest-reward uniques; `skills` the active tinkerer's skill-tree nodes; `zones` the six neighbourhoods. A kind's `Seen` is what the player has accepted, killed, held, learned or entered.

Internal ids keep their earlier names (zone `rustflat_waste`, enemy `husk`, family `pistol`, rarity `legendary`, NPC `bolt`, ...): they are the save, scene and proof identity. Every name a player reads comes from the display fields.

## Features

- empty-handed start — no weapon, no errand at second 0; DING in sight
- quest givers — DING, Nana Pruitt, Hank and Mr. Fenwick offer one errand at a time and take it back when it is done
- starter chest — the first errand's toy chest holds a busted, rubber-banded, cheerful staple gun
- junk weapons — `src/game/handroll/guns.ts`: eight bodies (each with its own way of shooting: the vacuum drags targets in, the extinguisher chills and slows), eight mods (duct tape stabilises, the extension cord adds range, batteries add fire rate, glitter dazzles), rolled on the engine's item generation seam
- condition — Busted, Used, Like New, Mint, Heirloom in place of rarity; 22 heirlooms, each with a backstory line and a red-text signature perk, two per boss to farm
- personalities — `src/game/handroll/personality.ts` (model) and `src/game/combat/personalityRuntime.ts` (live): seven personalities, each with a perk, a quirk and lines for pickup, reload, kills, switching away, low ammo, jamming and merging. Grumpy +20% damage / slow reloads; Cheerful heals on kills / hits softer; Paranoid bends shots onto the nearest threat / twitches an extra round; Dramatic's finale hits 40% harder / slow reloads; Philosophical's every sixth shot is free / fires slower; Clingy builds damage while held / guilt-trips the other guns when you switch; Competitive stacks per kill / sulks and jams when you switch back to it
- weapon chatter — the held weapon's lines in a speech bubble over the ammo plate, a live mood readout (ATTACHED +18%, STREAK x3, SULKING, FINALE); career kills on the card and milestone lines; heirlooms tell their story on pickup; carried weapons react to newcomers
- weapons built from parts — `src/game/world/junkModel.ts`: the viewmodel is the body, the mod strapped on, googly eyes whose brows say the personality, rust scuffs or a lit trim for the condition
- garage workbench — `src/game/items/vault.ts`, `src/game/handroll/merge.ts`: shelve junk, salvage it into cash and spare parts, merge two weapons (body and voice from one, mod from the other; two of a condition step up; a merge tops out at Mint)
- rogue appliances — `src/game/world/applianceModel.ts` through the shell's `renderEntity`: Roombas, sprinkler turrets, smart fridges, delivery drones, push and riding mowers, garage-door crushers, smart speakers and soundbars, and the bosses (Big Mulch, the Leaf Blower King, the Compactor, the HOA President, Mother Router), every one with angry red LED eyes
- XP and levels — kills and errands pay XP; each level gives health and one skill point
- skill tree — three tinkerers (Marge the Yard-Sale Queen, Dex the Kitchen Chemist, Pip the Paper-Route Kid) × three branches × nine nodes with a paid reset
- element loads — plastic melts under hot sauce, steel under bleach, force fields short out under static; shown on the target
- hub — the cul-de-sac with Nana's first-aid porch, Hank's garage and workbench, and the swap meet
- neighbourhood gates — each opens with a story errand and shows its level
- bosses — one per act: the Leaf Blower King, the Compactor, Mother Router, plus Big Mulch at the crash site
- side errands — the neighbours' jobs, the dish watch and the radio contract
- Last Gasp — down at zero health, a kill makes a comeback
- onboarding hints — DING's lines and fridge-magnet notes blended into Crabgrass Court
- quest marker — a pin over the tracked objective, an edge arrow with the distance off screen
- ammo for what you carry — kills drop ammo (staples, nails, gravel, water, kernels, bread) for the emptiest carried weapon
- recycling bins — a pack per carried weapon, restocked a while after opening
- camp fights — camp appliances carry four times their listed health (`ENEMY_TOUGHNESS`); a cleared yard refills after four minutes away
- local breeds and named targets — each neighbourhood's own appliance variants, and named elites behind side errands
- the Front Lawn — the moving truck's two gangs wake only after Big Mulch is down
- Block Party — the endgame ladder on the Front Lawn, 20 tiers of mutators
- the suburb's look — hedges, overgrown maples, driveway cars, moving boxes, curbside sofas, giant lawn flamingos, yard-sale signs and telephone poles (`src/game/world/yardProps.tsx`); overgrown lawns, asphalt streets, a clear summer sky
- from-zero proof — a new game played for ten minutes through real input

## Engine coverage

| Feature | Engine | Engine hint |
| --- | --- | --- |
| quest givers | `@jgengine/core/mission/quest` (`QuestDef.giver`, `turnIn`, `requires`, `rewards.quests`) | covered |
| XP and levels | `@jgengine/core/progression/leveling` | covered |
| skill tree | `@jgengine/core/progression/skillTree` | covered |
| junk weapons | `@jgengine/core/item/itemgen`, `@jgengine/core/loot/lootGen` | covered |
| personality perks | `@jgengine/core/rules/triggeredRules` for the perk seam; the mood rules are game-local | partial: see Gaps |
| condition by level | `@jgengine/core/progression/gates` (`createGateSet`) | partial: the game reads its own rarity table through the gate set |
| element loads | `@jgengine/core/combat/damage/damageRuntime` resistance chart | covered |
| hub vendors and workbench | `@jgengine/core/economy/transactionLedger`, `@jgengine/core/inventory/inventoryModel` | covered |
| neighbourhood gates | `@jgengine/core/progression/gates` | covered |
| bosses | `@jgengine/core/ai/phaseLadder` | covered |
| Last Gasp | `@jgengine/core/combat/downed` | covered |
| procedural appliances | the shell's `renderEntity` / `renderObject` overrides | covered |
| onboarding hints | `@jgengine/core/onboarding/onboardingSystem` (blended style) and `OnboardingHud` | covered |
| quest marker | `@jgengine/core/map/waypointMarkers.view` | covered |
| from-zero proof | `@jgengine/core/play/headlessFlow.draw` | covered |

## Gaps

- A timed move-speed and attack-interval scale on an enemy (chilled by the extinguisher, dazzled by glitter) lives game-local in `src/game/combat/soak.ts`, read by the enemy attack step. One adopter; the second game that slows or blinds an enemy moves it into `packages/core/src/combat/` as a status modifier the AI reads.
- Weapon voice lines (event → personality → rate-limited line) live game-local in `src/game/combat/personalityRuntime.ts`. The seam is a generic "barks" runtime (`packages/core/src/dialogue/`) keyed by event and speaker; the second game with talking items moves it upstream.
- The world's terrain seed, ids and authored placements are still the old layout re-dressed (grass ground, procedural pastel village houses and storefronts, re-skinned props): fences, driveways and cul-de-sacs are a pass through the editor (`editor.scene.json`), not done here. The terrain's shape stays as authored because the scene's props sit at heights measured on it.

## Milestones

- [x] 1. Design brief.
- [x] 2. The opening: empty-handed start, DING gives errands one at a time, the toy chest's busted staple gun, errands turned in to their giver, Big Mulch as act 1's boss, neighbourhoods closed until their story errand, condition tiers and the skill tree opening with level, weapon slots opening with the story.
- [x] 3. Gates: element loads on the target, Hank's workbench shelf in place of a field stash.
- [x] 4. Content to the budget: errands, appliance types, bodies, mods, heirlooms and uniques as data.
- [x] 5. From-zero proof: ten minutes from a new game through real input.
- [x] 6. Onboarding hints in the crash site through the engine onboarding system.
- [x] 7. Junk Drawer: bodies, mods and condition; seven personalities with perks, quirks and voice lines; weapons built from parts on screen; the workbench's salvage and merge; procedural appliances; the suburban look and text.
- [ ] 8. The suburb in the editor: houses, fences, driveways and cul-de-sacs authored in `editor.scene.json` over the six neighbourhoods.
- [x] 9. Personality depth: a weapon remembers its career kills across saves and remarks at each milestone (10, 25, 50, 100, 250, 500); heirlooms speak their backstory on pickup; a carried weapon (a jealous Clingy or Competitive one first) has an opinion about every newcomer.
- [x] 10. Suite to 20/20: menu, settings, save and continue, drops by condition, find-features, the workbench, and a content sheet with the level runway.

## Handoff

- Done: the Junk Drawer redesign (milestones 7, 9, 10), suite 20/20, captures reviewed with software Chrome (`CHROME_PATH=/opt/pw-browsers/chromium JG_CAPTURE_GL=swiftshader JG_BROKER=0 JG_RENDER_SLOTS=2 bun run shoot scrap-signal --mode play --state junk-armed --cold`; also `junk-vacuum`, `boss`). `--view` framings point the camera at the ground in play mode; use states.
- Engine changes made here: `RuntimeSave.backend` (so the game's save document shares the host's backend) and suite proofs keep no wall-clock autosave (it fired mid-play on a slow machine).
- Next: milestone 8 (fences, driveways and cul-de-sacs through the editor); ambient life (ticking sprinklers, stray drones); per-body fire sounds (the vacuum and extinguisher borrow the nail gun's); pitched roofs need a building-style option upstream.
