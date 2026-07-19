import { createCommandRegistry } from "../commands/commandRegistry";
import { type Cosmetics } from "../game/cosmetics";
import type { GameDefinition, GameFeatures, PersistConfig } from "../game/defineGame";
import { groundFieldFor } from "../world/terrain";
import { createGameEvents, type GameEventMap, type GameEvents } from "../game/events";
import { createGameFeed } from "../game/feed";
import { setGamePhase } from "../game/gamePhase";
import { createLootRegistry, grantDrops } from "../game/lootTable";
import { createSocial, type Social } from "../game/social";
import { splitStack } from "../inventory/inventoryModel";
import { createItemUse } from "../item/use";
import { createWeaponStats } from "../item/weapon";
import type { ModelAssetRef } from "../scene/assetCatalog";
import { type StatValueMap } from "../scene/entityStats";
import { type SceneEntity } from "../scene/entityStore";
import { createChangeSignal, notifyAfter } from "../store/changeSignal";
import { createObservableKeyedStore } from "../store/observableKeyedStore";
import {
  applyWorldSnapshot,
  composeWorldSnapshot,
  type SnapshotModule,
  type SnapshotViewer,
  type WorldSnapshot,
} from "./worldSnapshot";
import {
  policyProjectsViewers,
  projectByVisibleIds,
  projectEntitiesForViewer,
  projectPerUserForViewer,
  visibleEntityIds,
} from "./worldProjection";
import { createRuntimeSave, type RuntimeSaveOptions, type RuntimeSaveTarget } from "./runtimeSave";
import { isOffline } from "./adapter";
import { localSaveBackend, memorySaveBackend } from "../game/saveStore";
import { createSimClock } from "../time/simClock";
import { createCameraDirector } from "./cameraDirector";
import { createInputSnapshot } from "./inputSnapshot";
import { baselineDescriptors, type BaselineDeps } from "./descriptors/baseline";
import { featureDescriptors, type FeatureDeps } from "./descriptors/features";
import { createCombatSubsystem } from "./context/combat";
import { createContextRegistries } from "./context/registries";
import { createPlayerSubsystem } from "./context/player";
import { createSceneSubsystem } from "./context/scene";
import { createWorldItemContext } from "./context/worldItems";
import type { GameContext, GameContextLoot, GameContextOptions } from "./gameContextTypes";

export type {
  CatalogEntityRole,
  FloatTextInput,
  GameAudio,
  GameContext,
  GameContextCards,
  GameContextCommands,
  GameContextContent,
  GameContextEconomy,
  GameContextEntityEntry,
  GameContextFeed,
  GameContextItemEntry,
  GameContextItemUse,
  GameContextLoot,
  GameContextModels,
  GameContextObjectEntry,
  GameContextOptions,
  GameContextRace,
  GameContextTurn,
  GameContextWorld,
  HitReactionInput,
  MoveTowardCommitOptions,
  SceneEntityContext,
  SceneObjectContext,
  SceneWorldItemContext,
  TelegraphInput,
  VfxInput,
  WorldItemPickupResult,
} from "./gameContextTypes";

/** Feature keys surfaced on `ctx.game` (every {@link GameFeatures} key except `cosmetics`, which lives on `ctx.player`). */
type GameFeatureKey = Exclude<keyof GameFeatures, "cosmetics">;

