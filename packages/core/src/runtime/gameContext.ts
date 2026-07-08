import { createDeathSystem, deathReasonFromEffect, normalizeOnDeath, type OnDeathSpec } from "../combat/death";
import {
  createEffectSystem,
  type CombatSpatialDeps,
  type EffectInput,
  type EffectResult,
  type EffectSystem,
  type EffectVia,
  type ReceiveMap,
  type SingleTargetEffectInput,
} from "../combat/effects";
import { createProjectileSystem, type ProjectileSystem } from "../combat/projectiles";
import {
  resolveHitReaction,
  type HitReaction,
  type HitReactionConfig,
} from "../combat/hitReaction";
import {
  pointInTelegraph,
  type TelegraphConfig,
  type TelegraphShape,
} from "../combat/telegraph";
import {
  createCommandRegistry,
  type CommandDefinition,
  type CommandResult,
} from "../commands/commandRegistry";
import {
  balance as walletBalance,
  canAfford as walletCanAfford,
  charge as walletCharge,
  chargeAll as walletChargeAll,
  createEmptyWallet,
  grant as walletGrant,
  type WalletState,
} from "../economy/wallet";
import { createCosmetics, type Cosmetics } from "../game/cosmetics";
import type { GameDefinition } from "../game/defineGame";
import { createGameEvents, type GameEventMap, type GameEvents } from "../game/events";
import { createGameFeed, type GameFeed } from "../game/feed";
import { createLeaderboard, type Leaderboard } from "../game/leaderboard";
import { createLoadouts, type Loadouts } from "../game/loadout";
import { createLootRegistry, grantDrops, type Drop, type LootTableDef } from "../game/lootTable";
import { createQuestJournal, type QuestJournal } from "../game/quest";
import {
  createWorldItemStore,
  resolveDeathDrops,
  DEFAULT_RARITY,
  WORLD_ITEM_ENTITY_NAME,
  type WorldItemRecord,
  type WorldItemSpawnInput,
} from "../game/worldItem";
import { createSocial, type Social } from "../game/social";
import { createTradeSystem, type TradeField, type TradeSystem } from "../game/trade";
import { createUnlocks, type Unlocks } from "../game/unlocks";
import {
  createInventorySet,
  putItem,
  type InventoryLayout,
  type InventorySet,
  type InventoryState,
  type ItemTraits,
} from "../inventory/inventoryModel";
import type { ContextVerb } from "../interaction/contextMenu";
import type { ProximityPrompt } from "../interaction/proximityPrompt";
import {
  createItemUse,
  type ItemUseHandler,
  type ItemUseInput,
  type ItemUseRejection,
  type ItemUseResult,
} from "../item/use";
import { createWeaponStats, type WeaponStats } from "../item/weapon";
import { createPoseState, type PoseAllowedStates, type PoseState } from "../movement/poseState";
import type { ModelAssetRef } from "../scene/assetCatalog";
import {
  createEntityStatsApi,
  seedStatValues,
  setStatValue,
  type EntityStatsApi,
  type StatCatalog,
  type StatValueMap,
} from "../scene/entityStats";
import type { EntityPose, EntityPosition, SceneEntity, SpawnOptions } from "../scene/entityStore";
import { createForms, type Forms } from "../scene/form";
import { createObjectStore, type ObjectStore } from "../scene/objectStore";
import { createRoster, type Roster } from "../scene/roster";
import { createPossession, type Possession } from "../scene/possession";
import { createSpatialApi, type SpatialApi } from "../scene/spatial";
import { createTargeting, type CycleTargetOptions } from "../scene/targeting";
import { createStats, type Stats } from "../stats/statModifiers";
import { createChangeSignal, notifyAfter } from "../store/changeSignal";
import { createSimClock, type SimClock } from "../time/simClock";

export interface GameContextItemEntry {
  use?: string;
  weapon?: Record<string, unknown>;
  trade?: TradeField;
  /** Rarity id read by the `worldItem` loot-filter/render binding when this item drops to the ground (#32/#33). */
  rarity?: string;
  /** Base item type read by the loot-filter rule evaluator (#33); defaults to the item id when absent. */
  baseType?: string;
}

