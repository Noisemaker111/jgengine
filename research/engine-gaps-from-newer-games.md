# Engine gaps from ~56 newer games

_A research pass to find where JGengine breaks when you try to actually build a modern game on it. We did not build these games — we mentally built each one against the real engine surface (read from `packages/*/src`, not the docs) and recorded where it hits a wall._

## Why this exists

Two games got built and both hit walls that had nothing to do with the data model:

- **A Sims-like** — placement preview didn't work, camera panning didn't work, walk-by-clicking didn't work.
- **A Borderlands-like** — couldn't click to shoot, couldn't see loot on the ground from a higher top-down view, the camera was bad.

Those aren't six unrelated bugs. They're six symptoms of **one structural fact about the engine**, which every one of the 56 games below re-confirms.

## The one structural fact

**JGengine's data / simulation layer is deep. Its shell — camera, input‑to‑world, and the presentation of what the sim already computes — is thin and hard‑wired for exactly one thing: a WASD‑driven avatar seen in first or third person.**

The sim layer is genuinely strong: inventory, weighted loot, trade, quests, dialogue trees, bounded stats with clamp math, drain‑signed effects with AoE+LoS, hitscan/ballistic projectiles, death with kill attribution, XP/leveling curves, economy, unlocks, social (friends/party/presence), events/feed/leaderboard, tab‑target, `item.use` handlers, proximity prompts, a real simulation clock (pause + 1–4× + game‑time timers), a whole outdoor‑world layer (terrain/wind/water/scatter/regions/buildings) with renderer‑free query primitives, a headless rigid‑body `PhysicsWorld`, and multiplayer adapters with an authoritative host. Most "missing" primitives people reach for already exist here.

But look at what the shell actually does (`packages/shell/src/GamePlayerShell.tsx`):

- **Movement is WASD‑only.** `FrameDriver` reads `moveForward/Back/Left/Right` and drives a character controller. A primary click just *fires the hotbar item*. There is no ground raycast, no path target, no navmesh — **click‑to‑move cannot exist yet.**
- **Aim is camera yaw/pitch only.** `executeHotbarSlot` passes `aim: { yaw, pitch }` straight from the camera. There is no cursor→world ray — **in any top‑down view you shoot where the camera faces, not where you click.**
- **Two camera rigs, both entity‑locked.** Orbit (`GameOrbitCamera`) and first‑person. The orbit rig sets `enablePan={false}`, disables right‑drag, and **returns early if there is no followed entity** — so a game with no avatar (city‑builder, card game, tower defense, auto‑battler) can't even mount a camera. Panning is switched *off*, not missing‑by‑omission.
- **Loot teleports into the bag.** `grantToPlayer` fills inventory directly. There is no dropped‑item world entity, no rarity beam, no pickup radius, no click‑to‑grab.
- **Placement is data‑only.** `validatePlacement`/`footprintObstacle` compute validity; nothing renders a ghost, tints valid/invalid, rotates a preview, or commits on click.

And a set of whole subsystems simply don't exist anywhere: **no animation state machine, no audio, no crafting/recipe graph, no minimap, no ability‑cooldown ownership** (the UI skill even admits "engine does not own cooldowns yet"), **no dodge/stamina/parry/lock‑on, no vehicle controller, no joints/constraints, no ragdoll, no turn loop, no AI beyond `wander`/`talkable`.**

So the gaps sort into **four missing layers**, roughly in priority order:

1. **Input→World** — the connective tissue that turns a click/point into a world position, target, or command. One missing primitive (a screen→ground ray) is upstream of click‑to‑move, click‑to‑aim, ground‑target abilities, placement, tile‑select, pings, and stratagem markers.
2. **Camera rig library** — decoupled rigs beyond orbit/FP: top‑down, isometric, RTS free‑pan, over‑the‑shoulder, lock‑on strafe, speed‑reactive chase, plus avatar‑less operation and camera shake.
3. **Presentation of the existing sim** — the sim already computes loot, damage type, AoE, cooldowns, targets; the shell just never *shows* them. Loot‑on‑ground, placement ghosts, attack telegraphs, damage‑number typing, minimap, cooldown sweeps.
4. **New simulation subsystems** — genuinely absent systems: ability kits, animation, AI director/nav, turn‑loop/grid‑tactics, crafting/tech graph, survival meters, vehicles/joints, objective/mode machines, audio.

