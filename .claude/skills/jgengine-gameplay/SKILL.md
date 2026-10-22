---
name: jgengine-gameplay
description: Compose serializable game state, systems, progression, and non-combat rules.
---

# JGengine gameplay

## Ownership

This skill owns non-combat rules and state: systems, catalogs, inventory/items, crafting, economy, quests, dialogue, social state, puzzles, survival, turns, tactics, sessions, and saveable game models. Combat math belongs to `jgengine-combat`; host persistence adapters belong to `jgengine-multiplayer`.

Use [capabilities.md](capabilities.md) for intent discovery, [api.md](api.md) for signatures, and [reference-systems.md](reference-systems.md) for scheduling details before hand-rolling a subsystem.

For multi-cell inventory items, use `createShapedGrid`, `canPlace`, and
`findShapedPlacement` (`inventory/shapedGrid`). The caller owns item footprints,
rotation policy, saves, and UI; [shaped inventory placement](recipes/shaped-inventory.md)
shows bounded first-fit search. A stack-slot `InventoryGrid` does not replace
footprint rotation or spatial packing.

Existing projects can keep player state and saves behind `LevelingStatAccess`.
Follow the [portable XP/leveling recipe](recipes/portable-xp-leveling.md) for
custom stat ids, immutable store writes, multiple level events, and JSON resume.

Persist rolled items with `createItemInstanceRegistry` (`item/itemInstanceRegistry`):
`state()` detaches definitions, runtime ids, prefix, and allocation sequence;
`restore(state)` replaces the registry and rejects a different prefix. Keep
definitions structured-cloneable and JSON-compatible for JSON saves. Save the
inventory's returned runtime ids alongside this state; do not regenerate rolls
or infer the next id from the surviving items.
For large collections, inject caller-owned `ItemInstanceStorage` and use
`statePages(pageSize)` / `restorePages(pages)` to clone one batch at a time.
Follow the [paged item storage recipe](recipes/paged-item-storage.md) for
atomic replacement, allocator reattachment, and export consistency.

Generate coherent combinations with `generate` (`item/itemgen`): dependent
pools and `GenStep.accept` constrain later choices using earlier picks.
Pins consume no choice RNG and must satisfy the same pool and constraints;
incompatible pins backtrack earlier unpinned choices or return `unsatisfiable`
within the configured attempt and pick budgets.