export type CatalogEntityRole = "player" | "enemy" | "hostile" | "npc" | "vehicle";

export interface GameContextEntityEntry {
  stats?: StatCatalog;
  receive?: ReceiveMap;
  onDeath?: OnDeathSpec;
  movement?: PoseAllowedStates & { walkSpeed?: number };
  role?: CatalogEntityRole;
  /** Right-click context-menu verbs for this entity (#31). */
  verbs?: readonly ContextVerb[];
}

export interface GameContextObjectEntry {
  proximityPrompt?: ProximityPrompt;
  breakable?: false | { baseBreakTime: number };
  slotInventory?: InventoryLayout;
  /** Right-click context-menu verbs for this object (#31). */
  verbs?: readonly ContextVerb[];
}

export interface GameContextContent {
  itemById?(itemId: string): GameContextItemEntry | null | undefined;
  entityById?(catalogId: string): GameContextEntityEntry | null | undefined;
  objectById?(catalogId: string): GameContextObjectEntry | null | undefined;
}

export interface GameContextOptions<
  TAssetRef extends ModelAssetRef = ModelAssetRef,
  TMultiplayer = unknown,
> {
  definition: GameDefinition<TAssetRef, TMultiplayer>;
  content: GameContextContent;
  player: { userId: string; isNew: boolean };
  now?: () => number;
}

export interface SceneObjectContext extends ObjectStore {
  catalog(instanceId: string): GameContextObjectEntry | null;
}

export interface FloatTextInput {
  instanceId?: string;
  position?: [number, number, number];
  text?: string;
  kind?: string;
  amount?: number;
  hitType?: string;
  element?: string;
  crit?: boolean;
  scale?: number;
}

export interface TelegraphInput {
  from: string;
  shape: TelegraphShape;
  at: [number, number, number];
  dir?: number;
  windupMs: number;
  kind?: string;
  effect?: {
    effect: string;
    via?: EffectVia;
    radius?: number;
    falloff?: "linear" | "none";
    los?: boolean;
  };
}

export interface HitReactionInput {
  from: string;
  to: string;
  config: HitReactionConfig;
  power?: number;
}

export interface SceneEntityContext {
  spawn(name: string, options?: SpawnOptions): string;
  despawn(instanceId: string): boolean;
  setPose(instanceId: string, pose: EntityPose): boolean;
  get(instanceId: string): SceneEntity | null;
  list(): readonly SceneEntity[];
  stats: EntityStatsApi;
  floatText(input: FloatTextInput): void;
  telegraph(input: TelegraphInput): () => void;
  hitReaction(input: HitReactionInput): HitReaction | null;
  setTarget(fromId: string, toId: string | null): void;
  getTarget(fromId: string): string | null;
  cycleTarget(fromId: string, options?: CycleTargetOptions): string | null;
  canReceive(instanceId: string, effect: string): string | null;
  preview(input: SingleTargetEffectInput): number;
  effect(input: EffectInput): EffectResult[];
  willHitProjectile: ProjectileSystem["willHitProjectile"];
  fireProjectile: ProjectileSystem["fireProjectile"];
  settleProjectile: ProjectileSystem["settleProjectile"];
  distance: SpatialApi["distance"];
  inRadius: SpatialApi["inRadius"];
  hasLineOfSight: SpatialApi["hasLineOfSight"];
  queryArc: SpatialApi["queryArc"];
  moveToward: SpatialApi["moveToward"];
  form: Forms;
}

export type WorldItemPickupResult =
  | { status: "ok"; record: WorldItemRecord }
  | { status: "rejected"; reason: string };

export interface SceneWorldItemContext {
  spawn(input: WorldItemSpawnInput): WorldItemRecord;
  get(instanceId: string): WorldItemRecord | null;
  list(): readonly WorldItemRecord[];
  nearestInRadius(
    from: EntityPosition,
    radius: number,
    filter?: (record: WorldItemRecord) => boolean,
  ): string | null;
  pickup(instanceId: string, userId: string): WorldItemPickupResult;
}