Layers 1–3 are mostly *wiring what already exists to the screen and the mouse* — high leverage, modest effort, and they retroactively fix both games that were already built. Layer 4 is the long tail of new systems, prioritized below by how many genres each unblocks.

---

## Ranked gap families

Ranked by cross‑genre leverage (how many of the eight genre clusters a gap blocks), with confirmed‑failure gaps first. Each card: what it is · what exists today · what's missing · proposed primitive · who needs it.

### Tier S — the confirmed failures + maximum leverage

These four explain the Sims and Borderlands walls directly and unblock more genres than anything else. Build these first.

#### S1. Input→World ray + pointer verbs `(click‑to‑move · click‑to‑aim · ground‑target · tile‑select · world‑mark)`
The single highest‑leverage gap. One primitive — **raycast a screen point to the world/ground and hand game code the hit** — is upstream of at least six mechanics that currently can't exist.

- **Today:** movement is WASD; aim is camera yaw/pitch; a click only fires the hotbar or `setTarget`s an entity. Game code never learns "where in the world is the cursor."
- **Missing:** the ray itself, plus the pointer‑verb routing on top of it (move‑to, aim‑at, cast‑at, place‑at, mark‑at, box‑select, right‑click context).
- **Primitive:** a shell service `pointer.worldHit()` → `{ point, entity, object, normal }`, exposed to the loop and to `item.use` `aim`, so a weapon can aim at `pointer.point` instead of `{yaw,pitch}` and a move command can path to it.
- **Needed by:** life‑sim (click‑to‑walk, tile farming), looter‑shooter (twin‑stick/click‑to‑shoot, Hades/Diablo), action‑RPG (V Rising skillshots), tactical shooters (Apex ping, Helldivers stratagem beacon), tower defense (tower placement), survival (Core Keeper aim). **~7/8 clusters. Directly fixes "couldn't click to walk" and "couldn't click to shoot."**

#### S2. Camera rig library `(top‑down · isometric · RTS free‑pan · over‑the‑shoulder · lock‑on strafe · chase · cinematic)`
The engine ships two rigs and both follow the avatar; every genre outside "third‑person avatar" needs a different one, and several need *no* avatar at all.

- **Today:** orbit + first‑person, both `ctx.scene.entity.get(followId)`‑gated; orbit pan is disabled.
- **Missing:** a decoupled camera that can pan/edge‑scroll independently of any entity (RTS/Sims/city‑builder/TD), a fixed‑height top‑down/iso rig (Diablo/Hades/Last Epoch/PoE2/Core Keeper), an over‑the‑shoulder combat rig with shoulder‑swap (Remnant/Helldivers/The First Descendant), a lock‑on strafe rig that faces the target while a separate axis strafes (Elden Ring/Sekiro/Lies of P), a speed‑reactive chase rig with FOV/shake (all racing), zoom‑to‑cursor, height‑level stepping (Timberborn), smooth mode transitions (Dave the Diver), and camera shake as a first‑class knob.
- **Primitive:** a `cameraRig` interface with orbit/first/topDown/iso/free/shoulder/lockOn/chase implementations, each parameterized (height/pitch/zoom/offset/pan/edge‑scroll), able to run with `followEntityId: null`, plus a `cameraShake(amp, decay)` channel.
- **Needed by:** **all 8 clusters. Directly fixes "camera panning not working" and "the camera was bad."**

#### S3. WorldItem — dropped loot as a ground entity `(rarity beams · labels · pickup radius · click‑grab · loot filter · death scatter)`
Loot is the toy in a whole genre and the engine renders none of it in the world.