Roll whole named gear from an authored catalog with `rollLoot`
(`loot/lootGen`): bases with mount slots, parts, affix pools, weighted rarity
tiers, manufacturer stat personalities and a level curve, all caller data.
`validateLootItem` names each defect, `compareLootItems` returns per-stat deltas
and a weighted score, and `lootWeaponDefinition` (`loot/lootWeapon`) projects a
rolled item onto a `WeaponDefinition` for `createWeaponSystem`. `createLootRoller`
counts drops per rarity for a debug probe and snapshots its counters. Sample
catalog, distribution check and generated-weapon proof are in
[reference-systems.md](reference-systems.md#procedural-gear).

Resolve an authored XP curve with `defineXpCurve` (`progression/xpCurve`): one growth rule
(`flat`, `linear`, `power`, `geometric`, `table`), a `maxLevel` cap and a stated `rule` string;
`table()` and `totalXpFor()` read the same data, and `track()` hands those thresholds to
`leveling`. Spend a character's points in `createSkillTree` (`progression/skillTree`): nodes carry
a point `cost`, `requires`, `excludes`, `passives` and `actives`, `synergies` pay off two or more
ranked nodes together, `respec()` refunds exactly the points spent, and `resolved()` returns the
`StatModifierSet` plus ability-slot-shaped actives to feed `createStats` / `createAbilityKit`.
Score a whole loadout with `gearScore` (`progression/gearScore`) on the same weight policy as
`compareLootItems`. [reference-systems.md](reference-systems.md#progression-and-gear-score) shows
the data shapes and a two-build comparison.

Wear gear with `createEquipment` (`inventory/equipment`): slot defs own accepted kinds and the slots
they block, item defs own the slots an item may occupy, a filled slot swaps and hands back the
replaced item, and `state()` / `restore()` round-trip the worn set. Weigh a character with
`characterLoad` (`inventory/carryLoad`), which turns carried inventories plus worn gear into the
shared encumbrance bands (`moveMultiplier`, sprint/jump gates, `remaining`), so `canCarry` gates a
pickup. Declare a stash as its own inventory (`tier: "banked"`) and move items with
`InventorySet.move`; `snapshot()` / `restore()` save both as detached data. The bag and stash render
through `<InventoryGrid>` with `<EquipmentSlots>` above it. See
[inventory, equipment and weight](reference-systems.md#inventory-equipment-and-weight).

Validate generated quest catalogs with `validateQuestCatalog` (`game/questCatalog`).
Follow the [quest authoring recipe](recipes/quest-authoring.md) for bounded batches,
canonical facts, external unlock declarations, and precise repair diagnostics.

Run a mission with `createMissionRuntime` (`mission/mission`): a mission is data — a graph of
objectives the machine walks, with named fail states, per-objective timers, conditional branches and
rewards. `escortMission`, `chaseMission` and `defendMission` (`mission/compositions`) are compositions
of the same `reach`/`interact`/`survive`/`pursue`/`kill`/`collect` kinds, not archetypes: an escort is
a `reach` with an `actor-died` guard, a defend is a `survive` with a survivor floor, a chase is a
`pursue` with an escape guard. Start, advance and fail missions from authored scene markers with
`registerMissionTriggerActions` and `createMissionTriggerBridge` (`mission/triggers`); positional
objectives read `missionMarkers(document)`. Rewards route through the quest appliers and the loot
registry (`applyMissionRewards`). `validateMissionCatalog` is the content gate and it fails a mission
whose success path is counters alone — `createMissionRuntime` runs it at construction, so a
counter-only mission throws instead of shipping.

For cross-catalog sources and skill gates, compose `validateContentReferences` and
`validateContentProgression` (`game/contentValidation`) with `validateRecipeCatalog`
(`crafting/recipeCatalog`). Follow [content validation](reference-content-validation.md).
Games declare complete sources before treating blocked routes as errors; costs,
consumption, exclusive choices, story and balance still need game-owned playtests.

For generated chapter dialogue, use the [narrative authoring recipe](recipes/narrative-authoring.md)
and `npx jgengine recipe narrative-authoring`: freeze reviewed canon, validate
bounded batches, repair located issues and require explicit semantic approval.

## Canonical workflow

1. Define plain serializable state and stable ids.
2. Put definitions in typed catalogs; keep per-instance mutable state separate.
3. Express behavior as narrow systems or pure transitions with explicit inputs.
4. Route player/AI intent through commands; emit typed results/events.
5. Attach save/restore boundaries and versioning where state persists.
6. Bind UI through selectors/hooks rather than duplicating state.

Prefer `defineSystem` and `defineGame({ systems })` for scheduled capabilities. Keep boot/join in the game loop only when it is truly lifecycle glue. System ordering, frequency, and serialization are explicit; avoid a giant per-frame callback.

## Days and off-screen agents

`resolveRoutine` (`sim/routine`) resolves an authored day (home, work, meal) against the world clock: injected travel time makes each stop depart early enough to arrive on time, and an arrival that runs late slips instead of teleporting. The timeline is pure, so a save, a forecast and a live agent read the same day.

`createOffScreenWorld` (`sim/offScreen`) keeps every resident either near or cheap. Near residents spawn into your own simulation through `NearAgents`; far ones are a position, a routine phase and a needs record that only move when the clock crosses a routine boundary — no navigation, no needs tick, no utility decision. The distance radius, optional cost model and per-tick switch budget are game config. Crossing back in spawns the resident where the cheap state says it is, with its schedule progress and needs intact, so it cannot pop in at the origin.

`createNearAgents` (`sim/nearAgents`) is the default near half: a nav crowd with a need set and a utility brain per agent, counting its decisions for tests and probes. Give it the same need definitions the off-screen world decays, or the two halves disagree at the boundary.

Rides and their lines are `createRideSystem` and `createWaitQueue` (`sim/rides`, `sim/queue`): a ride cycles load → ride → unload at its own capacity, wears against its own breakdown curve, and reports boards, alights, breakdowns and repair costs through a sink; the wait a guest faces comes from the queue's own measured boarding throughput, not a configured constant. Guest choice stays on the utility brain — `rideChoiceOptions` compiles a guest's `RideTaste` (intensity comfort, nausea comfort, queue tolerance) and the park's ratings into options, `rideChoiceCandidates` costs each one by its own line's wait, and `createRideChooser` wires both to one guest. Ratings, cycle times, breakdown curves and costs are caller data, and `retune` changes them in play.

For staffed production, use `stationOutputRate` (`work/staffedStation`) to resolve
caller-owned worker stats and efficiency, then feed the rate to `tickProduction`.
Keep staffing and production progress in the same serializable store; the
[staffed production example](reference-systems.md#staffed-production) composes
the existing scheduler and save/reset boundaries without a separate manager.

For whole-world saves, follow [authoritative state](reference-systems.md#authoritative-state); persistence and client replication use separate context methods.
Follow [truthful device saves](recipes/device-save-status.md) for denied storage,
quota errors, checkpoint retry, and save status UI.

## Design rules

- Caller data owns nouns, formulas, tables, costs, tiers, and content.
- Pure-data operations are the reusable core; stateful conveniences wrap them.
- Transactions validate before mutation and return inspectable outcomes.
- Random selection accepts injected RNG and stable ordering.
- Large collections use indexes, queues, or bounded reconciliation rather than repeated scans.

Quest journals index active objectives by kill target and collected item. Bind
`entity.died` and `inventory.added` once and keep the returned unsubscribe handles;
credit follows catalog order, and quests activated by a credit callback join the
next event. Register replacement definitions after editing objective targets,
items, or party-sharing policy. Save hydration rebuilds the active indexes.
Shared kills query nearby party members for matching objectives active on any
user, so the killer need not have that quest; direct kills and collection only
visit the actor's matching active objectives.

## Part-composed character motion

A character kit-bashed from primitives/`ModelPart`s (no skeleton, no clips) animates procedurally: tag parts with `role` (`leg.l`, `arm.r`, `head`, `tail`, `wing.l`…) and the shell's part-motion rig drives counter-phase limb swing from the entity's live movement speed, idle breathe/sway, hit flinch on `combat.hitReaction`, and a death topple on `entity.died` — no game-side frame loops. Tune with `ModelConfig.partMotion`; curves are pure and deterministic (`@jgengine/core/game/partAnimation`), so crowds de-sync by instance-id phase and replays stay stable. Soft characters (blobs, slimes) opt into volume-conserving squash-and-stretch with `partMotion: { squashAmp }` — footfall squash, jelly idle breathe, flinch pulse — and `deathStyle: "splat"` flattens out on death instead of the default sideways topple. Rigged GLBs keep using `ModelConfig.animation` — roles are only for rig-less compositions.

## Traps

- A bare export mention is not an example; use capabilities for discovery and real imports/tests for adoption.
- Do not invent a parallel store when an existing game-context feature owns the state.
- Do not fuse save semantics with a specific cloud/backend adapter.
- Targeting, damage, effects, abilities, and loot resolution route to `jgengine-combat`.
- World movement/input/interaction route to `jgengine-world`; HUD rendering routes to `jgengine-ui`.

## Persistent economies and input

- Declare `CurrencyDefinition.decimals` for per-second income. Use the definition in wallet and `ctx.game.economy` operations; public amounts are major units, arithmetic rounds in integer minor units at each write. Accrue sub-minor income over elapsed time before writing, or choose finer precision.
- `formatCurrency(definition, value)` shares that precision with display. Currency strings keep the existing wallet behavior; pass the definition to enforce precision.
- Anchor elapsed production and decay to game creation or a persisted last-run time, never a fixed epoch. `accrueSince(anchorMs, nowMs, { capMs })` returns elapsed time and the next anchor; persist both earnings and that anchor together.
- Validate purchase counts with `readQuantity(value, { min, max })`; NaN, Infinity, fractions, strings, and out-of-range values reject without coercion.
- Reset a profile with `initialPlayerState(runtime, userId)` from the same `onNewPlayer` hook used at join; insolvency never deletes a world.
- `ctx.game.chat.send(userId, text)` targets global chat; `recent({ limit })` returns at most 100 messages. The default is 240 characters and one message per author per channel every two seconds. Rejected messages need visible UI feedback.
- Hosts reuse `validateChatMessage` and `decideRateWindow`, storing the rate window transactionally with each accepted operation. Preserve chat rate windows when saving/restoring chat state.

For timed away missions, compose the pure transitions in `work/expedition` with
your existing `defineStore` and clock. The [expedition recipe](recipes/expeditions.md)
keeps bounded offline catch-up, finite supplies, return/death, capacity and RNG
continuity in one plain saveable state. Authored encounters, hazard/supply policy,
loot tables, quality ramps and text remain caller-owned; use `timeScaledRarity`
(`game/lootModifiers`) for elapsed-time odds with pipeline provenance.