export interface GameContextCommands {
  define<TInput>(name: string, definition: CommandDefinition<GameContext, TInput>): void;
  has(name: string): boolean;
  names(): string[];
  run(name: string, input: unknown): CommandResult<GameContext>;
}

export interface GameContextFeed extends Omit<GameFeed, "bind"> {
  bind(action: keyof GameEventMap): () => void;
}

export interface GameContextLoot {
  register(def: LootTableDef): void;
  has(id: string): boolean;
  roll(id: string, rng?: () => number): Drop[];
  grantToPlayer(userId: string, drops: Drop[], source?: string): void;
}

export interface GameContextEconomy {
  balance(userId: string, currencyId: string): number;
  grant(userId: string, currencyId: string, amount: number): void;
  charge(userId: string, currencyId: string, amount: number): { reason: string } | null;
}

export interface GameContextItemUse {
  register(handlers: Record<string, ItemUseHandler<GameContext>>): void;
  registered(): string[];
  can(input: ItemUseInput): ItemUseRejection | null;
  use(input: ItemUseInput): ItemUseResult<GameContext>;
}

export interface GameContext {
  scene: {
    object: SceneObjectContext;
    entity: SceneEntityContext;
    worldItem: SceneWorldItemContext;
  };
  game: {
    commands: GameContextCommands;
    events: GameEvents;
    feed: GameContextFeed;
    loot: GameContextLoot;
    trade: TradeSystem;
    quest: QuestJournal;
    social: Social;
    unlocks: Unlocks;
    economy: GameContextEconomy;
    leaderboard: Leaderboard;
    roster: Roster;
  };
  player: {
    userId: string;
    isNew: boolean;
    inventory: InventorySet<string>;
    stats: Stats<string>;
    loadout: Loadouts;
    applyLoadout(userId: string, loadoutId: string): { reason: string } | null;
    movement: PoseState;
    possession: Possession;
    cosmetics: Cosmetics;
  };
  item: {
    use: GameContextItemUse;
    weapon: WeaponStats;
  };
  time: SimClock;
  subscribe(listener: () => void): () => void;
  version(): number;
}