- **Today:** `onDeath.drops` and `grantToPlayer` move items straight to inventory.
- **Missing:** a **WorldItem** entity (position + item ref + rarity) with rarity→beam/pillar/color/ground‑label render bindings, a pickup radius / auto‑vacuum, click‑to‑grab, on‑death drops routed through it with a scatter impulse, and a **loot‑filter rule engine** (hide/recolor/beam by rarity + base type + affix tier — every ARPG ships one; Last Epoch and PoE2 make it a headline feature).
- **Primitive:** `worldItem.spawn({ at, item, rarity })` + a render binding table + `pickup` verb (radius/click) + a filter‑rule evaluator over the item data the engine already has.
- **Needed by:** looter‑shooter, survival, tactical shooters (Apex ground loot), co‑op (Lethal Company scrap). **Directly fixes "couldn't see loot on the ground."**

#### S4. Interactive placement / build system `(ghost · valid‑tint · rotate · grid↔freeform · snap‑to‑connector · structural integrity · wall/floor/roof · move/delete · serialize)`
`validatePlacement` is data; the entire *interactive* build loop is missing, and it's the core toy of two big genres.

- **Today:** footprint/overlap validation math, and a whole‑building generator; no interactive tooling.
- **Missing, in order of ambition:** a ghost mesh that follows the cursor and tints valid/invalid, rotate + grid‑snap, a **grid↔freeform mode toggle** (Palia/Sims `moveObjects`), surface/vertical snap (lamp on table), drag‑to‑paint (floors/paths), **snap‑to‑connector** building with typed sockets and **structural‑integrity** propagation (Valheim/Enshrouded/LEGO Fortnite/The Finals), interactive **wall/floor/roof authoring** (Sims build mode, Tiny Glade auto‑roof‑from‑footprint), move/delete existing, and **serialize placed structures** (all builders; Palia co‑op decorating needs per‑plot edit permission).
- **Primitive:** a `placementController(footprintData)` that owns ghost + tint + rotate + snap‑mode + commit, plus a `connectorGraph` + `supportSolver` for structural builds and a `placedStructureStore` for save/select/move/delete.
- **Needed by:** life‑sim, survival, tower defense, co‑op (Fortnite build‑under‑fire). **Directly fixes "placement preview not working."**

### Tier A — blocks whole genre families

