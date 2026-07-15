---
name: jgengine-gameplay
description: Gameplay systems: items, quests, economy, crafting, turns, objectives.
---

# jgengine-gameplay

## Content catalogs

### Object catalog fields

| Field | Purpose |
|-------|---------|
| `id`, `model` | Canonical id, asset key |
| `footprint` | `{ w, h, d }` placement bounds |
| `snap` | `"grid"` \| `"free"` \| `"wall"` |
| `solid` | Blocks movement |
| `breakable` | `false` or `{ baseBreakTime, harvest, drops, dropsWhenUnmet }` |
| `proximityPrompt` | Float UI + optional command invoke; `keybind(action, label?)` shows what the interaction does beside the key (`[E] Open Chest`) |
| `slotInventory` | Attached container `{ slots, accepts }` created at place time (`object:<instanceId>`) |

Break resolution: `duration = baseBreakTime / (tool?.breakSpeed ?? 1)`; drops per `when` (`always` / `harvestMet` / `silkTouch` / `playerKill`); then `inventory.put` + `object.remove`.

### Item catalog fields

| Field | Purpose |
|-------|---------|
| `id`, `kind`, `stack`, `model` | Basics; `stack` feeds `itemTraits.stackLimit` |
| `use` | Game handler name dispatched by `item.use` (`"fireGun"`, `"castBolt"`, `"drinkPotion"`) |
| `weapon` | Stats the handler reads via `item.weapon.getStat` — `damage`, `heal`, `reach`, `manaCost`, `projectile.{mass,gravity,fuseTime,settleOn}`, `explosion.{radius}` … |
| `trade` | `{ buy?: {coins: 80}, sell?, shops?: ["shop_town"] }` |
| `requires` | Unlock ids gating purchase/use |
| `placesObject` | Object id placed from hotbar |
| `rarity`, `baseType` | Read by the `worldItem` rarity render binding + loot filter when this item drops to the ground (#32/#33); `baseType` defaults to the item id when absent |

### Entity catalog fields

| Field | Purpose |
|-------|---------|
| `movement` | `walkSpeed` (reaches spawn automatically), `poses?: ["standing","crouch","prone","running"]`, `aim?: ["hip","ads"]`, `frozen?: boolean` — a scene-instance-level movement lock (cutscenes, stuns, mount transitions); `movedWhileFrozen(entity)` (`scene/entityStore`) flags an entity whose velocity moved anyway despite `frozen: true`, catching a system that bypassed the lock |
| `role` | `CatalogEntityRole` = `"player"` \| `"enemy"` \| `"hostile"` \| `"npc"` \| `"vehicle"` — catalog hostility class for targeting (`"enemy"`/`"hostile"` classify hostile in `cycleTarget`). Distinct from the scene *instance* `EntityRole` (`"player"` \| `"npc"` \| `"prop"`, in `scene/entityStore`) which drives input/camera binding — **possession** (`ctx.player.possession`) flips this instance role between `"player"`/`"npc"` on every control swap, so exactly one owned entity is ever the input/camera target |
| `stats` | Stat declarations — bounded values: `{ health: { max: 120, min: 0 }, level: { max: 60, min: 1, current: 1 }, … }` — `current` optional, defaults to `max` |
| `receive` | Per-effect absorption: `{ damage: { order: ["shield","health"], modifiers? }, heal: { order: ["health"] } }` — keyed by **game-defined effect ids**; presence = can receive |
| `onDeath` | `{ drops: "table_id" }` or reason-aware `{ drops: [{ table, when: { reason: "player_kill" } }], command?: { name, when? } }` |
| `wander`, `talkable` | AI descriptor; dialogue id sugar for a talk prompt |

### Dialogue catalog

`entities/npcs/dialogues.ts` — `{ id, lines: [{ speaker, text } | { choices: [{ label, invoke: { command, args } | null }] }] }`. Choices invoke `quest.accept`, `trade.open`, etc. Types ship from `@jgengine/react/components` (`DialogueDef`, `DialogueChoice`, `DialogueLine`) so a game imports them rather than redeclaring — the `DialogueBox` component renders the same shape it types.

A choice may gate its branch behind a roll: `{ check: { modifier, dc, advantage? }, onSuccess?, onFailure? }` (`onSuccess`/`onFailure` default to `invoke` when omitted). `DialogueBox` rolls via `@jgengine/core/stats/rollCheck`'s `rollCheck({ modifier, dc, advantage }, rng?)` (d20 by default; `advantage`/`disadvantage` roll twice and take the high/low; a natural 1 or max-die result reports `critical`) when the player clicks a checked choice, then calls `onChoice(choice, result)`.

**Open/close is a `features.dialogue` bridge — never a per-game dialogue store.** Set `features: { dialogue: true }` and the runtime builds `ctx.game.dialogue` (`open(id)` / `close()` / `openId()`) and auto-registers the `dialogue.open` (reads `{ id }`) / `dialogue.close` commands a `talkable(id)` prompt (or a proximity prompt's `invoke: { name: "dialogue.open", input: { id } }`) dispatches. React reads the open id with `useOpenDialogueId()` and routes a choice with `runDialogueChoice(commands, choice, result)` (resolves the invoke — honoring a check `result` — runs it, else closes) — both from `@jgengine/react/components`, alongside `resolveDialogueInvoke` for hand-rolled routing. So a panel is just `const id = useOpenDialogueId(); … <DialogueBox dialogue={CATALOG[id]} onChoice={(c, r) => runDialogueChoice(commands, c, r)} />` with no `defineStore`, no `dialogue.open`/`close` command, no open/close bookkeeping (#743).

## `scene.entity.stats` — bounded stats

```ts
stats.get(instanceId, statId)        // → { current, max, min } | null
stats.set(instanceId, statId, { current?, max?, min? })
stats.delta(instanceId, statId, n)   // → null | { reason } — clamps into [min, max]
```

Health, mana, xp, level, energy — any stat id declared on the catalog. Spawn seeds from the catalog (`current ?? max`). Combat writes through effects; non-combat (regen ticks, XP grants) calls `delta` directly.

**XP/level use the engine progression primitive.** `@jgengine/core/game/progression` ships `curve()`/`evalCurve()` (evaluate a game-owned XP-per-level curve *definition*) and `leveling()` (a level track over the bounded `xp`/`level` stats that reports overflow). You own the curve *numbers* in a catalog; the engine owns the overflow math — on level-up bump `level.current`, reset `xp.max` from the curve, push a `stat.levelUp` feed entry. Hand-rolling `xpForLevel`/`levelFromXp`/`xpToNextLevel` is the anti-pattern — those already exist. `LevelingConfig.thresholdMode` picks how the curve is read: `"perLevel"` (default) treats `xpForLevel(N)` as the incremental N-1→N cost, summed internally; `"cumulative"` treats `xpForLevel(N)` as the total lifetime XP to reach level N (0 at/below `startLevel`) and compares `xp.current` straight against those totals — pick this for a design that quotes "total XP to level N" tables.

`leveling({ …, thresholdMode: "cumulative" })` switches to lifetime-total semantics: `xp` is a running total instead of a per-level bank, and `resolve(level, xp)` walks upward from `level` to the highest level whose cumulative threshold `xp` clears — it never demotes, and clamps the returned `xp` to the max-level threshold once capped. Default is `"perLevel"` (unchanged, fully back-compat) — pick `"cumulative"` for a total-XP display (MMO-style "12,450 XP") instead of a resettable per-level bank.

`ctx.player.stats` is a different thing: **modifiers** (buffs, ADS zoom, walk-speed bonuses) via `base/add/remove/get` with expiries — never bounded current/max values.

## Targeting (MMO tab-target)

Persistent per-entity session state — never a per-use input field.

```ts
ctx.scene.entity.setTarget(fromId, toId | null)
ctx.scene.entity.getTarget(fromId)                    // → instanceId | null
ctx.scene.entity.cycleTarget(fromId, { filter: "hostile" | "friendly" | "any", direction? })
```

Hostility comes from catalog `role` (`"enemy"`/`"hostile"` classify hostile). Input `tabTarget`/`clearTarget` actions route here. Handlers always read `getTarget(input.from)` — `ItemUseInput` deliberately has **no `to` field** (single source of truth, no client-supplied target to validate, three targeting models stay clean: aim for shooters, `queryArc` for melee, `getTarget` for MMO).

## `item.use` — one verb for all usable items

```ts
ctx.item.use.register(handlers)      // once in onInit; duplicate names throw
ctx.item.use.can(ctx, input)         // → { reason } | null
ctx.item.use.use(ctx, input)         // dispatches catalog `use` → your handler

type ItemUseInput = { from: string; itemId: string; inventoryId?: string; aim?: Aim };
type ItemUseHandler<GameContext> = {
  can?(ctx, input): { reason: string } | null;
  apply(ctx, input): { state: GameContext; error?: string };
};
```

**Handlers receive the full `GameContext` as state** and mutate through it. Handlers own ammo, cooldowns, range checks, and effect ids; the engine owns projectile geometry, stat clamp math, and `canReceive`.

| Handler | Engine calls |
|---------|--------------|
| gun | spend ammo → `fireProjectile` → `settleProjectile` |
| grenade | `fireProjectile` (ballistic) → settle → `effect({ at, radius })` |
| melee | `queryArc` + reach from `getStat` → `effect` per hit |
| MMO cast | `getTarget(from)` → `stats.delta(mana)` → `effect({ to })` |
| consumable | `effect({ to: from, effect: "heal", via: { amount: -n } })` |

Banned in the engine: `weapon.fire`, `consumable.use`, `game.combat.*`, per-weapon commands.

### Skill-checks and QTE (timed/rolled minigames)

`@jgengine/core/interaction/skillCheck` models a moving-target-zone minigame (casting/reeling, active-reload): `evaluateSkillCheck({ trackWidth, zone, markerPeriod, window, zoneDriftPerSecond? }, elapsedSeconds)` bounces a marker back and forth over `markerPeriod` seconds and returns `{ success, timedOut, markerPosition, zone }` — `zone` itself can drift when `zoneDriftPerSecond` is set. It is pure: an `item.use` handler starts a session by recording `ctx.time.now()` (game-time, so pause/fast-forward apply for free) the first time it's pressed, and evaluates `evaluateSkillCheck` against the elapsed time on the next press to lock in success/fail — the session bookkeeping (a `Map<instanceId, startedAt>`) is game-owned, same pattern as an ability-cooldown map.

`@jgengine/core/interaction/qte` sequences discrete timed prompts: `evaluateQteSequence(steps: QteStep[], inputs: QteInputEvent[])` walks `{ id, action, windowStart, windowEnd }` steps against `{ action, at }` presses and returns `{ status: "success" }` or `{ status: "fail", atStep, reason }`; `pendingQteStep`/`qteProgress` read the currently-active step and fraction complete for UI.

`@jgengine/react` ships matching headless UI: `SkillCheckBar({ config, startedAt })` and `QteTrack({ steps, startedAt })` self-tick via `requestAnimationFrame` and read `ctx.time.now()` each frame — pass `className`/`trackClassName`/`zoneClassName`/`markerClassName` (or `stepClassName`/`activeClassName`/`doneClassName` for `QteTrack`) for the moving-zone/timing visuals the UI quality bar requires.

`@jgengine/core/interaction/lockpick` models a solvable grid depth-puzzle ("thread a hidden path through a lock"): `generateLock(seed, tier: LockTierSpec)` carves a guaranteed solution path first (so any `tier` is always fair), then wraps an open-row forgiveness `width`, tumbler `gateCount` columns that pinch to one exact row, and optional `trapCount` ward-traps that look open but jam on contact — never on the solution. `stepLock(spec, col, row, action)` is the authoritative per-move resolver (`hardSet`/`set`/`steady`/`ease`/`drop`, mapped to a `-2..+2` row delta via `LOCK_ACTION_DELTA`), returning `advanced`/`success` (pick moves) or `slip`/`bind`/`trap` (pick doesn't move — the caller's session owns the lives economy, same pattern as an ante/tries counter). `visibleCells(spec, col, window)` is the fog-of-war and anti-cheat boundary: only cells within `col + window` of the current position are ever revealed, so a server never serializes the full board. `solveLock(spec)`/`solveLockPath(spec)` verify or compute a concrete solution — useful for a "give up and reveal it" hint, or for driving a bot/test through a session deterministically (walk the row deltas as actions). The board itself is pure data (`LockSpec`): a game owns session state (position, lives, ante) as a small `Map<userId, session>`, the same shape as a skill-check session map.

### Capture and owned roster

`@jgengine/core/scene/captureCheck` — `captureChance({ hpFraction, catchPower, difficulty? })` returns a 0..1 probability (lower `hpFraction` and higher `catchPower` raise it, higher `difficulty` lowers it); `rollCapture(input, rng?)` rolls it. `@jgengine/core/scene/roster` — `createRoster()` is a persisted, per-owner store (`capture`, `release`, `list`, `get`, `setEquipped`, `equippedList`, `snapshot`/`hydrate`) wired onto the runtime as `ctx.game.roster`, distinct from `game.social.party` (session-ephemeral) — roster entries persist and are optionally equipped (deployed) independent of party membership.

A capture item's `item.use` handler composes the primitives instead of forking them: read the wild target's hp via `ctx.scene.entity.stats.get(target, "health")`, roll `rollCapture({ hpFraction, catchPower })`, and on success call `ctx.scene.entity.despawn(target)` + `ctx.game.roster.capture(ownerId, catalogId)` — the wild scene entity is removed and re-parented into the owner's persisted roster; the react `CaptureOdds({ chance })` component shows the live odds meter the UI quality bar requires.

### Local saves — mutable single-player state

`@jgengine/core/game/recordBook` — `createRecordBook({ key, fields, storage? })` is a personal-best record book: named numeric fields racing toward `"lower"` (times) or `"higher"` (scores, streaks), with `best()` / `bestOf(field)` / `submit(run)` / `clear()`. `@jgengine/core/game/keyValueStore` — `createKeyValueStore({ key, initial, storage? })` is a single persisted mutable cell (`get` / `set` / `update` / `clear`) for single-player state a `recordBook` can't hold: a credit bank, a settings blob, level progress. `recordBook` is monotonic — it keeps only improved values; reach for the KV store when the value moves both ways. Both target the DOM-free `KeyValueStorage` seam and both default `storage` to the browser's `localStorage` when omitted — pass a stub in tests, or `storage: null` to force memory-only. That default already no-ops when `localStorage` is missing or throws (private mode, quota, SSR): adopters pass a `key`, never a hand-rolled `typeof localStorage` guard. Corrupt or unavailable storage degrades to in-memory and never throws into a tick. Author any core-side persistence against `KeyValueStorage`, never the DOM `Storage` type — core has no DOM lib, so copying shell's `fovPreference.ts` shape into core fails the build.

### Whole-game save — one API, offline **or** cloud

`@jgengine/core/game/saveStore` is the "save the game" primitive when a single cell isn't enough (a full run, inventory, progress blob) **and** the storage target should be swappable — offline today, a database tomorrow, without touching game code. `createSaveStore({ backend, initial, key?, slot?, version?, migrate?, autosave? })` returns a store with `value()` / `set(v)` / `patch(fn)` / `load()` / `save()` / `clear()` / `switchSlot(id)` / `slots()` / `subscribe()` / `status()`. The only thing that changes between offline and cloud is the `backend`:

- `localSaveBackend(storage?)` — the browser's `localStorage` by default (offline, on-device); a stub or `null` for memory-only. This is the drop-in for "just save it locally."
- `memorySaveBackend()` — session-only; tests, SSR, or a "no persistence" mode that still runs the same save path.
- `remoteSaveBackend({ read, write, remove })` — the seam for a database or HTTP endpoint: pass any three async functions and every save goes to the server. `@jgengine/convex/convexSaveBackend({ client, functions?, namespace? })` builds one for Convex (`defaultConvexSaveFunctions()` assumes a `saves.read` / `saves.write` / `saves.remove` module; pass your own refs to override).

`autosave: true` (or `{ debounceMs?, maxWaitMs? }`) persists on a debounce after every `set`/`patch` — no manual save calls, no lost progress; leave it off and call `save()` at checkpoints. `version` + `migrate(data, fromVersion)` upgrade an older payload when the save shape changes (a bare pre-`saveStore` value arrives as `fromVersion` `0`), so shipping a new build never wipes a player's save. Named `slot`s + `slots()` back a multi-save menu on any backend, including opaque remote ones. Backend failures surface as `status() === "error"` and through `onError` — a save never throws into a tick. In React, `useSaveStore(store)` (`@jgengine/react/save`) reads the live `value`/`status`, exposes `set`/`patch`/`save`/`clear`, and loads once on mount — the same hook for offline and cloud, only the store's backend differs.

## Race sessions

`@jgengine/core/game/race` layers a start-line lifecycle and results math over the existing `createRaceState`/`createLapTimer` position tracker. `idleRaceSession()` is the pre-race grid state; `startRaceCountdown({ seconds? })` drops the lights into a `countdown` phase (or straight to `racing` for a standing start); `tickRaceSession(session, dt)` bleeds the countdown and accumulates `elapsed` while racing; `finishRaceSession(session)` freezes it at the flag. Once a finish order exists, `racePlacements(finishOrder, options?)` turns it into every racer's 1-based `place` + win/lose `outcome`, `placementOf(finishOrder, racerId, options?)` reads one racer's placement, and `raceOutcomeOf(finishOrder, racerId, options?)` is the plain win/lose shortcut — all three share a `winningPlaces` cutoff (default 1, pass 3 for a podium finish) instead of a hand-rolled `ranking[0] === player` check.

## Combat — effects, projectiles, death, feel, abilities
## Card, board & shaped-inventory primitives
Pure, renderer-free structures for card, board, and deckbuilder games — they sit **beside** the slot inventory, not in place of it. All are immutable-reducer + thin-controller pairs, mirroring the two-tier ctx/factory model: use the `create*` controller in game code, reach for the exported pure functions (`draw`, `moveCards`, `tickTimeline`, `laneAggregate`, `runPipeline`, `placeShaped`) for unit tests and headless servers.
```ts
// cards/cardPile — named ordered zones (deck/hand/discard/exhaust); seeded shuffle, hand limit, reshuffle-on-empty
const pile = ctx.game.cards.pile("deck", { zones: ["deck","hand","discard","exhaust"], drawFrom:"deck", handZone:"hand", discardTo:"discard", handLimit:7, reshuffleFrom:"discard" });
pile.reset(createCardPileState(pileConfig, { deck: ids }));   // seed zone contents once, from onInit
pile.shuffle("deck", seed);            // seeded Fisher–Yates via pileRng — deterministic under the same seed
pile.draw(5);                          // deck → hand, clamped to handLimit, reshuffles discard when deck runs dry
pile.discard(ids); pile.exhaust(ids, "exhaust");   // Slay the Spire / Balatro lifecycle
// cards/modifierPipeline — ordered { source, apply(value) → value } with an inspectable per-step trace
const score = runPipeline({ chips: 10, mult: 1 }, jokers);   // score.value + score.trace[i].{before,after,changed} for Balatro-style scoring readouts
// board/laneBoard — N lanes, per-side power aggregate + optional per-lane LaneRule modifier (Marvel Snap / Inscryption)
board.aggregate(lane, "player").total; board.outcome(lane).winner; board.lanesWon();
// board/timelineBoard — N slots each on an independent cooldown, resolving in expiry order (The Bazaar auto-battlers)
board.tick(dtMs);   // → fires[] sorted by expiry time then slot index; multiple fires per slot per tick
// inventory/shapedGrid — polyomino footprints, rotate, overlap-check, adjacency (Backpack Hero / Tetris inventory)
placeShaped(grid, { id, value, footprint }, [col,row], rotation);   // rotateFootprint / canPlace guard overlap + bounds
gridAdjacencyQuery(grid).neighborsOf(id);   // feeds synergy effects
```
Reuse the engine's seeded RNG (`pileRng`) for anything random — never `Math.random()` in game logic. The React drag/rotate/drop/snap gesture layer over these lives in `@jgengine/react` (see UI section).

`ctx.game.cards.pile(id, config?)` is the runtime-wired accessor for `createCardPile`: lazily creates the pile on first call (`config` required then) or returns the existing one for `id` on every later call, and every mutation notifies `ctx.subscribe`/bumps `ctx.version()` — so a `useEngineState`-bound hand/discard view re-renders without a game-owned store. Reach for `createCardPile` directly only for a headless test or server; game code goes through `ctx.game.cards.pile`.

## Puzzle primitives — cell grids and falling pieces

Two pure, renderer-free `@jgengine/core` primitives for cell-based puzzle games (Tetris wells, match-3 boards); tile art and the drop-cadence loop are the shell's/game's job.

- **`puzzle/cellGrid`** — a generic immutable `CellGrid<T>` for uniform typed-cell boards. Row 0 is the top; `y` grows downward. `createCellGrid`, `cellAt`, `withCell`/`withCells` (immutable single/batch writes), `fullRows`/`clearRows` (line-clear + compaction), `collapseColumns` (match-3 cascade gravity), `findRuns` (run detection with an optional custom matcher).
- **`puzzle/fallingPiece`** — the falling-piece layer over a `CellGrid`: `ShapeTable<TShape>` maps rotation states to cell offsets; `pieceCells`/`pieceCollides`/`mergePiece` place, test, and commit a piece; `dropDistance` computes the ghost-piece landing row; `gravityInterval`/`levelForLines`/`lineScore` are the classic Tetris drop-speed/level/score curves (overridable); `createLockDelay`/`stepLockDelay` is the grounded→countdown→lock stepper (`delaySeconds: 0` locks instantly on touchdown).
- **`tactics/fallingGrid`** — a generic tile-drop grid over any `TCell` payload (distinct from the `cellGrid`/`fallingPiece` row-clear pair): `createFallingGrid(config)`, `gravityIntervalMs(level, config?)` for the drop-speed curve, and a `FallingGridSnapshot`/`LockState` shape for the grounded→lock stepper.

## Dropped items — `worldItem` and the loot filter
A `worldItem` is a scene **entity** (position + item ref + rarity), never an inventory item or object — see the three buckets. `onDeath.dropMode: "world"` (above) is the usual producer; games can also hand-place ground loot (chests, quest drops).
ctx.scene.worldItem.spawn({ itemId, position, rarity?, baseType?, count?, affixTier?, source? })
ctx.scene.worldItem.get(instanceId) / list() / nearestInRadius(from, radius, filter?)
ctx.scene.worldItem.pickup(instanceId, userId)   // grants to inventory + despawns, emits worldItem.picked_up
Click-to-grab is engine-owned: setting `pointer.grabWorldItems: true` in `defineGame({...})` makes `@jgengine/shell`'s `GamePlayerShell` resolve `pointer.worldHit()` on primary click, and — when the hit entity is a `worldItem` within the `worldItem.pickupRadius` (default `DEFAULT_PICKUP_RADIUS`) configured on `defineGame({...})` of the local player — calls `pickup` directly, no game command needed. `@jgengine/react`'s `useWorldItems()` / `useNearestWorldItem(radius)` drive a HUD pickup prompt off the same store.
Presentation is a two-layer render binding, both engine-owned (rendered by `@jgengine/shell`'s `WorldItems`) over **game-supplied data**:
1. **Rarity baseline** — the `worldItem.rarityStyle: Record<rarity, { color?, beam?, label? }>` field of `defineGame({...})`, the game's rarity palette (Borderlands/Diablo-style beam + color coding).
2. **Loot filter overlay** (#33) — the `worldItem.filter: LootFilterRule[]` field of `defineGame({...})`, built with `lootFilter([{ id, when: { rarity?, baseType?, minAffixTier?, maxAffixTier? }, hide?, color?, beam?, label? }])` from `game/lootFilter`. **First matching rule wins** (PoE/Last Epoch block semantics); a rule only overrides the fields it sets, everything else falls back to the rarity baseline. `resolveWorldItemPresentation(item, rarityStyle, rules)` composes both layers and is what the shell calls per item.
## Gear systems — durability, affixes, modular items, storage tiers
Four pure primitives that hang off item **instances** (not the stackable catalog id) — all catalog-first (specs are game-supplied config) and renderer-free. Item instances that carry durability/affix/modular state key off a game-assigned instance id, the same way targeting keys off entity instance ids.
**Durability** (`item/durability`) — per-instance wear + repair. `DurabilitySpec` (`{ max, wearPerUse?, wearPerHit?, disableAtZero?, repair? }`) is catalog data; `createDurability(spec)` seeds a `DurabilityState`, `wear(spec, state, "use" | "hit", times?)` decrements (floors at 0), `isDisabled(spec, state)` gates use at zero, `durabilityFraction` feeds a HUD bar. Repair is quote-then-apply: `repairQuote(spec, state, { station?, to? })` returns the `{ item, count }[]` material cost (scaled by points restored) + the post-repair state (optional `qualityLossPerRepair` shrinks `max` each repair, Tarkov-style) — the game charges the materials through inventory, then commits the quote's `state`. `createDurabilityTracker()` keeps `DurabilityState` per instance id for the runtime.
**Affix roller** (`item/affix`) — procgen `base × rarity → { rolled affixes, computed stats, name }`. `createAffixRoller({ pools, rarities })` over rarity-weighted `AffixPool`s. `roll(base, rarityId, rng)` draws `affixCount` distinct affixes without replacement (weighted, via the engine's `pickWeighted`), computes stats (base × `rarity.statScale`, then `op: "add"` affixes, then `op: "mul"`), and composes a name from `rarity.namePart` + prefix/suffix parts. `rollRarity(rng)` picks a weighted tier; `rollRandom(base, rng)` chains both. Pass `seededRng(seed)` for deterministic drops; any `() => number` rng works (same contract as `loot.roll`). `seededRng` lives in `random/rng` (re-exported here) alongside `seededStreams(seed)`, which derives independent named streams from one seed — `streams("worldgen")` vs `streams("history")` — so simulation draws never perturb generation (intervening in a run cannot change the map).
**Item instance registry** (`item/itemInstanceRegistry`) — the runtime home a rolled item needs once it leaves the roller (#536.1). `createItemInstanceRegistry<TDef>(prefix?)` stores any def shape behind a generated id (`"<prefix>:<baseId>:<n>"`, unique per registry); `get`/`has`/`release`/`count` round it out. `proceduralLootEntry(registry, roll)` wraps a roller into a `lootTable` `generate` callback (see `jgengine-combat`'s Loot section) so a drop table can hand back a freshly rolled instance instead of a static catalog id — the game's `content.itemById` checks the registry for ids it doesn't otherwise recognize, and every existing id-based system (inventories, world-item pickup, trade) keeps working unchanged.
**Modular item** (`item/modularItem`) — a whole assembled from parts in typed mount slots (guns, mechs). `ModularItemDef` has `slots: MountSlotDef[]` (`{ id, accepts, required? }`); `install(def, installed, slotId, part)` validates the slot exists, accepts the part's `category`, and is empty; `computeEffectiveStats(def, installed)` rolls part `stats` (additive) then `multipliers` over `baseStats`; `missingRequiredSlots`/`isComplete` gate a buildable whole. `createModularItem(def)` is the stateful wrapper (`install`/`uninstall`/`effectiveStats`/`partInSlot`).
**Storage tiers + insurance** (`inventory/storageTier`) — the extraction-economy inventory half. Inventory containers carry a `tier: "carried" | "banked"` (`InventoryDeclaration.tier`; a Tarkov secure container is just a `banked` container on the body). `partitionOnDeath(containers)` splits a death snapshot into `{ kept, lost }` (banked survives, carried is dropped, stacks merged). `createDeliveryQueue()` is the delayed-delivery (insurance) hook: `schedule` a `ScheduledDelivery` with a game-time `deliverAt`, then `due(now)` / `claimDue(now)` drain it on the tick clock. `insureLost(lost, policy, userId, now, rng?)` filters the lost set to insured items and stamps a delayed `deliverAt` → feed straight into the queue. `resolveConsolation(policy, partition)` returns a baseline loadout id (apply via `applyLoadout`) — the death consolation grant, optionally gated on `if-carried-empty`. *(Session/round machines — extraction hold-to-leave, raid banking — consume this tier; see the objective-machine group.)*
## Objective, round & session machines
Content-agnostic state machines for competitive/session shapes — plant/defuse, buy/live/end rounds, downed/revive, the battle-royale ring, extraction raids, run-vs-meta persistence. All pure `core`; every timer takes a **game-time** `dt`/`now` (`ctx.time`), so pause and fast-forward apply for free. Drive them from `loop.onTick` and pipe their events into `ctx.game.feed`/`events`; render their snapshots as HUD (per the UI quality bar in [`../jgengine-ui/reference.md`](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine-ui/reference.md) — the downed banner, ring warning, and extraction timer are required HUD).
**Race session & placements** (`game/race`) — the grid→countdown→racing→finished lifecycle and results-screen math riding alongside `RaceState`/`createRaceState`. `idleRaceSession()` starts a session at the grid (`phase: "idle"`); `startRaceCountdown({ seconds? })` drops the lights into `countdown` (or straight to `racing` at `seconds: 0`); `tickRaceSession(session, dt)` bleeds the countdown and accumulates `elapsed` while racing; `finishRaceSession(session)` freezes it at the flag. Once a `race.finished` event hands back a finish-order ranking, `racePlacements(finishOrder, { winningPlaces? })` turns it into every racer's `{ place, outcome }`, `placementOf(finishOrder, racerId, options?)` reads one racer's placement, and `raceOutcomeOf` is the win/lose-only shortcut — the `1st/2nd/3rd` + win/lose a results screen shows.
**Contested channel** (`session/contestedChannel`) — the interrupt-on-damage progress objective behind plant/defuse, cash-out, urn deposit, banishing, and hold-to-extract. `createContestedChannel({ duration, interruptOnDamage?, resetOnInterrupt?, favorability?, ratePerOccupant?, contested?, decayRate? })`: `start(team)` begins the channel, `tick(dt, occupants)` advances it against per-team occupancy (`Record<teamId, count>`) and emits `start`/`tick`/`contested`/`paused`/`complete` events, `damage(reason?)` interrupts (keeps or zeroes progress per `resetOnInterrupt`). `favorability[team]` scales fill rate (Deadlock deposit); `ratePerOccupant` fills faster with more owners present; `contested: "pause" | "decay"` chooses whether an opposing occupant freezes or reverses progress (The Finals contest). The owner leaving pauses it. Extraction hold-to-leave reuses this primitive verbatim.
**Round state** (`session/roundState`) — the buy→live→end match machine (Valorant/CS). `createRoundState({ phases, teams, phaseOrder?, winCondition?, maxRounds?, winReward?, lossBonus? })`: `tick(dt)` runs the phase timer and auto-advances (emitting `phase.start`/`phase.end`, rolling the last phase back into the next round's first), `concludeRound(winner)` records the win on any "conclude-eligible" phase (any phase but the first/last in the cycle), settles `round.economy` (winner gets `winReward`, losers get an escalating `lossBonus` via `lossBonusFor(rule, streak)` clamped to `max`), and moves to the next phase. `onPhaseEnd(hook)` fires commerce/spawn gates on each transition; `match.end` fires at `maxRounds`. `server.mode` stays a game string — this is the timer/economy engine under it.

Two extras beyond the default buy/live/end cycle: `phaseOrder?: string[]` overrides the phase names/cycle entirely (a wider `Record<string, number>` `phases` shape to match) — a draft→ban→play→score cycle is the same machine with different phase names. `teams: (string | { id, role? })[]` accepts a plain id or a `{ id, role }` pair; `roleOf(team)` reads the tag back (`"attacker"`/`"defender"`, Valorant side assignment) without a parallel lookup table. `winCondition?: (snapshot: RoundSnapshot) => string | null` lets `evaluate()` (call it from `onTick` alongside `tick(dt)`) auto-conclude the round the instant a score/objective condition is met, instead of the game hand-calling `concludeRound` — return a team id to end it, `null` to keep playing; `RoundSnapshot` is `{ round, phase, timeLeft, scores, lossStreaks, roles, matchOver }`.
**Role assignment** (`session/roles`) — `assignRoles(players, specs: RoleSpec[])` distributes fixed-count or proportional roles (hider/seeker, spy/operative, prop/hunter) across a player list — the allocation half of an asymmetric session mode; `RoundConfig.teams`' per-team `role` is the lighter-weight alternative when a round machine already tracks the roster.
**Downed / revive** (`combat/downed`) — the 3-state alive→downed→dead chain (Apex/Helldivers). `createDownedState({ bleedoutSeconds, reviveSeconds?, reviveHealthFraction?, banner? })`: `down(id)` starts the bleedout, `tick(dt)` counts it down (→ `died`, optionally spawning a `banner`), `revive(id, dt)` accumulates an ally's hold time (→ `revived` with the health fraction the game restores), `finish(id)` executes a downed enemy, and `respawnFromBanner(id)` brings a banner-holder back at a beacon. It sits **in front of** the engine death resolution: on lethal damage call `down` instead of dying; on `died`/`bleedout` run the real `resolveDeath`. No banner ⇒ death is terminal.
**Shrinking ring** (`session/ring`) — the battle-royale safe zone with out-of-bounds DoT. A catalog `RingConfig` is `{ center, phases: RingPhase[] }` where each phase is `{ startTime, shrinkDuration, fromRadius, toRadius, damagePerSecond, center? }` on the game clock. `ringSampleAt(config, t)` / `createRing(config).at(t)` returns the live `{ center, radius, damagePerSecond, shrinking }` (radius/center interpolate during each shrink window, hold between phases); `isOutside(t, pos)` / `distanceOutside(t, pos)` test a point, and `damageOutside(t, dt, positions)` returns per-entity `{ id, damage }` for everyone beyond the wall — feed those into `scene.entity.stats.delta`/`effect` each tick.
**Extraction session** (`session/extraction`) — the raid-scoped "reach an extract and leave to bank what you carried" wrapper (Tarkov/DMZ/Helldivers), composed from the contested channel + `inventory/storageTier`. `createRaidSession({ extracts, insurance?, consolation? })`: `beginExtract(userId, extractId, team?)` opens a hold-to-leave channel, `tickExtract`/`damage` drive it, and on completion `resolveExtraction(userId, containers)` banks everything carried. `resolveDeath(userId, containers, now, rng?)` runs `partitionOnDeath` (banked kept, carried lost), schedules insured items through the built-in delivery queue (`claimDeliveries(now)` drains it on the clock), and yields the consolation loadout id. `playerSnapshot(userId)` feeds the extraction-timer HUD.
**Persistence scopes** (`runtime/persistenceScope`) — the run-vs-meta split with explicit reset boundaries (Icarus mission wipe, Once Human season reset). `partitionScopes(state, { run })` splits a flat record into `{ meta, run }` by key; `resetRun` clears the run half while meta (talents/blueprints/account currency) survives; `clearRunFields(playerRow, runFields)` and `applyRunReset(profile, runFields, now)` do the same over `RuntimePlayerRow`/`PlayerProfileRecord`. `planScenarioReset({ gameId, serverId?, wipeChunks?, wipeServerSession?, resetPlayers?, runFields? })` normalizes a scenario/season reset that `HostPersistence.resetScenario?(reset)` applies — `@jgengine/sql` implements it (deletes the server's chunks + session, run-resets each profile in one transaction), keeping account meta intact.

## Trade

Opt-in: `defineGame({ features: { trade: true } })` — else `ctx.game.trade` is `undefined`. Catalog `trade` fields drive everything — no duplicate price lists.

```ts
ctx.game.trade.canBuy(itemId, shopId, count?)   // → reason | null
ctx.game.trade.canSell(itemId, count?)
ctx.game.trade.buy(itemId, count, { shop, inventoryId })   // charge → put, rolls back on failure
ctx.game.trade.sell(itemId, count, { shop, inventoryId })
ctx.game.trade.tradableAt(shopId, allItemIds)   // derive stock from catalogs
```

## Player listing marketplace (auction house)

`@jgengine/core/economy/listingBook` — a player-driven marketplace distinct from `trade` (fixed vendor buy/sell): players post their own goods, other players buy them, a house cut is taken on every sale, unsold listings expire and return to the seller, and sale proceeds/returns sit in a per-seller collection box until claimed. Not wired onto `ctx.game` as a feature — like `inventory/storageTier`'s delivery queue (mail), a game builds one `createListingBook` instance and wires post/buy/cancel/collect through its own `ctx.player.inventory`/`ctx.game.economy` calls (see `Games/claudecraft/src/game/auction/systems.ts` for the full wiring: escrow-on-list, put-then-charge-then-finalize-with-rollback on buy, a `ctx.time.every` sweep, and a browse/search view synced into `ctx.game.store`).

```ts
const book = createListingBook({ maxListingsPerSeller: 12, expirySeconds: 48 * 3600, cutRate: 0.05, minPrice?, maxPrice? });

book.post({ sellerId, itemId, count, price, currency, now })   // → { status: "ok", listing } | { status: "rejected", reason }
book.cancel(listingId, sellerId)                               // owner-only; caller returns the item to bags
book.buy(listingId, buyerId, now)                               // removes the listing, credits the seller's box with price minus cutRate — never the seller's wallet directly
book.sweepExpired(now)                                          // moves every past-expiry listing's goods into its seller's box as items, never currency
book.active() / book.listingsOf(sellerId) / book.countOf(sellerId) / book.get(listingId)
book.collectionOf(sellerId)                                     // { currency, items } snapshot, non-mutating
book.claimCurrency(sellerId)                                    // drains + returns the box's currency (always collectible)
book.claimItem(sellerId, itemId, count)                          // removes only what the caller actually placed in inventory (partial claims leave the remainder boxed)
```

The buyer/seller wallet and inventory movement is the caller's job, same split as `game/trade`: the primitive owns only the listing lifecycle and the escrowed collection-box bookkeeping behind it, so it stays reusable across genres (MMO auction house, survival-sim trading post, city-builder marketplace) without pulling in any one game's inventory shape.

## Economy and unlocks

`economy` is always on; `ctx.game.unlocks` is opt-in via `features: { unlocks: true }` (else `undefined`).

```ts
ctx.game.economy.balance(userId, currencyId) / grant(...) / charge(...)  // charge → { reason } | null
ctx.game.economy.isOverdrawn(userId, currencyId)
ctx.game.unlocks.has(userId, id) / grant(userId, id) / list(userId) / tree(categoryId)
```

`charge`/`chargeAll` (`economy/wallet`) reject once a deduction would go negative by default — the strict no-debt rule. Opt one call into carrying a negative balance with a 4th `options` arg: `charge(state, currency, amount, { overdraft: true })` (unlimited debt) or `{ overdraft: { max } }` (capped — rejects once `balance - amount` would fall below `-max`). `ctx.game.economy.charge(userId, currencyId, amount, options?)` threads the same options through; `isOverdrawn(state, currency)` (pure) / `ctx.game.economy.isOverdrawn(userId, currencyId)` (ctx) read whether a wallet is currently negative. `grant` is unaffected — it always tolerates paying a negative balance back up, overdraft or not.

Catalog `requires: [unlockId]` gates validate at command time.

## Crafting, tech tree & production

Four **pure** primitives (no ctx, no renderer) for survival-crafting, tech-tree, factory, and farming games. All are catalog-first: recipes, tech nodes, production rates, and crop stages are game **data** you feed the primitive — the engine owns the graph math, the timers ride `ctx.time` (game-seconds), never wall-clock.

**Recipe graph** — `@jgengine/core/crafting/recipe`. A `RecipeDef` is `{ id, inputs: RecipeItem[], outputs: RecipeItem[], seconds?, station?, stationRange?, requires? }` — inputs + optional required-workstation-in-range + time → outputs. `craft(state, layout, traits, recipe, context)` consumes inputs and produces outputs on an `InventoryState` **atomically** (rejects `missing-inputs` / `no-station` / `locked` / `no-output-space` without mutating on failure); `canCraft(...)` is the dry-run. `context = { origin?, stations?, unlocked? }`: `stationSatisfied` checks a matching placed workstation (`{ catalogId, position }`) within `stationRange` of `origin`, and `requires` gates on `unlocked(id)` (wire it to `ctx.game.unlocks.has` or the tech tree). `createRecipeGraph(defs)` indexes recipes by `producing(itemId)` / `using(itemId)` / `category`. Long crafts schedule completion with `ctx.time.after(craftSeconds(recipe), …)`.

**Tech tree** — `@jgengine/core/economy/techTree`. **Generalizes flat `unlocks`, does not duplicate it**: a `TechNodeDef extends UnlockDef` adds `requires` (prerequisite node/unlock ids), an optional `recipe` payload, and `grants` (extra flat unlock ids). A node id **is** an unlock id, so flat unlocks are just tech nodes with no `requires`. `createTechTree(defs)` wraps `createUnlocks` internally and gates grants on prerequisites: `unlock(userId, id)` refuses until every `requires` is met, `available(userId)` is the reachable frontier, `recipes(userId)` lists the recipe payloads a player has unlocked (feed them to the recipe graph). `tree(categoryId)` and per-user `has`/`list`/`snapshot`/`hydrate` mirror `unlocks`.

**Production building** — `@jgengine/core/crafting/production`. `productionBuilding({ id, inputs, outputs, rate, power?, bufferMultiplier? })` — a placed building that consumes buffered inputs and emits outputs on a timer. `rate` is production **cycles per game-second**; `tickProduction(def, state, { dt, powered? })` advances continuously through `dt` (so pause/fast-forward apply for free) and completes as many cycles as the buffer allows. `feedProduction` / `drainOutput` move items in and out of the internal buffers (a puller/conveyor). `advanceTransport(path, items, dt)` slides items along a belt and splits off `delivered`. `resolvePowerGrid(supply, consumers)` powers demands greedily until supply is exhausted — gate a building's tick on `powered`.

**Farming** — `@jgengine/core/crafting/crop`. `CropTileState` is a soil state machine (`untilled` → `tilled` → planted); `tillTile` / `plantCrop` / `waterTile` are pure tile transitions and `advanceCropDay(def, tile)` runs the **day tick** — a `CropDef { stages, regrowDays?, needsDailyWater?, harvest? }` advances a growth stage per watered day and sets `harvestable`; `harvestCrop` yields and either clears the tile or resets a regrow crop. `applyToolToTiles(tiles, center, pattern, apply)` applies a tool across a tile pattern under the cursor — `singleTile()`, `squarePattern(r)`, `diamondPattern(r)`, `rectPattern(w,d)` (watering-can / hoe AoE). `createCropField(catalog)` is the stateful wrapper over a tile grid (`till`/`plant`/`water`/`harvest`/`advanceDay`); drive `advanceDay()` off the calendar day rolling over — `createDayTicker(startDay)` reports how many days `ctx.time.calendar().day` has crossed.

## `applyLoadout`

```ts
ctx.player.loadout.register(loadouts)                    // onInit
ctx.player.applyLoadout(userId, loadoutId)               // → null | { reason }
```

`LoadoutDef = { inventories?: { hotbar: [{ item, count, slot? }], … }, stats?, economy?, unlocks? }`. Application is **all-or-nothing**: every inventory put dry-runs first; any rejection applies nothing. Starter kits gate on `ctx.player.isNew`; class/respawn kits run from commands. Never scatter raw `put`/`grant` calls for a kit.

## Quests

Opt-in: `defineGame({ features: { quest: true } })` — else `ctx.game.quest` is `undefined`.

```ts
ctx.game.quest.register(catalog)                          // onInit
canAccept / accept / abandon / canTurnIn / turnIn / grant / revoke
progress(userId, questId, objectiveId, delta)
list(userId)  /  has(questId)
bind("entity.died")        // kill objectives match objective.target === catalogId
bind("inventory.added")    // collect objectives match objective.item
```

Catalog: `{ id, title, giver?, turnIn?, requires?, objectives: [{ id, kind, target?/item?, count, partyShare? }], rewards? }`. `requires` is satisfied by a completed quest of that id or an unlock. `turnIn` applies declarative `QuestRewards` — `{ xp?: { amount }, economy?: Record<string, number>, items?: { item, count, inventory }[], unlocks?: string[], quests?: string[] }` — note `xp` takes an `{ amount }` wrapper (applied via `stats.delta` + your level-up loop) and each reward `item` names the `inventory` it fills; chained `quests` are auto-offered if acceptable. Events: `quest.accepted` / `quest.updated` / `quest.completed`. `partyShare: { radius, credit: "all" | "tagger" }` extends kill credit to nearby party members.

## Social

```ts
ctx.game.social.friends.canRequest / request / accept / decline / remove / block / list / requestsFor   // persisted
ctx.game.social.party.register({ maxMembers })   // then canInvite / invite / accept / decline / kick / leave / promote / list / membersOf / invitesFor
ctx.game.social.presence.get(userId)             // { online, serverId?, zoneId?, instanceId? }
ctx.game.social.emotes.play(fromUserId, emoteId, radius?)   // → { from, emoteId, at, recipients } | { reason }
ctx.game.social.worldInvites.invite(fromUserId, toUserId, { serverId, joinCode? })   // then canInvite / accept / decline / listFor
```

Party is ephemeral session state (invites expire; leader leaving promotes the next member). Events: `social.friend.added`, `social.party.joined`, `social.party.left`.

**World invites** bridge friends and `multiplayer/matchmaking`: an invite carries the `{ serverId, joinCode? }` of the session you're in (the same fields as a `SessionListing`); `accept(userId, inviteId)` → `{ target }` is the join target you hand to your backend's `joinServer`/`joinByCode` — the invite never joins anything itself. Invites are ephemeral like party invites (TTL via `SocialDeps.worldInviteTtlMs`, default 60s; blocked users can't invite either direction). Events: `social.world.invited`, `social.world.accepted`. React: `useWorldInvites()` lists pending invites for the local player.

`emotes.play` reuses `scene.entity.inRadius` to find nearby **player**-role entities (default radius 20) and emits `emote.played` — never build a parallel proximity broadcast. Emote ids are game-defined strings (no registration, same convention as effect ids). Bind it into the existing feed primitive for a HUD feed: `ctx.game.feed.bind("emote.played")` + `useFeed({ action: "emote.played" })` — no dedicated emote hook exists or is needed.

## Chat

```ts
ctx.game.chat.send(fromUserId, channelId, body)      // → { message, recipients } | { reason }
ctx.game.chat.whisper(fromUserId, toUserId, body)    // stable per-pair channel "whisper:<a>:<b>"
ctx.game.chat.history(channelId, { limit?, viewerUserId? })   // viewer filter drops blocked senders
ctx.game.chat.register({ id, kind, radius?, historyLimit?, rateLimit? })   // custom channels
ctx.game.chat.channels() / snapshot() / hydrate(data)
```

Built-in channels: `global` (everyone), `party` (reuses `social.party.membersOf`; rejects "not in a party"), `proximity` (reuses the same spatial/entity seam as emotes, default radius 20, **player**-role entities only). `kind` picks the recipient resolution; custom channels pick one of the three kinds. Sends are trimmed, capped (500 chars), and rate-limited per user per channel (default 10/10s, sliding window — `createChatRateLimiter` is the reusable pure primitive). Mute rides social's blocked set: blocked pairs can't whisper, and blocked senders are dropped from party/proximity recipients and from `history` when `viewerUserId` is passed. Every send emits `chat.message` (recipients omitted = broadcast). History is a bounded ring per channel (default 100) with `snapshot`/`hydrate` like `Friends`.

**Remote chat seam** (`multiplayer/chatContract`): `ChatTransport` is the hook-shaped contract (`useMessages(channelId | "skip")` / `useActions()`, identity-stable like `PresenceTransport`); `ChatSync` is the callback shape for backends that can't host React hooks. Bindings: ws — `createWsBackend(...).chatSync` / `.chatSyncFor(serverId)` over `chatSend` frames + a `chat` update channel (host relays per-channel rings, validates length + rate limit); Convex — `@jgengine/convex/convexChatTransport` `createConvexChatTransport({ messages, sendMessage })` (one live query + one mutation); local/dev — `createLocalChatTransport()`. React lifts a `ChatSync` via `chatTransportFromSync`.

## Cosmetic loadout

Opt-in: `defineGame({ features: { cosmetics: true } })` — else `ctx.player.cosmetics` is `undefined`.

```ts
ctx.player.cosmetics.register(defs)                       // onInit — Record<loadoutId, { slots: Record<slot, cosmeticId> }>
ctx.player.cosmetics.apply(userId, loadoutId)              // merges the preset's slots
ctx.player.cosmetics.equip(userId, slot, cosmeticId | null)  // set/clear one slot directly
ctx.player.cosmetics.get(userId)                          // Record<slot, cosmeticId>
```

A per-player appearance layer distinct from `applyLoadout` (which grants inventory/stats/economy/unlocks) — cosmetics never touch gameplay state, only equipped slot ids for your renderer to read. Emits `cosmetics.changed`.

## Possession

```ts
ctx.player.possession.own(userId, entityId) / disown / owns / listOwned(userId)
ctx.player.possession.active(userId)                      // → entityId, defaults to userId itself
ctx.player.possession.possess(userId, entityId)            // → null | { reason } — must be owned + spawned
```

A player can own N scene entities (party members, vehicles, a possessed creature) and control exactly one at a time — distinct from `game.social.party`, which is a social grouping, not a control model. `possess` flips the previous/next entity's scene `EntityRole` between `"player"`/`"npc"` and emits `possession.swapped`; `@jgengine/shell`'s `GamePlayerShell` reads `active(userId)` every frame to rebind WASD movement, tab-targeting, hotbar `from`, and the camera rig's `followEntityId` to whichever entity is currently controlled — a game never wires this rebind itself.

## Form / shapeshift

```ts
ctx.scene.entity.form.register(defs)                              // onInit — FormDef[] = { id, movement?, abilities?, model? }
ctx.scene.entity.form.shapeshift(instanceId, formId, durationSeconds?)   // → null | { reason }
ctx.scene.entity.form.active(instanceId)                          // → formId | null
ctx.scene.entity.form.abilities(instanceId)                       // → readonly string[] | null
ctx.scene.entity.form.revert(instanceId)                          // early revert
```

A `form` bundles movement params + an ability-id list + a mesh into one swappable unit (shapeshift/transformation — V Rising bear/wolf/bat, Wukong's boss transformation). `model` reuses the entity's catalog `name` (the same key `entityModels`/`entitySprites` resolve against), so the mesh swap rides the existing render lookup — no parallel mesh field. `durationSeconds` is **game time**: it schedules the automatic revert through `ctx.time.after`, so it obeys pause and fast-forward like everything else on the clock. Emits `form.changed`.

## Events, feed, leaderboard

```ts
ctx.game.events.on(name, handler)      // register in onInit; typed GameEventMap
ctx.game.feed.bind(action)             // pipe an engine event into a ring buffer (default 20)
ctx.game.feed.push(action, entry)      // manual channels (chat, crafting)
ctx.game.feed.recent(action, { limit? })
ctx.game.leaderboard.track({ stat, scope: "global" | "server" | "profile" })   // onInit
ctx.game.leaderboard.increment(userId, stat, { scope, by? }) / getTop / getProfile
```

### Toasts — a self-expiring message queue

`@jgengine/core/game/toasts` (`toast-feed` capability) is a capped, TTL-evicting queue for transient one-off HUD messages — the append-with-limit-plus-prune list every game hand-rolls under a local `Toast`/`pushToast`/expiry reimplementation. Reach for it instead of `ctx.game.feed` when the message is a game-raised announcement with its own lifetime (a boss-intro banner, an objective callout, a rate-limited warning), not a log of an engine event that already has a feed binding (kill feed, loot log, quest updates — those stay on `ctx.game.feed.bind(action)`).

```ts
const queue = createToastQueue({ cap: 4, ttlSeconds: 3 });   // @jgengine/core/game/toasts
queue.push("The clock begins. Mind the count.", ctx.time.now());
queue.prune(ctx.time.now());                                 // call once per tick alongside your other tickers
queue.list();                                                 // oldest-first, feed straight to a HUD stack
```

`appendToast(toasts, toast, cap)` / `pruneToasts(toasts, now)` are the pure functions behind `createToastQueue` — reach for them directly only when the queue's state must live in an existing reducer/snapshot instead of its own instance. React rendering: `@jgengine/react`'s `ToastStack` renders `ctx.game.feed` entries, not this queue — pair a `createToastQueue` with your own list render (`queue.list().map(...)`) or a `useSyncExternalStore` wrapper, the same pattern `useFeed` uses over the feed ring buffer.

`ctx.game.commands.define(name, { validate?(ctx, input), apply(ctx, input) })` registers a verb (`has`/`names`/`run` round it out); `run(name, input)` returns `{ status: "applied", state } | { status: "rejected", reason } | { status: "unknown-command" }`. `apply` may either **return** the next state (the classic reducer shape) or mutate `ctx` in place and return **nothing** — `run` keeps the current `ctx` as `state` when `apply` returns `void`, so a handler that only calls other `ctx` methods (spawn, effect, loot.grantToPlayer, …) doesn't need a pointless `return ctx`. **Event handlers use `ctx` directly** the same way (side effects: leaderboard, economy, scheduling) and never reassign state. One feed primitive for kill feeds, loot logs, quest updates — no per-domain feed hooks.

**Start/restart is a declarative `lifecycle`, never a hand-rolled command pair.** Every genre repeats the same shape — pull the run state out of the store, transition it, re-derive `GamePhase`, write it back — so `defineGame` owns it: pass `lifecycle` and the runtime registers the `start`/`restart` commands itself.

```ts
export const lifecycle: LifecycleConfig<RunState> = {
  store: runStore,                                    // the StoreHandle holding this game's run state
  start(state, ctx, input) { return beginRun(state); },   // pure transition; input is whatever "start" was run with
  restart(state, ctx) { return createInitialRunState(); }, // same shape, skips the menu
  phaseOf: (state) => (state.phase === "playing" ? "playing" : state.phase === "menu" ? "menu" : "ended"),
  commands: { start: "startHeist" },                  // optional — default names are "start"/"restart"
};

defineGame({ ..., lifecycle });
```

`start`/`restart` receive the store's own `TState` — never `ctx.game.store.get(key) as T` — and return the next value; the runtime writes it back and calls `setGamePhase(ctx, phaseOf(next))` in one place, so every adopting game gets identical phase-sync for free. Take a `ctx` inside `start`/`restart` for side effects beyond the one store slot (reset a second store, re-pose the player, replant world dressing) the same way the pure transition functions already do. Skip `lifecycle` only when start/restart genuinely isn't a store transition (e.g. a full scene rebuild) — keep hand-rolling `commands.define("start"/"restart")` there.

**`phaseOf` is also the per-tick phase source — never hand-write a `syncPhase` ternary in `onTick`.** The runtime re-derives `phaseOf(lifecycle.store.read(ctx))` after every `onInit`/`onNewPlayer`/`onTick` (not only on `start`/`restart`), publishing it only when it changed. So a mid-run transition your `onTick` writes into the run store — a crash, a timeout, a finish — reaches `GamePhase` (and the touch-control gate) on its own. Games that once kept a private `syncPhase(ctx, state.phase === … ? …)` helper plus a previous-phase diff (#670) delete both: define `lifecycle` and write the store, nothing else.

## `ctx.game.store` — reactive game state

**Default to a typed handle: `defineStore` (`@jgengine/core/store/defineStore`) + `useStore` (`@jgengine/react/store`).** One handle per key, one type parameter, no `as T` at any call site — the blessed way to hold run state. Never re-author a per-game `store.get(KEY) as T` accessor or a byte-identical `useGameStore(... as T)` hook, and never fork run state into a module-level singleton read via `useSyncExternalStore` (that state escapes replay/host authority).

```ts
export const runStore = defineStore<RunState>("run", () => createInitialRunState());

runStore.read(ctx)                         // value, or the initial before any write (no cast, no undefined)
runStore.peek(ctx)                         // T | undefined — distinguishes "never written"
runStore.write(ctx, next)                  // bumps ctx.version(), notifies ctx.subscribe
runStore.update(ctx, (r) => ({ ...r }))
const run = useStore(runStore)             // React; useStore(runStore, (r) => r.status) for a slice
```

A factory initial runs at most once and is reused, so an unwritten slot keeps a stable identity. The raw keyed store (`ObservableKeyedStore<unknown>`, below) sits under `defineStore`; reach past the handle only for one-off ad-hoc scratch state where `get` returns `unknown` and you cast at the call site — the smell `defineStore` removes.

```ts
ctx.game.store.set("health", 100)      // any key, any value type
ctx.game.store.get("health")           // unknown
ctx.game.store.has("health") / delete("health") / subscribe(listener) / mapSnapshot() / arraySnapshot()
```

**Per-owner keyed state (per-user, per-instance) is `defineKeyedStore` (`@jgengine/core/store/defineKeyedStore`) + `useKeyedStore` (`@jgengine/react/store`)** — the sibling for when the owning id varies at runtime and one fixed `defineStore` key can't express it. Never hand-roll a `` `prefix:${id}` `` accessor module casting `store.get(key) as T` per family.

```ts
export const heroClass = defineKeyedStore<string>((userId) => `class:${userId}`, "none");

heroClass.read(ctx, userId)                // value, or the initial before any write for this userId
heroClass.peek(ctx, userId)                // T | undefined — distinguishes "never written"
heroClass.write(ctx, userId, "mage")       // bumps ctx.version(), notifies ctx.subscribe
heroClass.update(ctx, userId, (c) => c)
heroClass.keyFor(userId)                   // the composed store key, for snapshot/debug tooling
const cls = useKeyedStore(heroClass, userId)   // React; useKeyedStore(handle, userId, (c) => c.length) for a slice
```

A factory initial runs at most once **per id** and is reused, so an unwritten id's slot keeps a stable identity. Reach for `defineStore` for a single fixed slot; reach for `defineKeyedStore` the moment the key depends on an id you don't know until runtime.

## `ctx.game.cards` / `ctx.game.turn` — lazily-created piles and turn loops

`ctx.game.cards.pile(id, config?)` and `ctx.game.turn.loop(id, config?)` lazily create (config required on first call) or return the existing notify-wrapped `CardPile`/`TurnLoop` for `id` — call with just the id after the first `onInit` seed to fetch the same instance; every mutating method is wrapped so it bumps `ctx.version()`/notifies `ctx.subscribe` automatically, same as every other `ctx` surface. This replaces manually constructing `createCardPile`/`createTurnLoop` and wiring notification yourself.

## Movement, pose, input
## Turn-based & tactics (renderer-free)

Pure-`core` primitives for turn-based, grid-tactics, and card games — every one is a stateful factory with matching pure math, and every stateful piece exposes `capture()`/`restore()` so it plugs straight into the snapshot store. Overlays and tile art are the shell's/game's job; these ship the logic.

- **`turn/turnLoop` — `createTurnLoop(config)`.** An initiative machine over an ordered participant list with optional `phases` and per-turn action-economy `pools`. `advanceTurn()` walks the order (round++ on wrap) and **resets the entering participant's pools**; `advancePhase()` steps phases then rolls into the next turn. Pools are catalog data (`{ id, max, start? }`) — a single Slay-the-Spire energy pool or BG3's Action/Bonus/Movement/Reaction set, spent independently via `spend/canSpend/gain/refill`. `setOrder`/`addParticipant`/`removeParticipant` re-roll initiative without losing the active pointer. `config.onTurnStart?(participantId)`/`onTurnEnd?(participantId)` fire on every `advanceTurn()` transition (start also fires once for the initial participant at construction) — hang status-effect ticks, "your turn" banners, or AI-turn kickoff here instead of diffing `state()` between ticks yourself. `ctx.game.turn.loop(id, config?)` is the runtime-wired accessor: lazily creates (config required the first call) or returns the existing notify-wrapped loop for `id`, so a HUD bound to `ctx.subscribe` re-renders on every turn/phase/pool change with no separate store to wire.
- **`turn/commit` — `createCommitController({ mode })`**, also hosted at `turnLoop.commit`. Three commit modes: `immediate` (submit resolves now), `simultaneous` (sealed hidden submissions → `reveal()` once `allReady()`, deterministic order — Marvel Snap), and `rewind` (visible `pending()` → `rewind()` to discard or `commit()` to finalize).
- **`turn/intent` — `createIntentBoard()`.** A minimal per-participant "what will you do" board, lighter than a full commit round: `declare(participantId, { kind, magnitude?, targetId?, note? })` records one intent per participant (overwriting any prior undeclared one), `peek(participantId)` reads without clearing, `all()` lists every declared `[participantId, intent]` pair (for an enemy-intent HUD row, Slay-the-Spire style), `consume(participantId)` reads and clears in one call, `clear(participantId?)` clears one or everyone. Reach for this when you need visible declared-but-not-yet-resolved intents (telegraphed enemy actions) without the full simultaneous-reveal machinery of `turn/commit`.
- **`tactics/tacticalGrid` — `createTacticalGrid({ width, height, blocked?, diagonal?, world? })`.** Tile occupancy (one unit per tile), `reachable(from, budget)` flood-fill (respects walls + occupants), `path(from, to)` shortest route, and `push(id, dir, { distance, chain })` discrete knockback-to-tile — chained collisions transfer momentum through struck units (Into the Breach), or stop with a recorded `PushCollision` against `wall`/`edge`/another unit. `world: { origin: [x, z], tileSize }` (mirroring `navGrid`'s bounds+cellSize convention) turns on `worldToTile(x, z)` (world point → `Tile | null`, null outside the grid) and `tileToWorld(tile)` (a tile's world-space center) — the render/pointer-hit round trip between the tactics grid and the 3D scene; omit `world` for a grid used purely as abstract logic (both throw if called without it).
- **`tactics/predictiveQuery` — `predictAreaEffect`/`predictArcEffect`/`predictTiles`.** A "would-this-effect-hit" query for pre-commit overlays and enemy-intent telegraphs. It reuses the **exact** AoE/LoS targeting behind `ctx.scene.entity.effect` (`combat/effects` `resolveAreaTargets`) so the predicted target set matches what the effect would actually drain — without committing any state change.
- **`tactics/snapshot` — `createSnapshotStore()`.** Cheap, repeatable turn-undo: `register(id, slice)` any `capture()/restore()` slice (the grid, surfaces, and turn loop all qualify), then `capture()/restore()` a deep-cloned snapshot or use the `push()/pop()` undo stack. `deepClone` handles objects/arrays/Map/Set so a held snapshot is immune to later mutation.
- **`tactics/surface` — `createSurfaceLayer({ kinds, reactions })`.** A stateful tile surface layer with its own `tick(dt)` (timed surfaces decay + expire) and a **combination matrix** — `reactions` is data (`{ when: [a, b], result }`), so grease+fire→fire and water+lightning→electrified are catalog entries, not hard-coded. Distinct from terrain/water; drive its tick from `onTick`'s game-time `dt`.

## External data — `data/dataSource` and the dev proxy