export function createGameContext<TAssetRef extends ModelAssetRef, TMultiplayer>(
  options: GameContextOptions<TAssetRef, TMultiplayer>,
): GameContext {
  const { definition, content, player } = options;
  const now = options.now ?? Date.now;

  const signal = createChangeSignal();
  const time = createSimClock({ config: definition.time, onChange: signal.notify });

  const entities = definition.scene;
  const objects = createObjectStore();
  entities.subscribe(signal.notify);
  objects.subscribe(signal.notify);

  const statsByInstance = new Map<string, StatValueMap>();
  const entityStats = notifyAfter(
    createEntityStatsApi((instanceId) => statsByInstance.get(instanceId)),
    ["set", "delta"],
    signal.notify,
  );

  function ensureInstanceStats(instanceId: string): StatValueMap {
    let map = statsByInstance.get(instanceId);
    if (map === undefined) {
      map = {};
      statsByInstance.set(instanceId, map);
    }
    return map;
  }

  function catalogEntry(instanceId: string): GameContextEntityEntry | null | undefined {
    const entity = entities.get(instanceId);
    return entity === null ? undefined : content.entityById?.(entity.name);
  }

  function catalogObject(instanceId: string): GameContextObjectEntry | null | undefined {
    const object = objects.get(instanceId);
    return object === null ? undefined : content.objectById?.(object.catalogId);
  }

  const spatial = createSpatialApi({
    resolvePosition: (instanceId) => entities.get(instanceId)?.position,
    candidates: () => entities.list().map((entity) => entity.id),
  });
  const targeting = notifyAfter(
    createTargeting({
      candidates: () => entities.list().map((entity) => entity.id),
      classify(_fromId, toId) {
        const role = catalogEntry(toId)?.role;
        return role === "enemy" || role === "hostile" ? "hostile" : "friendly";
      },
      distance: (fromId, toId) => spatial.distance(fromId, toId),
    }),
    ["setTarget", "cycleTarget"],
    signal.notify,
  );
  const combatSpatial: CombatSpatialDeps = {
    inRadius: (center, radius) => spatial.inRadius(center, radius),
    hasLineOfSight: (from, to) =>
      typeof from === "string" ? spatial.hasLineOfSight(from, to) : entities.get(to) !== null,
    positionOf: (instanceId) => entities.get(instanceId)?.position,
  };

  const weapon = createWeaponStats((itemId) => content.itemById?.(itemId));
  const rawEvents = createGameEvents();
  const events: GameEvents = {
    on: rawEvents.on,
    subscribe: rawEvents.subscribe,
    emit(name, payload) {
      rawEvents.emit(name, payload);
      signal.notify();
    },
  };
  const feed = createGameFeed();
  const lootRegistry = createLootRegistry();
  const unlocks = notifyAfter(createUnlocks(), ["grant", "hydrate"], signal.notify);
  const rawSocial = createSocial({
    events,
    now,
    emotes: {
      entities: { get: (id) => entities.get(id) },
      spatial: { inRadius: (center, radius, filter) => spatial.inRadius(center, radius, filter) },
    },
  });
  const social: Social = {
    friends: notifyAfter(
      rawSocial.friends,
      ["request", "accept", "remove", "block", "hydrate"],
      signal.notify,
    ),
    party: notifyAfter(
      rawSocial.party,
      ["invite", "accept", "kick", "leave", "promote"],
      signal.notify,
    ),
    presence: rawSocial.presence,
    emotes: rawSocial.emotes,
    worldInvites: notifyAfter(
      rawSocial.worldInvites,
      ["invite", "accept", "decline"],
      signal.notify,
    ),
  };
  const leaderboard = notifyAfter(createLeaderboard(), ["increment", "hydrate"], signal.notify);
  const roster = notifyAfter(
    createRoster({ now }),
    ["capture", "release", "setEquipped", "hydrate"],
    signal.notify,
  );
  const playerStats = createStats<string>({});
  const pose = createPoseState((instanceId) => catalogEntry(instanceId)?.movement);
  const commandRegistry = createCommandRegistry<GameContext>();
  const itemUse = createItemUse<GameContext>((itemId) => content.itemById?.(itemId)?.use);
  const possession = notifyAfter(createPossession({ entities, events }), ["possess", "own", "disown"], signal.notify);
  const forms = notifyAfter(createForms({ entities, time, events }), ["shapeshift", "revert"], signal.notify);
  const cosmetics = notifyAfter(createCosmetics({ events }), ["apply", "equip", "hydrate"], signal.notify);

  const inventoryDeclarations = definition.inventories ?? {};
  const inventoryIds = Object.keys(inventoryDeclarations);
  const layouts: Record<string, InventoryLayout> = {};
  for (const [inventoryId, declaration] of Object.entries(inventoryDeclarations)) {
    layouts[inventoryId] = { slots: declaration.slots, accepts: declaration.accepts };
  }
  const traits: ItemTraits = Object.values(inventoryDeclarations).find(
    (declaration) => declaration.traits !== undefined,
  )?.traits ?? { stackLimit: () => Number.POSITIVE_INFINITY };
  const inventory = notifyAfter(
    createInventorySet(layouts, traits),
    ["put", "take", "move", "replaceState"],
    signal.notify,
  );

  const wallets = new Map<string, WalletState>();
  const walletOf = (userId: string) => wallets.get(userId) ?? createEmptyWallet();
  const economy: GameContextEconomy = {
    balance: (userId, currencyId) => walletBalance(walletOf(userId), currencyId),
    grant(userId, currencyId, amount) {
      wallets.set(userId, walletGrant(walletOf(userId), currencyId, amount));
      signal.notify();
    },
    charge(userId, currencyId, amount) {
      const result = walletCharge(walletOf(userId), currencyId, amount);
      if (result.status === "rejected") return { reason: result.reason };
      wallets.set(userId, result.state);
      signal.notify();
      return null;
    },
  };

  function putIntoAnyInventory(itemId: string, count: number): void {
    for (const inventoryId of inventoryIds) {
      if (inventory.put(inventoryId, itemId, count).status === "ok") return;
    }
  }

  const loot: GameContextLoot = {
    register: lootRegistry.register,
    has: lootRegistry.has,
    roll: lootRegistry.roll,
    grantToPlayer(userId, drops, source) {
      grantDrops(drops, {
        putItem: (itemId, count) => putIntoAnyInventory(itemId, count),
        grantCurrency: (currencyId, amount) => economy.grant(userId, currencyId, amount),
      });
      const event: GameEventMap["loot.granted"] = { userId, drops };
      if (source !== undefined) event.source = source;
      events.emit("loot.granted", event);
    },
  };

  const trade = createTradeSystem({
    resolveTrade: (itemId) => content.itemById?.(itemId)?.trade,
    wallet: {
      canAfford: (costs) => (walletCanAfford(walletOf(player.userId), costs) ? null : "insufficient-funds"),
      charge(costs) {
        const result = walletChargeAll(walletOf(player.userId), costs);
        if (result.status === "ok") {
          wallets.set(player.userId, result.state);
          signal.notify();
        }
      },
      grant(gains) {
        for (const [currencyId, amount] of Object.entries(gains)) {
          economy.grant(player.userId, currencyId, amount);
        }
      },
    },
    inventory: {
      put(inventoryId, itemId, count) {
        if (layouts[inventoryId] === undefined) return { reason: `unknown inventory "${inventoryId}"` };
        const result = inventory.put(inventoryId, itemId, count);
        return result.status === "ok" ? null : { reason: result.reason };
      },
      take(inventoryId, itemId, count) {
        if (layouts[inventoryId] === undefined) return { reason: `unknown inventory "${inventoryId}"` };
        const result = inventory.take(inventoryId, itemId, count);
        return result.status === "ok" ? null : { reason: result.reason };
      },
      count: (inventoryId, itemId) => inventory.count(inventoryId, itemId),
    },
  });

  function seedUserPool(
    userId: string,
    statId: string,
    pool: { current: number; max?: number; min?: number },
  ): void {
    const map = ensureInstanceStats(userId);
    const next = setStatValue(map, statId, pool);
    map[statId] = next[statId]!;
  }

  const rawQuest = createQuestJournal({
    events,
    rewards: {
      grantXp(userId, amount) {
        const existing = ensureInstanceStats(userId)["xp"];
        const current = (existing?.current ?? 0) + amount;
        seedUserPool(userId, "xp", { current, max: Math.max(existing?.max ?? 0, current) });
      },
      grantEconomy: (userId, currencyId, amount) => economy.grant(userId, currencyId, amount),
      grantItem(userId, inventoryId, itemId, count) {
        if (userId !== player.userId) return { reason: `unknown user "${userId}"` };
        if (layouts[inventoryId] === undefined) return { reason: `unknown inventory "${inventoryId}"` };
        const result = inventory.put(inventoryId, itemId, count);
        return result.status === "ok" ? null : { reason: result.reason };
      },
      grantUnlock: (userId, unlockId) => unlocks.grant(userId, unlockId),
    },
    hasUnlock: (userId, id) => unlocks.has(userId, id),
  });
  const quest = notifyAfter(
    rawQuest,
    ["accept", "abandon", "progress", "turnIn", "grant", "revoke", "hydrate"],
    signal.notify,
  );

  const loadouts = notifyAfter(
    createLoadouts({
    inventory: {
      begin() {
        const staged = new Map<string, InventoryState>();
        return {
          put(inventoryId, itemId, count, slot) {
            const layout = layouts[inventoryId];
            if (layout === undefined) return { reason: `unknown inventory "${inventoryId}"` };
            const state = staged.get(inventoryId) ?? inventory.state(inventoryId);
            const result = putItem(state, layout, traits, itemId, count, slot === undefined ? undefined : { slot });
            if (result.status === "rejected") return { reason: result.reason };
            staged.set(inventoryId, result.state);
            return null;
          },
          commit() {
            for (const [inventoryId, state] of staged) inventory.replaceState(inventoryId, state);
          },
        };
      },
    },
      stats: { seed: seedUserPool },
      economy: { grant: economy.grant },
      unlocks: { grant: unlocks.grant },
    }),
    ["applyLoadout"],
    signal.notify,
  );

  function spawnEntity(name: string, spawnOptions?: SpawnOptions): string {
    const entry = content.entityById?.(name);
    const walkSpeed = spawnOptions?.movement?.walkSpeed ?? entry?.movement?.walkSpeed;
    const options =
      walkSpeed === undefined
        ? spawnOptions
        : { ...spawnOptions, movement: { ...spawnOptions?.movement, walkSpeed } };
    const instanceId = entities.spawn(name, options);
    death.revive(instanceId);
    statsByInstance.set(instanceId, entry?.stats === undefined ? {} : seedStatValues(entry.stats));
    return instanceId;
  }

  function despawnEntity(instanceId: string): boolean {
    const existed = entities.despawn(instanceId);
    statsByInstance.delete(instanceId);
    targeting.clearAll(instanceId);
    pose.clear(instanceId);
    return existed;
  }

  const worldItems = notifyAfter(
    createWorldItemStore({
      spawnEntity: (position) => entities.spawn(WORLD_ITEM_ENTITY_NAME, { position, role: "prop" }),
      despawnEntity,
      resolvePosition: (instanceId) => entities.get(instanceId)?.position,
    }),
    ["spawn", "take"],
    signal.notify,
  );

  function spawnWorldItem(input: WorldItemSpawnInput): WorldItemRecord {
    const record = worldItems.spawn(input);
    events.emit("worldItem.dropped", {
      instanceId: record.instanceId,
      itemId: record.itemId,
      rarity: record.rarity,
      count: record.count,
      position: [input.position[0], input.position[1], input.position[2]],
      ...(record.source !== undefined ? { source: record.source } : {}),
    });
    return record;
  }

  function pickupWorldItem(instanceId: string, userId: string): WorldItemPickupResult {
    const record = worldItems.take(instanceId);
    if (record === null) return { status: "rejected", reason: "not-found" };
    loot.grantToPlayer(userId, [{ item: record.itemId, count: record.count }], "worldItem.pickup");
    events.emit("worldItem.picked_up", {
      instanceId,
      userId,
      itemId: record.itemId,
      rarity: record.rarity,
      count: record.count,
    });
    return { status: "ok", record };
  }

  const death = createDeathSystem({
    resolveOnDeath: (instanceId) => catalogEntry(instanceId)?.onDeath,
    resolveIdentity(instanceId) {
      const entity = entities.get(instanceId);
      if (entity === null) return null;
      return {
        catalogId: entity.name,
        position: [entity.position[0], entity.position[1], entity.position[2]],
      };
    },
    loot: { roll: (tableId) => (lootRegistry.has(tableId) ? lootRegistry.roll(tableId) : []) },
    events,
    runCommand(name, args) {
      commandRegistry.run(ctx, name, args);
    },
    despawn(instanceId) {
      despawnEntity(instanceId);
    },
  });

  const effects = notifyAfter(
    createEffectSystem({
    resolveReceive: (instanceId) => catalogEntry(instanceId)?.receive,
    resolveStats: (instanceId) => statsByInstance.get(instanceId),
    getStat: weapon.getStat,
    spatial: combatSpatial,
      onLethal(instanceId, lethalCtx) {
        const dyingEntity = entities.get(instanceId);
        const catalogId = dyingEntity?.name;
        const position = dyingEntity?.position;
        const normalizedOnDeath = normalizeOnDeath(catalogEntry(instanceId)?.onDeath);
        const reason = deathReasonFromEffect({
          ...lethalCtx,
          userIdOf: (id) => (id === player.userId ? player.userId : undefined),
        });
        const resolution = death.resolveDeath(instanceId, reason);
        if (
          resolution.status === "resolved" &&
          resolution.drops.length > 0 &&
          reason.kind === "player_kill" &&
          reason.killerUserId === player.userId
        ) {
          if (normalizedOnDeath.dropMode === "world" && position !== undefined) {
            const resolved = resolveDeathDrops(resolution.drops, {
              mode: "world",
              origin: position,
              resolveRarity: (itemId) => content.itemById?.(itemId)?.rarity ?? DEFAULT_RARITY,
              resolveBaseType: (itemId) => content.itemById?.(itemId)?.baseType ?? itemId,
              scatter: normalizedOnDeath.scatter,
              ...(catalogId !== undefined ? { source: catalogId } : {}),
            });
            for (const spawn of resolved.worldSpawns) spawnWorldItem(spawn);
            if (resolved.grants.length > 0) loot.grantToPlayer(player.userId, resolved.grants, catalogId);
          } else {
            loot.grantToPlayer(player.userId, resolution.drops, catalogId);
          }
        }
      },
    }),
    ["applyEffect"],
    signal.notify,
  );

  function emitFloatText(input: FloatTextInput): void {
    const position =
      input.position ??
      (input.instanceId === undefined ? undefined : entities.get(input.instanceId)?.position);
    if (position === undefined) return;
    const text = input.text ?? (input.amount === undefined ? "" : String(Math.round(input.amount)));
    const event: GameEventMap["entity.floatText"] = {
      position: [position[0], position[1], position[2]],
      text,
      kind: input.kind ?? "info",
    };
    if (input.instanceId !== undefined) event.instanceId = input.instanceId;
    if (input.amount !== undefined) event.amount = input.amount;
    if (input.hitType !== undefined) event.hitType = input.hitType;
    if (input.element !== undefined) event.element = input.element;
    if (input.crit !== undefined) event.crit = input.crit;
    if (input.scale !== undefined) event.scale = input.scale;
    events.emit("entity.floatText", event);
  }

  let telegraphSeq = 0;

  function fireTelegraph(input: TelegraphInput): () => void {
    const id = telegraphSeq++;
    const telegraphEvent: GameEventMap["combat.telegraph"] = {
      id,
      shape: input.shape,
      position: [input.at[0], input.at[1], input.at[2]],
      windupMs: input.windupMs,
      kind: input.kind ?? "danger",
    };
    if (input.dir !== undefined) telegraphEvent.dir = input.dir;
    events.emit("combat.telegraph", telegraphEvent);
    const bound = input.effect;
    if (bound === undefined) return () => {};
    const config: TelegraphConfig = { shape: input.shape, at: input.at, windupMs: input.windupMs };
    if (input.dir !== undefined) config.dir = input.dir;
    return time.after(input.windupMs / 1000, () => {
      const targets = entities.list().filter((entity) => pointInTelegraph(config, entity.position));
      for (const target of targets) {
        applyEffectAndFloat({
          from: input.from,
          to: target.id,
          effect: bound.effect,
          ...(bound.via === undefined ? {} : { via: bound.via }),
        });
      }
    });
  }

  function applyHitReaction(input: HitReactionInput): HitReaction | null {
    const attacker = entities.get(input.from);
    const target = entities.get(input.to);
    if (target === null) return null;
    const attackerPos = attacker?.position ?? target.position;
    const reaction = resolveHitReaction(input.config, {
      attackerPos,
      targetPos: target.position,
      ...(input.power === undefined ? {} : { power: input.power }),
    });
    entities.setPose(input.to, {
      position: [
        target.position[0] + reaction.impulse[0],
        target.position[1] + reaction.impulse[1],
        target.position[2] + reaction.impulse[2],
      ],
      rotationY: target.rotationY,
    });
    const reactionEvent: GameEventMap["combat.hitReaction"] = {
      instanceId: input.to,
      position: [target.position[0], target.position[1], target.position[2]],
      hitstopMs: reaction.hitstopMs,
    };
    if (reaction.shake !== null) reactionEvent.shake = reaction.shake;
    events.emit("combat.hitReaction", reactionEvent);
    return reaction;
  }

  function applyEffectAndFloat(input: EffectInput): EffectResult[] {
    const positionsBefore = new Map<string, EntityPosition>();
    for (const entity of entities.list()) positionsBefore.set(entity.id, entity.position);
    const results = effects.applyEffect(input);
    for (const result of results) {
      let total = 0;
      for (const delta of result.applied) total += delta.delta;
      if (total === 0) continue;
      const position = entities.get(result.instanceId)?.position ?? positionsBefore.get(result.instanceId);
      if (position === undefined) continue;
      const magnitude = Math.abs(total);
      emitFloatText({
        instanceId: result.instanceId,
        position: [position[0], position[1], position[2]],
        text: String(Math.round(magnitude)),
        kind: total < 0 ? "damage" : "heal",
        amount: magnitude,
      });
    }
    return results;
  }

  const floatingEffects: EffectSystem = {
    canReceive: effects.canReceive,
    preview: effects.preview,
    applyEffect: applyEffectAndFloat,
  };

  const projectiles = notifyAfter(
    createProjectileSystem({
      effects: floatingEffects,
      spatial: combatSpatial,
      getStat: weapon.getStat,
      now,
      onSettle(report) {
        events.emit("projectile.settled", {
          from: report.from,
          origin: [report.origin[0], report.origin[1], report.origin[2]],
          at: [report.at[0], report.at[1], report.at[2]],
          effect: report.effect,
          hit: report.hit,
        });
      },
    }),
    ["fireProjectile", "settleProjectile"],
    signal.notify,
  );

  const sceneObjects: SceneObjectContext = {
    ...objects,
    catalog: (instanceId) => catalogObject(instanceId) ?? null,
  };

  const ctx: GameContext = {
    scene: {
      object: sceneObjects,
      entity: {
        spawn: spawnEntity,
        despawn: despawnEntity,
        setPose: entities.setPose,
        get: entities.get,
        list: entities.list,
        stats: entityStats,
        floatText: emitFloatText,
        telegraph: fireTelegraph,
        hitReaction: applyHitReaction,
        setTarget: targeting.setTarget,
        getTarget: targeting.getTarget,
        cycleTarget: targeting.cycleTarget,
        canReceive: effects.canReceive,
        preview: effects.preview,
        effect: applyEffectAndFloat,
        willHitProjectile: projectiles.willHitProjectile,
        fireProjectile: projectiles.fireProjectile,
        settleProjectile: projectiles.settleProjectile,
        distance: spatial.distance,
        inRadius: spatial.inRadius,
        hasLineOfSight: spatial.hasLineOfSight,
        queryArc: spatial.queryArc,
        moveToward: spatial.moveToward,
        form: forms,
      },
      worldItem: {
        spawn: spawnWorldItem,
        get: worldItems.get,
        list: worldItems.list,
        nearestInRadius: worldItems.nearestInRadius,
        pickup: pickupWorldItem,
      },
    },
    game: {
      commands: {
        define: commandRegistry.define,
        has: commandRegistry.has,
        names: commandRegistry.names,
        run(name, input) {
          const result = commandRegistry.run(ctx, name, input);
          signal.notify();
          return result;
        },
      },
      events,
      feed: {
        bind: (action) => feed.bind(action, events),
        push(action, entry) {
          feed.push(action, entry);
          signal.notify();
        },
        recent: feed.recent,
        subscribe: feed.subscribe,
        snapshot: feed.snapshot,
        hydrate(data) {
          feed.hydrate(data);
          signal.notify();
        },
      },
      loot,
      trade,
      quest,
      social,
      unlocks,
      economy,
      leaderboard,
      roster,
    },
    player: {
      userId: player.userId,
      isNew: player.isNew,
      inventory,
      stats: playerStats,
      loadout: loadouts,
      applyLoadout: loadouts.applyLoadout,
      movement: pose,
      possession,
      cosmetics,
    },
    item: {
      use: {
        register: itemUse.register,
        registered: itemUse.registered,
        can: (input) => itemUse.can(ctx, input),
        use(input) {
          const result = itemUse.use(ctx, input);
          signal.notify();
          return result;
        },
      },
      weapon,
    },
    time,
    subscribe: signal.subscribe,
    version: signal.version,
  };

  return ctx;
}