#### A1. Ability / cooldown / resource kit
Nothing models an ability as distinct from an inventory item — no cooldown (the engine explicitly doesn't own them), no charges, no resource cost, no event‑fed ultimate meter, no skill‑point ranking, no ground‑target cast.
- **Primitive:** an `abilityKit` component — named slots with `{cooldownMs, chargesMax, resourceCost, castType}` reusing existing effects/projectiles — plus a generic `resourceMeter` that increments from arbitrary combat events (damage dealt/taken, objective ticks) to gate ultimates. Wire the four HUD slot states the UI skill already specifies.
- **Needed by:** hero shooters (Marvel Rivals/Valorant/Apex/Deadlock/Helldivers/Delta Force), ARPGs (Diablo/PoE2/Descendant/RoR2), MOBA‑likes, and — as *secondary resource pools* (stamina/EN/spirit/focus/beta) — every soulslike.

#### A2. Character‑combat feel: animation state machine + the meters that hang off it
The **animation state machine is the root blocker** under most soulslike/character‑action feel: entities are static meshes with no named windup/active/recovery/cancel frames for gameplay to query. On top of it hang a cluster of missing meters and verbs, each recurring across the whole genre:
- **dodge/dash with i‑frames + stamina** (Hades/PoE2/Remnant/Returnal/Elden Ring),
- **poise/posture/stagger** — a second depletable meter, symmetric across player and enemy, that breaks into a critical state (Elden Ring/Sekiro/Lies of P/AC6),
- **parry/block timing windows** keyed to an attack's active frames (Lies of P/Stellar Blade/Sekiro/Wo Long ki‑pulse),
- **attack‑type tags** so defense logic can read "unblockable / thrust‑only‑counterable" (Sekiro mikiri, Lies of P Fury),
- **status‑buildup meters** (bleed/frost/rot) that accumulate per hit and pop a timed debuff — vs. today's instant one‑shot effects,
- **hitstop + knockback** on hit (the whole *feel* of Hades/Borderlands), which the engine has as damage numbers only.
- **Primitive family:** an animation state machine exposing tagged frame ranges; a generic `staggerMeter`, `stamina`, `buildupMeter`; a `defensiveWindow` (parry/dodge) component; attack‑metadata tags; a `hitReaction` layer (freeze‑frame + impulse + optional shake from S2).
- **Needed by:** action‑RPG (core), looter‑shooter (dodge), shooters (movement tech has state without presentation).

#### A3. AI: spawn director + aggro/threat + navigation + task‑assignment + crowd flow
The engine's AI is `wander` and `talkable`. Modern games need five things it doesn't have, several of which share a nav backbone:
- **spawn director / wave manager** — budgeted, player‑biased, escalating on alert or over sim‑time; the *entire loop* of Brotato/Bloons and the pressure of Helldivers/DRG/RoR2/Palworld raids,
- **aggro/threat + patrol routes** (Tarkov scavs, tower/creep behavior),
- **navigation** — navmesh/pathfinding + **waypoint‑follow** (the simplest form, and the whole enemy behavior of tower defense) — the same nav that S1's click‑to‑move needs,
- **task‑assignment / utility AI** — "assign this NPC/pal to work this station," distinct from combat AI (Palworld, Schedule I, Sons of the Forest companions, colony‑sim haulers),
- **crowd flow** — many agents routing to points of interest with congestion (Two Point guests, Dave's customers, city‑sim citizens).
- **Primitive family:** `spawnDirector` keyed to simClock/thresholds; a threat table + patrol/waypoint follow atop a navmesh; a `job`/task‑queue component; a crowd steering field.
- **Needed by:** ~6/8 clusters.

#### A4. Turn‑based + grid‑tactics stack
A whole genre family the engine can't touch at all: no turn loop, no grid movement, no action economy.
- **Missing:** a `turnLoop` (configurable phases upkeep→player→resolve→enemy→resolve; a per‑turn resettable resource; and *three* commit modes — immediate, simultaneous‑hidden‑reveal, and rewind‑then‑commit); a `tacticalGrid` (tile occupancy, flood‑fill reachable tiles, discrete push/knockback‑to‑tile with chain collisions); action‑economy pools (BG3's Action/Bonus/Movement/Reaction); **predictive/telegraphed effect preview** ("this exact tile will be hit" — compute an effect without committing, then render it; also Slay the Spire enemy intent); persistent **combinable surfaces** (grease+fire, water+lightning); and **simulation snapshot/restore** for undo (Tactical Breach Wizards' rewind).
- **Needed by:** deckbuilders/tactics (Slay the Spire, Into the Breach, TBW), CRPG (Baldur's Gate 3). Two clusters, but it's the *only* thing those clusters need structurally.

#### A5. Crafting / tech graph / workstation gating / durability / automation
The engine has loot + trade but no way to turn inputs into outputs.
- **Missing:** a **recipe graph** (inputs + optional required‑workstation‑in‑range + time → output) that doubles as a **tech tree** (a node carries a recipe payload *and* gates prerequisites — Once Human's Memetics is the clean case, "the talent tree IS the recipe graph"), **item durability + repair**, and **automation/production buildings** (a placed building consumes/produces on a timer, optionally chained via item transport — Palworld/Core Keeper/Once Human conveyors).
- **Needed by:** all survival/crafting, life‑sim production chains, co‑op (Palworld/Schedule I). Explicitly named missing.

### Tier B — blocks specific popular genres

#### B1. Vehicles & physics actors `(vehicle controller · joints/constraints · ragdoll · carryables · mounts · grapple · force‑volumes)`
`PhysicsWorld` is rigid bodies only. An entire genre and a pile of cross‑genre verbs sit on missing physics plumbing:
- **joints/constraints** (hinge/distance/spring/fixed) — the literal foundation under everything else here,
- **vehicle controller** (wheel raycasts + suspension + tire‑grip curve + surface friction) and a **speed‑reactive chase camera + analog throttle/brake/steer axis input** (all racing; Delta Force Warfare; Deep Rock traversal),
- **ragdoll / active‑ragdoll locomotion** (Fall Guys, Gang Beasts, Content Warning),
- **physics‑carryable / grab / two‑person carry / throw** with a collision→gameplay‑event hook (Lethal Company scrap, R.E.P.O. co‑carry, Sea of Thieves cargo, Palworld capture sphere),
- **mounts / rideables / boats** (Palworld, Dinkum, Sea of Thieves ship, V Rising),
- **grapple / rope / zipline / glide** (Sekiro, DRG, The First Descendant, The Finals, Enshrouded, Grounded),
- **force‑volumes / boost pads / moving‑platform carry** (Trackmania, Fall Guys, Hot Wheels).
- **Explicit non‑goals to state up front:** BeamNG soft‑body node/beam sim and Timberborn volumetric fluid are a different simulation paradigm — the realistic jgengine target is coarse **damage stages + part detachment** (Wreckfest), not true deformation.
- **Needed by:** racing (whole cluster), co‑op (carry/boat), survival (mount/grapple), shooters (grapple/vehicle/destruction).

#### B2. Survival meters + weather‑gameplay
Stats exist but there's no decay/UI/environment‑driven primitive, and weather is visual‑only.
- **Missing:** named **decay meters** with configurable rate (constant or spatially modulated), consumable/action refills, and a **stacking status‑effect display** distinct from numeric bars (Abiotic Factor moodles); **environment‑sampling fields** the meters read — light/shadow exposure (V Rising sunlight), temperature (LEGO Fortnite biomes), wetness (Valheim rain), sanity (Phasmophobia darkness), light‑level for spawns (Vintage Story); and **weather with gameplay hooks** (grip, visibility, structure damage, fire spread — Grounded/Icarus).
- **Needed by:** survival, life‑sim, horror co‑op, action (buildup overlaps A2).

#### B3. Map / minimap / ping / fog‑of‑war / markers / compass
None of it exists.
- **Primitive:** a top‑down map render of world features + entity/objective markers, **reveal‑on‑event** fog (dig/walk — Core Keeper), a **ping** built on S1's ray (raycast → classify → broadcast to party → world marker + map icon — Apex), and a compass.
- **Needed by:** ARPG, tactical shooters, survival, co‑op.

#### B4. Objective / mode / round / revive machines
The competitive/co‑op backbone, entirely absent.
- **Missing:** a **contested channel** (progress bar, interrupt‑on‑damage, team‑favorability‑scaled — Valorant plant/defuse, The Finals cash‑out, Deadlock urn, Hunt banishing, Tarkov/Helldivers extract — this one pattern recurs in *every* shooter), a **round/match state machine** (buy/live/end phases gating commerce and streak rewards), a **revive/downed state machine** (alive→downed w/ bleedout→dead‑with‑recoverable‑banner→respawn‑beacon — Apex/Helldivers/The Finals), **extraction‑as‑win** with raid‑scoped sessions, and a **shrinking‑zone/ring** with out‑of‑bounds DoT.
- **Needed by:** all competitive & co‑op shooters, co‑op quota loops (Lethal Company/R.E.P.O.).

#### B5. Card / board systems
One cluster, but structurally its own world.
- **Missing:** a **CardPile** (named ordered zones — draw/hand/discard/exhaust — with seeded shuffle/draw/discard and a per‑turn hand limit) sitting beside inventory; a **LaneBoard** (N contested zones with per‑side aggregates — Marvel Snap/Inscryption); a **ShapedGrid** inventory variant (polyomino footprints + rotation + adjacency queries — Backpack Hero; 1‑D variable width — The Bazaar); a **modifier pipeline** (ordered, inspectable, traceable value transforms — Balatro jokers); an **auto‑battler timeline** (per‑slot independent cooldowns resolving in expiry order — The Bazaar); and a **UI drag‑drop/rotate gesture layer** (distinct from world drag‑drop).
- **Needed by:** deckbuilder/card/auto‑battler cluster.

### Tier C — breadth, polish, multiplayer depth

- **C1. Audio + proximity voice + beat clock.** A whole missing package. Decorative in most genres but **load‑bearing** in horror co‑op (Lethal Company/Phasmophobia/R.E.P.O./Sea of Thieves proximity + channel voice; Hunt footstep‑noise stealth) and rhythm‑action (Hi‑Fi Rush needs a BPM `beatClock` + input quantization). Primitive: positional emitters + listener falloff; a `voiceChannel` layer on the multiplayer transport with simultaneous positional + non‑positional (walkie/crew) channels; an optional beat clock.
- **C2. Multiplayer depth.** `lag‑compensated hit registration` (server position‑history rewind — the XDefiant cautionary case; required by every hitscan shooter), `simultaneous hidden commit` (Marvel Snap), `combat‑snapshot replay` for async PvP (The Bazaar), `multi‑seat shared vehicle` (Sea of Thieves crew), `shared/company economy wallet`, `session browse/matchmaking` above party/presence, `persistence‑scope separation` (session‑vs‑meta and server‑scenario resets — Icarus/Once Human), and `shared building permissions` (Palia/Palworld).
- **C3. Juice.** `screen shake` (from S2), `hitstop` (from A2), `attack telegraph decals` (windup ring/cone/decal bound to an effect — Diablo elites/Hades/bosses), `damage‑number typing` (crit/element color+scale), `number popcorn` easing. The sim computes all the inputs; nothing styles them.
- **C4. Verb & meta grab‑bag.** Recurring one‑to‑few‑game asks: `capture/tame` (wild entity → owned roster slot — Palworld/Once Human), `reveal/vision mode` (Hunt Dark Sight — occlusion‑ignoring tagged query + screen effect), `sensor reads hidden world state` (Phasmophobia evidence tools), `timed skill‑check minigame` (fishing reel / QTE sequencer — Web Fishing/Schedule I), `camera‑as‑gameplay‑object` (Content Warning view‑frustum sensor), `weapon procgen / affix roller / socket‑mods` (Borderlands/Descendant), `modular item assembly` with derived stats (Tarkov guns, AC6 mechs), `per‑body‑part health` (Tarkov/Sons of the Forest limbs), `streak/combo meter` (Returnal Adrenaline), `run‑scoped modifier draft` (Hades boons/RoR2/Vampire Survivors level‑up pick), `auto‑target policy` (zero‑input auto‑fire at nearest/strongest/first‑on‑path — Vampire Survivors/Brotato/tower targeting), `mass‑entity broad‑phase` (hundreds of survivors‑like enemies), `attack‑tag/resistance matrix` (Bloons camo/lead immunities), `spectator/replay/photo/killcam`, `cosmetics/emote broadcast`, `dialogue skill checks` (BG3 DC rolls on existing dialogue trees), and `party possession/character‑swap` (BG3 direct control of N owned entities).

---

## What breaks when you build each game

The per‑game map — mentally build the game on the current engine, and here's the first wall (S/A/B/C tags reference the gap families above).

### Life‑sim / colony / builder
| Game | First walls |
|------|-------------|
| The Sims 4 | S4 build mode, S1 click‑to‑move + interaction queue, S2 free‑pan cam, B2 needs decay, C4 context pie‑menu |
| Palia | S4 grid↔freeform + surface snap, C2 shared‑plot edit permission, S4 serialize layouts |
| Coral Island / Fields of Mistria | A5+B2 farming growth‑stage on simClock, S1 tile‑cursor + tool‑AoE, A3 NPC schedules |
| Manor Lords | S2 RTS cam, S4 freeform footprint/road spline, A3 haulers/logistics + selection |
| Against the Storm | A5 production/worker‑assignment graph, B3 fog‑of‑war, A3 haulers |
| Timberborn | S2 height‑level cam + placement, fluid sim (non‑goal), runtime terraform |
| Tiny Glade | S4 procedural wall‑draw + auto‑roof‑from‑footprint (gridless) |
| Dinkum | S4 ghost+rotate, runtime terraform, A5 crafting, B1 vehicle/mount |
| LEGO Fortnite | S4 snap‑connector + structural integrity, B2 temperature, A3 station workers, B1 vehicle |
| Two Point Museum | A3 guest crowd flow, S2 top‑down cam, S4 room/wall + zone paint |
| Dave the Diver | S2 multi‑mode cam + transitions, A3 restaurant customers, B2 oxygen meter, S1 harpoon aim |

### Looter‑shooter / ARPG
| Game | First walls |
|------|-------------|
| Borderlands 3 | S3 loot beams + death geyser, C4 weapon procgen, C3 crit/element number typing |
| Diablo IV / PoE2 / Last Epoch | S2 iso cam, S1 click‑move+attack, S3 loot beams + filter, A1 ability bar, B3 minimap, C3 elite telegraphs, A2 dodge (PoE2) |
| Hades II | S2 iso cam, S1 twin‑stick aim, A2 dash/i‑frames + hitstop, C3 telegraph decals + shake |
| Helldivers 2 | S1 stratagem beacon (ground ray), S2 over‑shoulder aim, A3 spawn director, B4 revive, B1 ragdoll |
| Deep Rock Galactic | B1 destructible terrain + grapple, A3 swarm director, A5 mining loop |
| Gunfire Reborn | (FP fits) S3 room loot, C4 run‑modifier draft |
| Risk of Rain 2 | A3 time‑scaling director, S3 pickup vacuum, C4 stacking items |
| Remnant II / The First Descendant | S2 over‑shoulder, A2 dodge+stamina, B1 grapple, C4 socket mods |
| Returnal | C4 active‑reload + streak meter, A2 dash, C3 bullet‑hell telegraphs |

### Survival / crafting
Valheim, Palworld, Enshrouded, V Rising, Grounded, Sons of the Forest, Nightingale, Core Keeper, Vintage Story, Icarus, Abiotic Factor, Once Human → dominated by **S4 snap‑build + structural integrity, A5 crafting/tech/workstation, B2 survival meters + weather, A3 raid director + companion AI, B1 mounts/grapple, B3 minimap/fog, C2 persistence‑scope**. Core Keeper additionally needs **S2 top‑down + S1 click‑aim**.

### Tactical / hero / extraction shooters
The Finals, Marvel Rivals, Valorant, Apex, Deadlock, XDefiant, Hunt, Tarkov, Helldivers, Delta Force → dominated by **A1 ability kits, B4 objective/round/revive/contested‑channel, B1 destruction + grapple + vehicle, B3 minimap/ping (on S1), C1 audio, C2 lag‑comp netcode, A3 spawn director, C4 modular guns / per‑limb health / tiered gear economy**.

### Action‑RPG / soulslike / CRPG
Elden Ring, BG3, Lies of P, Wukong, Stellar Blade, Hi‑Fi Rush, AC6, Sekiro, Wo Long → dominated by **A2 animation state machine (root) + stamina/poise/parry/attack‑tags/buildup, A1 secondary resources, S2 lock‑on strafe cam, B1 grapple/climb, C1 audio+beat (Hi‑Fi Rush), A4 full turn stack + dialogue skill checks + party swap (BG3), C4 modular hardpoints (AC6)**.

### Deckbuilder / tactics / survivors / TD
Balatro, Slay the Spire, Marvel Snap, Inscryption, Backpack Hero, Vampire Survivors, Brotato, Into the Breach, Bloons TD 6, TBW, The Bazaar → dominated by **A4 turn loop + grid tactics + predictive preview + snapshot undo, B5 card/board/shaped‑grid + drag‑drop, A3 wave manager + C4 auto‑target (survivors/TD), S2 top‑down cam + avatar‑less camera, S4 tower placement, C4 mass‑entity broad‑phase**.

### Racing / vehicle / physics‑party
Rocket League, Forza, Trackmania, Wreckfest, BeamNG, Fall Guys, Gang Beasts, Hot Wheels, Speedstorm → dominated by **B1 vehicle controller + joints + ragdoll + force‑volumes + damage stages, race state machine (checkpoints/laps/positions), S2 speed‑reactive chase cam + analog input, C2 replay/rewind/ghost**.

### Co‑op / social‑sandbox / horror
Lethal Company, Content Warning, R.E.P.O., Phasmophobia, Sea of Thieves, DRG, Palworld, Fortnite/UEFN, Web Fishing, Schedule I → dominated by **C1 proximity voice, B1 physics‑carryable + multi‑person carry + boat/vehicle, A3 stimulus AI + spawn director, A5 crafting + task‑assignment AI, B4 quota/objective loop, C2 shared economy / session browse / spectate, C4 vision‑mode / skill‑check minigame / capture**.

---

## Recommended sequencing

The cheapest, highest‑leverage move is not a new subsystem — it's an **interaction spine** that wires the deep sim to the mouse and the camera. It's mostly shell work, and it retroactively fixes both games that were already built.

1. **The interaction spine (Tier S).** `pointer.worldHit()` (S1) → click‑to‑move + click‑to‑aim + ground‑target; the camera rig library (S2) with top‑down/iso/free‑pan/lock‑on and avatar‑less operation; WorldItem + rarity presentation (S3); the placement controller (S4). This alone unblocks life‑sim, ARPG top‑down, and most survival building, and closes every one of the six reported failures.
2. **The combat‑feel + ability core (A1, A2).** Ability/cooldown/resource kit and the animation state machine with its stamina/poise/dodge/parry cluster. Unblocks hero shooters and soulslikes — two of the largest modern genres — and upgrades the shooters already possible.
3. **The world‑agent core (A3, A5).** Spawn director + navmesh/aggro/task AI, and the crafting/tech/workstation graph. Unblocks survival, colony‑sim, and PvE‑hybrid shooters.
4. **Genre backbones (Tier B).** Vehicles/joints, survival meters + weather, map/minimap/ping, objective/mode/round/revive machines, and the turn‑loop/card stack (A4/B5) — each opens a specific large genre.
5. **Breadth & polish (Tier C).** Audio + proximity voice, multiplayer depth, juice, and the verb grab‑bag — layered in as target genres demand them.

Two structural notes worth acting on early, because they're cheap and they quietly block whole categories:

- **Decouple the camera from "there must be an avatar."** The orbit rig returning early on a null follow entity silently makes every avatar‑less genre (city‑builder, card game, tower defense, auto‑battler) impossible. Allowing `followEntityId: null` is a small change with large reach.
- **Give the sim a way to reach the screen and the pointer.** Almost every Tier‑S and Tier‑C‑juice gap is the same shape: the simulation already computes the fact (a drop, a cooldown, a damage type, an AoE, a target) and the shell simply never renders it or never lets the mouse address it. A thin, consistent "sim fact → render binding" and "pointer → sim command" layer is the through‑line of this whole document.

---

## Appendix — games surveyed (56)

**Life‑sim/builder:** The Sims 4, Palia, Coral Island, Fields of Mistria, Manor Lords, Against the Storm, Timberborn, Tiny Glade, Dinkum, LEGO Fortnite, Two Point Museum, Dave the Diver.
**Looter‑shooter/ARPG:** Borderlands 3, Hades II, Last Epoch, Diablo IV, Path of Exile 2, Deep Rock Galactic, Helldivers 2, Gunfire Reborn, Risk of Rain 2, Remnant II, The First Descendant, Returnal.
**Survival/crafting:** Valheim, Palworld, Enshrouded, V Rising, Grounded, Sons of the Forest, Nightingale, Core Keeper, Vintage Story, Icarus, Abiotic Factor, Once Human.
**Tactical/hero/extraction shooters:** The Finals, Marvel Rivals, Valorant, Apex Legends, Deadlock, XDefiant, Hunt: Showdown, Escape from Tarkov, Helldivers 2, Delta Force.
**Action‑RPG/soulslike/CRPG:** Elden Ring, Baldur's Gate 3, Lies of P, Black Myth: Wukong, Stellar Blade, Hi‑Fi Rush, Armored Core VI, Sekiro, Wo Long / Nioh.
**Deckbuilder/tactics/survivors/TD:** Balatro, Slay the Spire, Marvel Snap, Inscryption, Backpack Hero, Vampire Survivors, Brotato, Into the Breach, Bloons TD 6, Tactical Breach Wizards, The Bazaar.
**Racing/vehicle/physics‑party:** Rocket League, Forza Horizon 5, Trackmania, Wreckfest, BeamNG.drive, Fall Guys, Gang Beasts, Hot Wheels Unleashed, Disney Speedstorm.
**Co‑op/social/horror:** Lethal Company, Content Warning, R.E.P.O., Phasmophobia, Sea of Thieves, Deep Rock Galactic, Palworld, Fortnite/UEFN, Web Fishing, Schedule I.
</content>
</invoke>