export function createGameContext<TAssetRef extends ModelAssetRef, TMultiplayer>(
  options: GameContextOptions<TAssetRef, TMultiplayer>,
): GameContext {
  const { definition, content, player } = options;
  const now = options.now ?? Date.now;
  const occluder = options.occluder;

  const signal = createChangeSignal();
  let actingUserId: string | null = null;
  const activeUserId = () => actingUserId ?? player.userId;
  const time = createSimClock({ config: definition.time, onChange: signal.notify });
  const ground = groundFieldFor(definition.world);

  const rawEvents = createGameEvents();
  const events: GameEvents = {
    on: rawEvents.on,
    subscribe: rawEvents.subscribe,
    emit(name, payload) {
      rawEvents.emit(name, payload);
      signal.notify();
    },
  };

  // --- Scene installer (entities, objects, colliders, spatial, raycast, targeting) ---
  const scene = createSceneSubsystem({
    content,
    signalNotify: signal.notify,
    ground,
    events,
    time,
    ...(occluder !== undefined ? { occluder } : {}),
    ...(options.models !== undefined ? { models: options.models } : {}),
  });
  const {
    entities,
    objects,
    statsByInstance,
    entityStats,
    ensureInstanceStats,
    catalogEntry,
    spatial,
    combatSpatial,
    sceneRaycast,
    targeting,
    entityColliders,
    entityCollidersOf,
    objectCollidersOf,
    reportEntityBounds,
    reportEntityCollisionMesh,
    entityVisualScaleOf,
    forms,
    paintLayer,
    spawnEntity,
    despawnEntity,
    moveEntityTowardCommit,
    resetAllToSpawn,
    bind,
    sceneObjects,
  } = scene;

  // --- Shared game services (weapon, feed, features bag, commands, item use) ---
  const weapon = createWeaponStats((itemId) => content.itemById?.(itemId));
  const feed = createGameFeed(definition.feed);
  const lootRegistry = createLootRegistry();
  /**
   * Single feature-activation path (G9): `definition.features` is already the final map after
   * `defineGame` OR-merged explicit boolean sugar (`features: { quest: true }`) with system-implied
   * flags via `mergeSystemFeatures`. Descriptor install below is the only place that decides
   * "feature on" — never a second enable check against systems.
   */
  const features = definition.features ?? {};
  const featureRegistry = new Map<keyof GameFeatures, unknown>();
  const featureValue = <T>(key: keyof GameFeatures): T | undefined =>
    featureRegistry.get(key) as T | undefined;
  let rawSocial: Social | null = null;
  const sharedSocial = (): Social => {
    if (rawSocial === null) {
      rawSocial = createSocial({
        events,
        now,
        emotes: {
          entities: { get: (id) => entities.get(id) },
          spatial: { inRadius: (center, radius, filter) => spatial.inRadius(center, radius, filter) },
        },
      });
    }
    return rawSocial;
  };

  const commandRegistry = createCommandRegistry<GameContext>();
  if (definition.lifecycle !== undefined) {
    const lifecycle = definition.lifecycle;
    commandRegistry.define(lifecycle.commands?.start ?? "start", {
      apply(state, input) {
        const next = lifecycle.start(lifecycle.store.read(state), state, input);
        lifecycle.store.write(state, next);
        setGamePhase(state, lifecycle.phaseOf(next));
      },
    });
    commandRegistry.define(lifecycle.commands?.restart ?? "restart", {
      apply(state) {
        const next = lifecycle.restart(lifecycle.store.read(state), state);
        lifecycle.store.write(state, next);
        setGamePhase(state, lifecycle.phaseOf(next));
      },
    });
  }
  const itemUse = createItemUse<GameContext>((itemId) => content.itemById?.(itemId)?.use);

  // --- Player installer (inventory, wallets, pose, motion, loadout) ---
  const playerSys = createPlayerSubsystem({
    signalNotify: signal.notify,
    inventoryDeclarations: definition.inventories ?? {},
    entities,
    events,
    catalogEntry,
    ensureInstanceStats,
    feature: featureValue,
  });
  const {
    inventoryIds,
    inventoryByUser,
    inventoryFor,
    layouts,
    wallets,
    walletOf,
    economy,
    putIntoAnyInventory,
    playerStatsFor,
    pose,
    possession,
    motionByUser,
    motionFor,
    loadouts,
    seedUserPool,
  } = playerSys;
  scene.setOnAfterDespawn((instanceId) => pose.clear(instanceId));

  // Built-in inventory mutation commands so a HUD grid drives moves/splits through the notifying
  // command path (a raw InventorySet mutation would not re-render React). Each resolves the acting
  // user's own inventory, so it respects `privatePerUser` replication.
  const knownInventory = (inventoryId: string): boolean => layouts[inventoryId] !== undefined;
  const slotInRange = (inventoryId: string, slot: unknown): slot is number =>
    typeof slot === "number" && Number.isInteger(slot) && slot >= 0 && slot < layouts[inventoryId]!.slots;
  commandRegistry.define<{ inventoryId: string; from: number; to: number }>("inventory.move", {
    validate(_state, input) {
      if (!knownInventory(input.inventoryId)) return { reason: `unknown inventory "${input.inventoryId}"` };
      if (!slotInRange(input.inventoryId, input.from) || !slotInRange(input.inventoryId, input.to)) {
        return { reason: "invalid-slot" };
      }
      return null;
    },
    apply(_state, input) {
      const inventory = inventoryFor(activeUserId());
      // A rejected move (empty source, wrong-kind, no-space) is a harmless no-op: the item bounces back.
      inventory.move(input.inventoryId, input.from, input.inventoryId, input.to);
    },
  });
  commandRegistry.define<{ inventoryId: string; slot: number; amount: number; toSlot?: number }>("inventory.split", {
    validate(_state, input) {
      if (!knownInventory(input.inventoryId)) return { reason: `unknown inventory "${input.inventoryId}"` };
      if (!slotInRange(input.inventoryId, input.slot)) return { reason: "invalid-slot" };
      if (input.toSlot !== undefined && !slotInRange(input.inventoryId, input.toSlot)) {
        return { reason: "invalid-slot" };
      }
      return null;
    },
    apply(_state, input) {
      const inventory = inventoryFor(activeUserId());
      const result = splitStack(inventory.state(input.inventoryId), input.slot, input.amount, input.toSlot);
      if (result.status === "rejected") return;
      inventory.replaceState(input.inventoryId, result.state);
    },
  });

  const loot: GameContextLoot = {
    register: lootRegistry.register,
    has: lootRegistry.has,
    roll: lootRegistry.roll,
    grantToPlayer(userId, drops, source) {
      grantDrops(drops, {
        putItem: (itemId, count) => putIntoAnyInventory(userId, itemId, count),
        grantCurrency: (currencyId, amount) => economy.grant(userId, currencyId, amount),
      });
      const event: GameEventMap["loot.granted"] = { userId, drops };
      if (source !== undefined) event.source = source;
      events.emit("loot.granted", event);
    },
  };

  const { worldItems, spawnWorldItem, pickupWorldItem } = createWorldItemContext({
    entities,
    events,
    despawnEntity,
    grantToPlayer: loot.grantToPlayer,
    signalNotify: signal.notify,
  });

  // --- Combat installer (effects, projectiles, death, combat FX) ---
  // Command runner closes over `ctx` once assembled (same late-bind pattern as before).
  let ctxRef: GameContext | null = null;
  const combat = createCombatSubsystem({
    content,
    signalNotify: signal.notify,
    now,
    events,
    time,
    entities,
    objects,
    combatSpatial,
    sceneRaycast,
    entityCollidersOf,
    objectCollidersOf,
    catalogEntry,
    statsByInstance,
    weapon,
    loot,
    lootRegistry,
    spawnWorldItem,
    despawnEntity,
    runCommand(name, args) {
      if (ctxRef === null) return;
      commandRegistry.run(ctxRef, name, args);
    },
    localUserId: player.userId,
    ...(definition.physics !== undefined ? { physics: definition.physics } : {}),
  });
  scene.setOnAfterSpawn((instanceId) => combat.death.revive(instanceId));
  const { projectiles, combatFx, vfxInstances, effects } = combat;

  const store = notifyAfter(createObservableKeyedStore<unknown>(), ["set", "delete", "hydrate"], signal.notify);
  const { pile, loop, raceState, cardPiles, turnLoops } = createContextRegistries(signal.notify);
  const camera = notifyAfter(createCameraDirector(), ["follow", "setCinematic", "setChaseTuning"], signal.notify);
  const input = createInputSnapshot();

  // --- Descriptor install (single feature enable path) ---
  const featureDeps: FeatureDeps = {
    features,
    signalNotify: signal.notify,
    events,
    now,
    entities,
    spatial,
    store,
    commandRegistry,
    economy,
    content,
    activeUserId,
    walletOf,
    setWallet: (userId, state) => wallets.set(userId, state),
    layouts,
    inventoryFor,
    ensureInstanceStats,
    seedUserPool,
    sharedSocial,
    pile,
    loop,
    cardPiles,
    turnLoops,
    raceState,
    feature: featureValue,
  };
  const featureReplicateModules: SnapshotModule[] = [];
  const featureSaveModules: SnapshotModule[] = [];
  for (const descriptor of featureDescriptors) {
    if (!descriptor.enabled(features)) continue;
    const build = descriptor.create(featureDeps);
    featureRegistry.set(descriptor.key, build.value);
    if (build.replicate !== undefined) featureReplicateModules.push(build.replicate);
    if (build.save !== undefined) featureSaveModules.push(build.save);
  }

  const gameFeatureBlock = {} as Pick<GameContext["game"], GameFeatureKey>;
  for (const descriptor of featureDescriptors) {
    if (descriptor.key === "cosmetics") continue;
    (gameFeatureBlock as Record<string, unknown>)[descriptor.key] = featureRegistry.get(descriptor.key);
  }

  const baselineDeps: BaselineDeps = {
    signalNotify: signal.notify,
    entities,
    statsByInstance,
    store,
    feed,
    inventoryIds,
    inventoryByUser,
    inventoryFor,
    wallets,
    time,
    pose,
    possession,
    motionByUser,
    motionFor,
  };
  const baselineBuilds = baselineDescriptors.map((descriptor) => descriptor.create(baselineDeps));
  const snapshotModules: SnapshotModule[] = [
    ...baselineBuilds.flatMap((build) => (build.replicate === undefined ? [] : [build.replicate])),
    ...featureReplicateModules,
  ];

  const replication = options.replication;
  const projectsViewers = policyProjectsViewers(replication);
  const aoiRadius = replication?.aoiRadius;
  const typedProject =
    <T>(
      project: (data: T, viewer: SnapshotViewer, world: WorldSnapshot) => unknown,
    ): SnapshotModule["project"] =>
    (data, viewer, world) =>
      project(data as T, viewer, world);
  const projectorFor = (key: string): SnapshotModule["project"] | undefined => {
    if (aoiRadius !== undefined && key === "entities") {
      return typedProject<readonly SceneEntity[]>((data, viewer) =>
        projectEntitiesForViewer(data, viewer, aoiRadius),
      );
    }
    if (aoiRadius !== undefined && key === "stats") {
      return typedProject<Record<string, StatValueMap>>((data, viewer, world) =>
        projectByVisibleIds(
          data,
          visibleEntityIds((world["entities"] ?? []) as readonly SceneEntity[], viewer, aoiRadius),
        ),
      );
    }
    if (replication?.privatePerUser === true && key === "inventory") {
      return typedProject<Record<string, unknown>>((data, viewer) =>
        projectPerUserForViewer(data, viewer),
      );
    }
    return undefined;
  };
  const replicationModules: SnapshotModule[] = snapshotModules.map((module) => {
    const project = projectorFor(module.key);
    return {
      ...module,
      version: () => signal.version(),
      ...(project === undefined ? {} : { project }),
    };
  });
  const replicationVersion = (): number =>
    replicationModules.reduce((sum, module) => sum + (module.version?.() ?? 0), 0);

  const saveModules: SnapshotModule[] = [
    ...snapshotModules,
    ...baselineBuilds.flatMap((build) => (build.save === undefined ? [] : [build.save])),
    ...featureSaveModules,
  ];

  function registerSave(module: SnapshotModule): void {
    saveModules.push(module);
  }

  function registerReplicate(module: SnapshotModule): void {
    const project = projectorFor(module.key);
    replicationModules.push({
      ...module,
      version: () => signal.version(),
      ...(project === undefined ? {} : { project }),
    });
    saveModules.push(module);
  }

  // --- Assemble public GameContext ---
  const ctx: GameContext = {
    scene: {
      object: sceneObjects,
      entity: {
        spawn: spawnEntity,
        despawn: despawnEntity,
        update: entities.update,
        setPose: entities.setPose,
        setPoseConstraint: entities.setPoseConstraint,
        get: entities.get,
        list: entities.list,
        ids: entities.ids,
        subscribeMembership: entities.subscribeMembership,
        spawnPoseOf: entities.spawnPoseOf,
        resetToSpawn: entities.resetToSpawn,
        resetAllToSpawn,
        blackboard: entities.blackboard,
        stats: entityStats,
        floatText: combatFx.emitFloatText,
        vfx: combatFx.emitVfx,
        vfxInstance: vfxInstances,
        telegraph: combatFx.fireTelegraph,
        hitReaction: combatFx.applyHitReaction,
        setTarget: targeting.setTarget,
        getTarget: targeting.getTarget,
        cycleTarget: targeting.cycleTarget,
        canReceive: effects.canReceive,
        preview: effects.preview,
        effect: combatFx.applyEffectAndFloat,
        willHitProjectile: projectiles.willHitProjectile,
        fireProjectile: projectiles.fireProjectile,
        settleProjectile: projectiles.settleProjectile,
        distance: spatial.distance,
        inRadius: spatial.inRadius,
        hasLineOfSight: spatial.hasLineOfSight,
        queryArc: spatial.queryArc,
        moveToward: spatial.moveToward,
        moveTowardCommit: moveEntityTowardCommit,
        invalidateSpatial: spatial.invalidate,
        setColliders(instanceId, colliders) {
          if (colliders === null) entityColliders.delete(instanceId);
          else entityColliders.set(instanceId, colliders);
          signal.notify();
        },
        collidersOf: entityCollidersOf,
        reportBounds: reportEntityBounds,
        reportCollisionMesh: reportEntityCollisionMesh,
        visualScaleOf: entityVisualScaleOf,
        form: forms,
        paint: paintLayer,
        bind,
      },
      worldItem: {
        spawn: spawnWorldItem,
        get: worldItems.get,
        list: worldItems.list,
        nearestInRadius: worldItems.nearestInRadius,
        pickup: pickupWorldItem,
        consume: worldItems.remove,
      },
      raycast: (input) => sceneRaycast.raycast(input),
      raycastAll: (input) => sceneRaycast.raycastAll(input),
    },
    world: {
      ground,
      groundHeightAt: ground.sampleHeight,
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
        runAs(actorUserId, name, input) {
          const previous = actingUserId;
          actingUserId = actorUserId;
          try {
            const result = commandRegistry.run(ctx, name, input);
            signal.notify();
            return result;
          } finally {
            actingUserId = previous;
          }
        },
        actor: () => actingUserId,
      },
      events,
      playEntityAnimation: (instanceId, event) => events.emit("entity.animation", { instanceId, event }),
      audio: {
        play: (sound, at) => events.emit("audio.play", at === undefined ? { sound } : { sound, at }),
        music: (theme, transpose) =>
          events.emit("audio.music", transpose === undefined ? { theme } : { theme, transpose }),
        resume: () => events.emit("audio.resume", {}),
        loop: (id, sound, options) =>
          events.emit("audio.loopStart", options?.at === undefined ? { id, sound } : { id, sound, at: options.at }),
        setLoop: (id, params) => events.emit("audio.loopSet", { id, ...params }),
        stopLoop: (id) => events.emit("audio.loopStop", { id }),
      },
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
      economy,
      store,
      ...gameFeatureBlock,
      registerSave,
      registerReplicate,
    },
    player: {
      get userId() {
        return activeUserId();
      },
      isNew: player.isNew,
      get inventory() {
        return inventoryFor(activeUserId());
      },
      inventoryFor,
      get stats() {
        return playerStatsFor(activeUserId());
      },
      statsFor: playerStatsFor,
      loadout: loadouts,
      applyLoadout: loadouts.applyLoadout,
      movement: pose,
      possession,
      cosmetics: featureValue<Cosmetics>("cosmetics"),
      get motion() {
        return motionFor(activeUserId());
      },
      motionFor,
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
    camera,
    input,
    subscribe: signal.subscribe,
    version: signal.version,
    touch: signal.notify,
    snapshot: (viewer) => composeWorldSnapshot(replicationModules, viewer),
    hydrate(snapshot) {
      applyWorldSnapshot(replicationModules, snapshot);
      signal.notify();
    },
    replicationVersion,
    replicatesPerViewer: () => projectsViewers,
  };
  ctxRef = ctx;

  const saveOptions = resolveSaveOptions(definition, options);
  if (saveOptions !== undefined) {
    const saveTarget: RuntimeSaveTarget = {
      snapshot: () => composeWorldSnapshot(saveModules),
      hydrate: (snapshot) => {
        applyWorldSnapshot(saveModules, snapshot);
        signal.notify();
      },
      subscribe: signal.subscribe,
    };
    ctx.game.save = createRuntimeSave({ target: saveTarget, ...saveOptions });
  }

  return ctx;
}

function saveKey(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `jgengine:save:${slug === "" ? "game" : slug}`;
}

/**
 * Explicit `options.save` wins (the shell can inject any backend, e.g. cloud); otherwise an offline /
 * single-player world auto-wires a `localStorage` whole-world save **by default** — a game gets `ctx.game.save`
 * and autosave without touching `persist`. Only an explicit `persist: false` opts out; a host-authoritative
 * multiplayer world never persists to `localStorage` (its host owns persistence) regardless of `persist`.
 */
function resolveSaveOptions<TAssetRef extends ModelAssetRef, TMultiplayer>(
  definition: GameDefinition<TAssetRef, TMultiplayer>,
  options: GameContextOptions<TAssetRef, TMultiplayer>,
): RuntimeSaveOptions | undefined {
  if (options.save !== undefined) return options.save;
  const persist = definition.persist;
  if (persist === false) return undefined;
  if (!isOffline(definition.multiplayer)) return undefined;
  const config: PersistConfig = persist === undefined || persist === true ? {} : persist;
  return {
    backend: config.storage === "memory" ? memorySaveBackend() : localSaveBackend(),
    mode: config.mode,
    key: saveKey(definition.name),
    version: config.version,
    autosaveMs: config.autosaveMs,
    now: options.now,
  };
}
