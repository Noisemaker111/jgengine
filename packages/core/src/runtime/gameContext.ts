import { type CardPile, type CardPileConfig } from "../cards/cardPile";
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
  type HitReaction,
  type HitReactionConfig,
  type ImpactPresetName,
} from "../combat/hitReaction";
import {
  type TelegraphShape,
} from "../combat/telegraph";
import {
  createCommandRegistry,
  type CommandDefinition,
  type CommandResult,
} from "../commands/commandRegistry";
import {
  balance as walletBalance,
  charge as walletCharge,
  createEmptyWallet,
  grant as walletGrant,
  isOverdrawn as walletIsOverdrawn,
  type ChargeOptions as WalletChargeOptions,
  type WalletState,
} from "../economy/wallet";
import { type Cosmetics } from "../game/cosmetics";
import type { GameDefinition, GameFeatures, PersistConfig } from "../game/defineGame";
import { groundFieldFor, type TerrainField } from "../world/terrain";
import { createGameEvents, type GameEventMap, type GameEvents, type VfxKind } from "../game/events";
import { createVfxInstanceStore, type VfxInstanceStore } from "../game/vfxInstance";
import { createGameFeed, type GameFeed } from "../game/feed";
import { setGamePhase } from "../game/gamePhase";
import { type Leaderboard } from "../game/leaderboard";
import { createLoadouts, type Loadouts } from "../game/loadout";
import { createLootRegistry, grantDrops, type Drop, type LootTableDef } from "../game/lootTable";
import { type GameDialogue } from "../game/dialogue";
import { type QuestJournal } from "../game/quest";
import {
  resolveDeathDrops,
  DEFAULT_RARITY,
  type WorldItemRecord,
  type WorldItemSpawnInput,
} from "../game/worldItem";
import { type Chat } from "../game/chat";
import { createSocial, type Social } from "../game/social";
import { type TradeField, type TradeSystem } from "../game/trade";
import { type Unlocks } from "../game/unlocks";
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
import { createBodyBind, type BodyBind } from "../scene/bodyBind";
import { createPaintLayer, type PaintLayer } from "../scene/paintLayer";
import {
  createEntityStatsApi,
  seedStatValues,
  setStatValue,
  type EntityStatsApi,
  type StatCatalog,
  type StatValueMap,
} from "../scene/entityStats";
import {
  createEntityStore,
  type EntityBlackboard,
  type EntityPose,
  type EntityPosition,
  type EntityStore,
  type SceneEntity,
  type SpawnOptions,
  type SpawnPose,
} from "../scene/entityStore";
import { createForms, type Forms } from "../scene/form";
import { scaledEntityColliders, scaledObjectColliders, type EntityColliderSet } from "../scene/colliders";
import { raycastObjects, raycastObjectsAll, type ObjectRaycastHit, type ObjectRaycastInput } from "../scene/objectQuery";
import { createObjectStore, objectVisualScale, type ObjectStore } from "../scene/objectStore";
import { type Roster } from "../scene/roster";
import { createSelectionSet, type SelectionSet } from "../scene/selection";
import { type ConnectedPlayers } from "../game/connectedPlayers";
import { createPossession, type Possession } from "../scene/possession";
import {
  createSceneRaycast,
  type SceneRaycastApi,
  type SceneRaycastHit,
  type SceneRaycastInput,
} from "../scene/sceneRaycast";
import { createSpatialApi, type MoveTowardOptions, type SpatialApi } from "../scene/spatial";
import { createTargeting, type CycleTargetOptions } from "../scene/targeting";
import { createStats, type Stats } from "../stats/statModifiers";
import { createChangeSignal, notifyAfter } from "../store/changeSignal";
import { createObservableKeyedStore, type ObservableKeyedStore } from "../store/observableKeyedStore";
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
  type ReplicationPolicy,
} from "./worldProjection";
import { createRuntimeSave, type RuntimeSave, type RuntimeSaveOptions, type RuntimeSaveTarget } from "./runtimeSave";
import { isOffline } from "./adapter";
import { localSaveBackend, memorySaveBackend } from "../game/saveStore";
import { createSimClock, type SimClock } from "../time/simClock";
import { type TurnLoop, type TurnLoopConfig } from "../turn/turnLoop";
import { RaceState, type RaceStateConfig } from "../game/race";
import { createCameraDirector, type CameraDirector } from "./cameraDirector";
import { createInputSnapshot, type InputSnapshot } from "./inputSnapshot";
import { createMotionIntents, type MotionIntents } from "./motionIntents";
import { baselineDescriptors, type BaselineDeps } from "./descriptors/baseline";
import { featureDescriptors, type FeatureDeps } from "./descriptors/features";
import { createCombatFx } from "./context/combatFx";
import { createContextRegistries } from "./context/registries";
import { createWorldItemContext } from "./context/worldItems";

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
  /** Purpose-specific colliders (physical body + named damage hitboxes). */
  colliders?: EntityColliderSet;
  /** Uniform visual scale of the rendered mesh; derives a matching hitbox (and eye-height) when no explicit `colliders` are set. */
  scale?: number;
}

export interface GameContextObjectEntry {
  proximityPrompt?: ProximityPrompt;
  breakable?: false | { baseBreakTime: number };
  slotInventory?: InventoryLayout;
  /** Right-click context-menu verbs for this object (#31). */
  verbs?: readonly ContextVerb[];
  colliders?: EntityColliderSet;
  halfExtents?: readonly [number, number, number];
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
  occluder?: (from: EntityPosition, to: EntityPosition) => boolean;
  /** Bind `ctx.game.save` to a pluggable backend (offline/single-player whole-world save). The shell resolves this from `defineGame({ save })`; multiplayer leaves it off (the host persists). */
  save?: RuntimeSaveOptions;
  /**
   * Host-side per-viewer replication policy — private-state and area-of-interest projection over the
   * wire. Bound on the authoritative host only. Unset (the default) replicates the whole world to every
   * client, exactly as before; the simulation is identical either way, so a game plays the same.
   */
  replication?: ReplicationPolicy;
}

export interface SceneObjectContext extends ObjectStore {
  catalog(instanceId: string): GameContextObjectEntry | null;
  raycast(input: ObjectRaycastInput): ObjectRaycastHit | null;
  raycastAll(input: ObjectRaycastInput): readonly ObjectRaycastHit[];
  setColliders(instanceId: string, colliders: EntityColliderSet | null): void;
  collidersOf(instanceId: string): EntityColliderSet | null;
  /**
   * Per-instance selection/highlight state for placed objects — the reactive counterpart to
   * `worldHealthBars`/`nameplates` (entities), so a build-mode or RTS selection ring reads
   * `ctx.scene.object.selection` instead of hand-rolling one through `WorldOverlay` against external
   * state. Mutations (`add`/`remove`/`toggle`/`replace`/`clear`) bump `ctx.version()`/notify
   * `ctx.subscribe` like every other `ctx` surface. Render it with `WorldObjectHighlights`
   * (`@jgengine/shell/world/WorldHud`).
   */
  selection: SelectionSet;
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

/** Request a transient spell/ability VFX burst; `from`/`to` accept an instance id or a world point, `color` is a `0xRRGGBB` tint, and `durationMs` defaults per `kind`. */
export interface VfxInput {
  kind: VfxKind;
  color: number;
  from?: string | readonly [number, number, number];
  to?: string | readonly [number, number, number];
  radius?: number;
  durationMs?: number;
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
  config: HitReactionConfig | ImpactPresetName;
  power?: number;
}

/** Options for {@link SceneEntityContext.moveTowardCommit}: {@link MoveTowardOptions} plus an optional facing turn. */
export interface MoveTowardCommitOptions extends MoveTowardOptions {
  /** Rotate the entity to face its direction of travel instead of preserving its current `rotationY`. Default false. */
  face?: boolean;
}

export interface SceneEntityContext {
  spawn(name: string, options?: SpawnOptions): string;
  despawn(instanceId: string): boolean;
  update: EntityStore["update"];
  setPose(instanceId: string, pose: EntityPose): boolean;
  setPoseConstraint: EntityStore["setPoseConstraint"];
  get(instanceId: string): SceneEntity | null;
  list(): readonly SceneEntity[];
  ids: EntityStore["ids"];
  subscribeMembership: EntityStore["subscribeMembership"];
  spawnPoseOf(instanceId: string): SpawnPose | null;
  resetToSpawn(instanceId: string): boolean;
  resetAllToSpawn(filter?: (entity: SceneEntity) => boolean): number;
  blackboard: EntityBlackboard;
  stats: EntityStatsApi;
  floatText(input: FloatTextInput): void;
  vfx(input: VfxInput): void;
  /**
   * Retained VFX registry for long-lived, updatable effects (held beams, tethers, zones, target lines) whose
   * endpoints and params change over time — the persistent complement to the one-shot {@link SceneEntityContext.vfx}
   * burst. `upsert` creates/replaces by stable id, `update` nudges dynamic params, `stop` disposes with an optional
   * fade; endpoints given as an entity instance id are followed live by the renderer without per-frame commands.
   */
  vfxInstance: VfxInstanceStore;
  telegraph(input: TelegraphInput): () => void;
  hitReaction(input: HitReactionInput): HitReaction | null;
  setTarget(fromId: string, toId: string | null): void;
  getTarget(fromId: string): string | null;
  cycleTarget(fromId: string, options?: CycleTargetOptions): string | null;
  canReceive(instanceId: string, effect: string, magnitude?: number): string | null;
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
  /**
   * `moveToward` plus commit: steps `instanceId` toward `target` and immediately `setPose`s the
   * result, so a per-tick mover no longer pairs `moveToward` with a hand-written `setPose`.
   * `options.face` turns the entity to its direction of travel; omitted preserves the current
   * `rotationY`. Returns the committed position (`null`, committing nothing, when `moveToward` would
   * — unknown instance/target).
   */
  moveTowardCommit(
    instanceId: string,
    target: EntityPosition | string,
    options: MoveTowardCommitOptions,
  ): EntityPosition | null;
  invalidateSpatial: SpatialApi["invalidate"];
  setColliders(instanceId: string, colliders: EntityColliderSet | null): void;
  collidersOf(instanceId: string): EntityColliderSet | null;
  /** Uniform visual scale from the entity's catalog entry (1 when unscaled). */
  visualScaleOf(instanceId: string): number;
  form: Forms;
  paint: PaintLayer;
  /**
   * Lazily creates (on first call) or returns the existing declarative bind for `key` — the sim-snapshot →
   * scene-entity pose mirror (#673). Call `bind(key).sync(bodies, dt)` once per tick with every sim body's
   * current snapshot instead of hand-writing `setPose` per body: an id seen for the first time is spawned
   * from its `kind`, an id already bound is posed, and a previously-bound id absent from this tick's
   * `bodies` is despawned — no per-game spawn/despawn dance.
   */
  bind(key: string): BodyBind;
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
  consume(instanceId: string): WorldItemRecord | null;
}

export interface GameContextCommands {
  define<TInput>(name: string, definition: CommandDefinition<GameContext, TInput>): void;
  has(name: string): boolean;
  names(): string[];
  run(name: string, input: unknown): CommandResult<GameContext>;
  /** Run a command attributed to `actorUserId` — a shared-world host routes each client's command through this so the handler can read {@link actor}. */
  runAs(actorUserId: string, name: string, input: unknown): CommandResult<GameContext>;
  /** The user a command is running on behalf of, or `null` outside a {@link runAs} call — commands default to `ctx.player.userId` when this is `null`. */
  actor(): string | null;
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
  /** `options.overdraft` opts this charge into carrying a negative balance (`true` unlimited, `{ max }` capped) — omitted keeps the strict no-debt default. */
  charge(userId: string, currencyId: string, amount: number, options?: WalletChargeOptions): { reason: string } | null;
  /** True once `balance(userId, currencyId)` has gone negative under an overdraft-enabled charge. */
  isOverdrawn(userId: string, currencyId: string): boolean;
}

export interface GameContextItemUse {
  register(handlers: Record<string, ItemUseHandler<GameContext>>): void;
  registered(): string[];
  can(input: ItemUseInput): ItemUseRejection | null;
  use(input: ItemUseInput): ItemUseResult<GameContext>;
}

export interface GameContextWorld {
  ground: TerrainField;
  groundHeightAt(x: number, z: number): number;
}

export interface GameContextCards {
  /** Lazily creates (on first call, `config` required) or returns the existing notify-wrapped pile for `id`. */
  pile(id: string, config?: CardPileConfig): CardPile;
}

export interface GameContextTurn {
  /** Lazily creates (on first call, `config` required) or returns the existing notify-wrapped turn loop for `id`. */
  loop(id: string, config?: TurnLoopConfig): TurnLoop;
}

export interface GameContextRace {
  /** Lazily creates (on first call, `config` required) or returns the existing reactive race for `id` — discrete mutations and eventful `update` calls bump `ctx.version()`, so HUDs stop hand-managing `store.set` (#286.2). */
  state(id: string, config?: RaceStateConfig): RaceState;
}

/** Reachable audio seam on `ctx.game`: `play`, `music`, and `resume` route through the `audio.play`/`audio.music`/`audio.resume` events the shell's audio engine listens on, so game code triggers sound without importing the shell. */
export interface GameAudio {
  play(sound: string, at?: readonly [number, number, number]): void;
  /** Crossfade the procedural soundtrack to `theme` (null fades out); `transpose` shifts the incoming theme's key in semitones. */
  music(theme: string | null, transpose?: number): void;
  resume(): void;
}

export interface GameContext {
  scene: {
    object: SceneObjectContext;
    entity: SceneEntityContext;
    worldItem: SceneWorldItemContext;
    raycast(input: SceneRaycastInput): SceneRaycastHit | null;
    raycastAll(input: SceneRaycastInput): readonly SceneRaycastHit[];
  };
  world: GameContextWorld;
  game: {
    commands: GameContextCommands;
    events: GameEvents;
    audio: GameAudio;
    /** Play a model's one-shot animation clip bound to `event` in its `animation.oneShots` (e.g. an attack swing) — emits `entity.animation` for the shell to pick up. */
    playEntityAnimation(instanceId: string, event: string): void;
    feed: GameContextFeed;
    loot: GameContextLoot;
    /** Shop/vendor barter — present only when `features.trade` is set. */
    trade?: TradeSystem;
    /** Quest/mission journal — present only when `features.quest` is set. */
    quest?: QuestJournal;
    /** Talkable-NPC dialogue open/close bridge — present only when `features.dialogue` is set. */
    dialogue?: GameDialogue;
    /** Friends/party/presence/emotes/world-invites — present only when `features.social` is set. */
    social?: Social;
    /** Channels + messages — present only when `features.chat` is set (implies `social`). */
    chat?: Chat;
    /** Earned unlockable content — present only when `features.unlocks` is set. */
    unlocks?: Unlocks;
    economy: GameContextEconomy;
    /** Competitive score tracking — present only when `features.leaderboard` is set. */
    leaderboard?: Leaderboard;
    /** Owned-entity roster — present only when `features.roster` is set. */
    roster?: Roster;
    /** Game-defined keyed reactive store slot (#163.1); mutations bump `ctx.version()`/notify `ctx.subscribe`. */
    store: ObservableKeyedStore<unknown>;
    /** Card pile zones — present only when `features.cards` is set. */
    cards?: GameContextCards;
    /** Turn/phase loop — present only when `features.turn` is set. */
    turn?: GameContextTurn;
    /** Lap/checkpoint race state — present only when `features.race` is set. */
    race?: GameContextRace;
    /** Connected-player set for a shared world — present only when `features.players` is set. */
    players?: ConnectedPlayers;
    /** Whole-world save/load bound to a pluggable backend — present only when `defineGame({ save })` is set (offline/single-player). Drive save points and quest/area checkpoints with `checkpoint()`, restore on boot with `load()`. */
    save?: RuntimeSave;
    /**
     * Register a save-only snapshot module after boot (system-owned persistence).
     * Used by `composeGameLoop` / `installSystems` when a system declares `save`.
     */
    registerSave?(module: SnapshotModule): void;
    /**
     * Register a host→client replication module after boot (system-owned replication).
     * Used by `composeGameLoop` / `installSystems` when a system declares `replicate`.
     */
    registerReplicate?(module: SnapshotModule): void;
  };
  player: {
    /** The acting player's id — the command actor inside `runAs`, the local player everywhere else. */
    userId: string;
    isNew: boolean;
    /** The acting player's inventory set — the command actor's bags inside `runAs`, the local player's everywhere else. */
    inventory: InventorySet<string>;
    /** A specific player's inventory set — how a host reads or grants into any connected player's bags. */
    inventoryFor(userId: string): InventorySet<string>;
    /** The acting player's stat modifiers — the command actor's inside `runAs`, the local player's everywhere else. */
    stats: Stats<string>;
    /** A specific player's stat modifiers — how a host reads or buffs any connected player's stats. */
    statsFor(userId: string): Stats<string>;
    loadout: Loadouts;
    applyLoadout(userId: string, loadoutId: string): { reason: string } | null;
    movement: PoseState;
    possession: Possession;
    /** Cosmetic skins/customization — present only when `features.cosmetics` is set. */
    cosmetics?: Cosmetics;
    /** Motion seam into the movement integrator (#162.4); routes to the command actor's queue (or the local player outside a command), so a command's impulse lands on whoever ran it. See `MotionIntents`. */
    motion: MotionIntents;
    /** A specific player's motion queue — how the host-side per-player movement integrator drains each connected player's impulses. */
    motionFor(userId: string): MotionIntents;
  };
  item: {
    use: GameContextItemUse;
    weapon: WeaponStats;
  };
  time: SimClock;
  /** Runtime camera-follow/cinematic override (#196.2); the shell reads `followedEntityId()` each frame. */
  camera: CameraDirector;
  /** Held-input snapshot published by the shell each frame before `onTick` (#164.1). */
  input: InputSnapshot;
  subscribe(listener: () => void): () => void;
  version(): number;
  /**
   * Bump {@link version}/notify {@link subscribe} directly — the escape hatch for a command that only
   * mutates game-owned state outside the entity/object/economy/store layers (an external session map,
   * a plain closure variable) and needs to force a reactive HUD refresh without faking a `ctx.game.store.set`.
   */
  touch(): void;
  /**
   * Gather every opted-in live subsystem into one {@link WorldSnapshot} — entities, entity stats, the
   * keyed store, the action feed, plus leaderboard/chat when those features are on. The full-world
   * baseline a host sends a joining client; {@link hydrate} is its inverse. Pass a `viewer` and the host
   * projects the snapshot to only what that viewer may see (private state, area of interest) when a
   * {@link GameContextOptions.replication} policy is set; without one the viewer argument is a no-op.
   */
  snapshot(viewer?: SnapshotViewer): WorldSnapshot;
  /** Apply a {@link WorldSnapshot} from an authoritative host, hydrating each subsystem key present in it. */
  hydrate(snapshot: WorldSnapshot): void;
  /** Aggregate world-dirty version summed across replicated modules; the host replicator skips an unchanged commit. @internal */
  replicationVersion(): number;
  /** True when a {@link GameContextOptions.replication} policy makes {@link snapshot} viewer-dependent (private/AOI projection is active). @internal */
  replicatesPerViewer(): boolean;
}

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

  const entities = createEntityStore();
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

  let spatialGeneration = 0;
  const candidateIds: string[] = [];
  let candidateIdsDirty = true;

  function refreshCandidateIds(): readonly string[] {
    if (!candidateIdsDirty) return candidateIds;
    candidateIds.length = 0;
    for (const entity of entities.list()) candidateIds.push(entity.id);
    candidateIdsDirty = false;
    return candidateIds;
  }

  const spatial = createSpatialApi({
    resolvePosition: (instanceId) => entities.get(instanceId)?.position,
    candidates: refreshCandidateIds,
    grid: { cellSize: 8 },
    getVersion: () => spatialGeneration,
    ...(occluder !== undefined ? { occluder } : {}),
  });

  entities.subscribe(() => {
    candidateIdsDirty = true;
    spatialGeneration += 1;
    spatial.invalidate();
  });

  const entityColliders = new Map<string, EntityColliderSet>();
  const objectColliders = new Map<string, EntityColliderSet>();

  function entityCollidersOf(instanceId: string): EntityColliderSet | null {
    const override = entityColliders.get(instanceId);
    if (override !== undefined) return override;
    const entry = catalogEntry(instanceId);
    if (entry?.colliders !== undefined) return entry.colliders;
    const scale = entry?.scale;
    if (scale !== undefined && scale !== 1) return scaledEntityColliders(scale);
    return null;
  }

  function entityVisualScaleOf(instanceId: string): number {
    return catalogEntry(instanceId)?.scale ?? 1;
  }

  function objectCollidersOf(instanceId: string): EntityColliderSet | null {
    const override = objectColliders.get(instanceId);
    if (override !== undefined) return override;
    const catalog = catalogObject(instanceId);
    if (catalog?.colliders !== undefined) return catalog.colliders;
    if (catalog?.halfExtents !== undefined) return null;
    const object = objects.get(instanceId);
    if (object === null || object.visual?.scale === undefined) return null;
    return scaledObjectColliders(objectVisualScale(object.visual));
  }

  const targeting = notifyAfter(
    createTargeting({
      candidates: () => [...refreshCandidateIds()],
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
    hasLineOfSight: (from, to) => {
      if (typeof from === "string") return spatial.hasLineOfSight(from, to);
      const toPos = entities.get(to)?.position;
      if (toPos === undefined) return false;
      if (occluder === undefined) return true;
      return !occluder(from, toPos);
    },
    positionOf: (instanceId) => entities.get(instanceId)?.position,
  };

  const sceneRaycast: SceneRaycastApi = createSceneRaycast({
    entities: {
      list: () => entities.list().map((entity) => ({
        id: entity.id,
        position: entity.position,
        rotationY: entity.rotationY,
        name: entity.name,
      })),
      collidersOf: entityCollidersOf,
      inRadius: (center, radius) => spatial.inRadius(center, radius),
      get: (id) => {
        const entity = entities.get(id);
        if (entity === null) return null;
        return { id: entity.id, position: entity.position, rotationY: entity.rotationY, name: entity.name };
      },
    },
    objects: {
      list: () => objects.list(),
      inBox: (min, max) => objects.inBox(min, max),
      collidersOf: objectCollidersOf,
      halfExtentsOf: (catalogId) => content.objectById?.(catalogId)?.halfExtents ?? null,
    },
    terrain: ground,
  });

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
  const feed = createGameFeed(definition.feed);
  const lootRegistry = createLootRegistry();
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
  const playerStatsByUser = new Map<string, Stats<string>>();
  function playerStatsFor(userId: string): Stats<string> {
    let stats = playerStatsByUser.get(userId);
    if (stats === undefined) {
      stats = createStats<string>({});
      playerStatsByUser.set(userId, stats);
    }
    return stats;
  }
  const pose = createPoseState((instanceId) => catalogEntry(instanceId)?.movement);
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
  const possession = notifyAfter(createPossession({ entities, events }), ["possess", "own", "disown"], signal.notify);
  const forms = notifyAfter(createForms({ entities, time, events }), ["shapeshift", "revert"], signal.notify);
  const paintLayer = notifyAfter(createPaintLayer(), ["paint", "clear"], signal.notify);

  const inventoryDeclarations = definition.inventories ?? {};
  const inventoryIds = Object.keys(inventoryDeclarations);
  const layouts: Record<string, InventoryLayout> = {};
  for (const [inventoryId, declaration] of Object.entries(inventoryDeclarations)) {
    layouts[inventoryId] = { slots: declaration.slots, accepts: declaration.accepts };
  }
  const traits: ItemTraits = Object.values(inventoryDeclarations).find(
    (declaration) => declaration.traits !== undefined,
  )?.traits ?? { stackLimit: () => Number.POSITIVE_INFINITY };
  const inventoryByUser = new Map<string, InventorySet<string>>();
  function inventoryFor(userId: string): InventorySet<string> {
    let set = inventoryByUser.get(userId);
    if (set === undefined) {
      set = notifyAfter(createInventorySet(layouts, traits), ["put", "take", "move", "replaceState"], signal.notify);
      inventoryByUser.set(userId, set);
    }
    return set;
  }

  const wallets = new Map<string, WalletState>();
  const walletOf = (userId: string) => wallets.get(userId) ?? createEmptyWallet();
  const economy: GameContextEconomy = {
    balance: (userId, currencyId) => walletBalance(walletOf(userId), currencyId),
    grant(userId, currencyId, amount) {
      wallets.set(userId, walletGrant(walletOf(userId), currencyId, amount));
      signal.notify();
    },
    charge(userId, currencyId, amount, options) {
      const result = walletCharge(walletOf(userId), currencyId, amount, options);
      if (result.status === "rejected") return { reason: result.reason };
      wallets.set(userId, result.state);
      signal.notify();
      return null;
    },
    isOverdrawn: (userId, currencyId) => walletIsOverdrawn(walletOf(userId), currencyId),
  };

  function putIntoAnyInventory(userId: string, itemId: string, count: number): void {
    const inventory = inventoryFor(userId);
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
        putItem: (itemId, count) => putIntoAnyInventory(userId, itemId, count),
        grantCurrency: (currencyId, amount) => economy.grant(userId, currencyId, amount),
      });
      const event: GameEventMap["loot.granted"] = { userId, drops };
      if (source !== undefined) event.source = source;
      events.emit("loot.granted", event);
    },
  };

  function seedUserPool(
    userId: string,
    statId: string,
    pool: { current: number; max?: number; min?: number },
  ): void {
    const map = ensureInstanceStats(userId);
    const next = setStatValue(map, statId, pool);
    map[statId] = next[statId]!;
  }

  const loadouts = notifyAfter(
    createLoadouts({
    inventory: {
      begin(userId) {
        const inventory = inventoryFor(userId);
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
      unlocks: { grant: (userId, unlockId) => featureValue<Unlocks>("unlocks")?.grant(userId, unlockId) },
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
    entityColliders.delete(instanceId);
    return existed;
  }

  function moveEntityTowardCommit(
    instanceId: string,
    target: EntityPosition | string,
    options: MoveTowardCommitOptions,
  ): EntityPosition | null {
    const next = spatial.moveToward(instanceId, target, options);
    if (next === null) return null;
    const current = entities.get(instanceId);
    if (current === null) return null;
    let rotationY = current.rotationY;
    if (options.face === true) {
      const dx = next[0] - current.position[0];
      const dz = next[2] - current.position[2];
      if (Math.hypot(dx, dz) > 1e-9) rotationY = Math.atan2(dx, dz);
    }
    entities.setPose(instanceId, { position: next, rotationY });
    return next;
  }

  function resetAllToSpawn(filter?: (entity: SceneEntity) => boolean): number {
    let count = 0;
    for (const entity of entities.list()) {
      if (filter !== undefined && !filter(entity)) continue;
      if (entities.resetToSpawn(entity.id)) count += 1;
    }
    return count;
  }

  const bodyBinds = new Map<string, BodyBind>();
  function bind(key: string): BodyBind {
    const existing = bodyBinds.get(key);
    if (existing !== undefined) return existing;
    const created = createBodyBind({
      has: (id) => entities.get(id) !== null,
      spawn: spawnEntity,
      despawn: despawnEntity,
      setPose: entities.setPose,
      update: entities.update,
    });
    bodyBinds.set(key, created);
    return created;
  }

  const { worldItems, spawnWorldItem, pickupWorldItem } = createWorldItemContext({
    entities,
    events,
    despawnEntity,
    grantToPlayer: loot.grantToPlayer,
    signalNotify: signal.notify,
  });

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

  const { emitFloatText, emitVfx, fireTelegraph, applyHitReaction, applyEffectAndFloat } = createCombatFx({
    entities,
    events,
    time,
    applyEffect: (input) => effects.applyEffect(input),
  });

  const vfxInstances = createVfxInstanceStore({
    onOp: (op) => events.emit("combat.vfxInstance", op),
    now: () => time.now() * 1000,
  });

  const floatingEffects: EffectSystem = {
    canReceive: effects.canReceive,
    preview: effects.preview,
    applyEffect: applyEffectAndFloat,
  };

  const projectileObstacles = definition.physics?.projectileObstacles === true;
  const projectileSceneRaycast: SceneRaycastApi = {
    raycast(input) {
      return sceneRaycast.raycast({
        ...input,
        filter: {
          entities: true,
          objects: projectileObstacles,
          terrain: false,
          walls: projectileObstacles,
          ...input.filter,
        },
      });
    },
    raycastAll(input) {
      return sceneRaycast.raycastAll({
        ...input,
        filter: {
          entities: true,
          objects: projectileObstacles,
          terrain: false,
          walls: projectileObstacles,
          ...input.filter,
        },
      });
    },
  };

  const projectiles = notifyAfter(
    createProjectileSystem({
      effects: floatingEffects,
      spatial: combatSpatial,
      getStat: weapon.getStat,
      sceneRaycast: projectileSceneRaycast,
      objects: projectileObstacles
        ? {
            list: () => objects.list(),
            inBox: (min, max) => objects.inBox(min, max),
            halfExtents: (catalogId) => {
              const half = content.objectById?.(catalogId)?.halfExtents;
              return half === undefined ? null : [half[0], half[1], half[2]];
            },
            collidersOf: objectCollidersOf,
          }
        : undefined,
      entityCollidersOf,
      rotationYOf: (instanceId) => entities.get(instanceId)?.rotationY,
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

  const objectSelection = notifyAfter(
    createSelectionSet(),
    ["add", "remove", "toggle", "replace", "clear"],
    signal.notify,
  );

  const sceneObjects: SceneObjectContext = {
    ...objects,
    remove(instanceId) {
      const existed = objects.remove(instanceId);
      if (existed) objectSelection.remove(instanceId);
      return existed;
    },
    catalog: (instanceId) => catalogObject(instanceId) ?? null,
    raycast: (input) => raycastObjects(objects, input),
    raycastAll: (input) => raycastObjectsAll(objects, input),
    setColliders(instanceId, colliders) {
      if (colliders === null) objectColliders.delete(instanceId);
      else objectColliders.set(instanceId, colliders);
      signal.notify();
    },
    collidersOf: objectCollidersOf,
    selection: objectSelection,
  };

  const store = notifyAfter(createObservableKeyedStore<unknown>(), ["set", "delete", "hydrate"], signal.notify);

  const { pile, loop, raceState, cardPiles, turnLoops } = createContextRegistries(signal.notify);

  const camera = notifyAfter(createCameraDirector(), ["follow", "setCinematic", "setChaseTuning"], signal.notify);
  const input = createInputSnapshot();
  const motionByUser = new Map<string, MotionIntents>();
  function motionFor(userId: string): MotionIntents {
    let queue = motionByUser.get(userId);
    if (queue === undefined) {
      queue = createMotionIntents();
      motionByUser.set(userId, queue);
    }
    return queue;
  }

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
  const projectorFor = (key: string): SnapshotModule["project"] | undefined => {
    if (aoiRadius !== undefined && key === "entities") {
      return (data, viewer) =>
        projectEntitiesForViewer(data as readonly SceneEntity[], viewer, aoiRadius) as unknown;
    }
    if (aoiRadius !== undefined && key === "stats") {
      return (data, viewer, world) =>
        projectByVisibleIds(
          data as Record<string, StatValueMap>,
          visibleEntityIds((world["entities"] ?? []) as readonly SceneEntity[], viewer, aoiRadius),
        );
    }
    if (replication?.privatePerUser === true && key === "inventory") {
      return (data, viewer) => projectPerUserForViewer(data as Record<string, unknown>, viewer);
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

  /**
   * The whole-world *save* set is a superset of the *replication* set (`snapshotModules`): it adds the
   * always-on baseline subsystems (economy, time, pose, possession, motion) plus every opted-in
   * feature's `save` module (unlocks, roster, quest, cosmetics, cards, turn) — the persistent state a
   * single-player save must restore but a host does not replicate to clients. Coverage is owned per
   * subsystem, not hand-listed against a drifting feature manifest: each feature descriptor emits its
   * own `save`, so a new persistent feature can't silently fall out of the save. Keeping the two sets
   * distinct leaves `ctx.snapshot()`/`ctx.hydrate()` — the host→client payload — byte-identical for
   * every multiplayer game, while `ctx.game.save` still persists everything.
   * Mutable so game systems can register save modules at install time via `ctx.game.registerSave`.
   */
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
        floatText: emitFloatText,
        vfx: emitVfx,
        vfxInstance: vfxInstances,
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
        moveTowardCommit: moveEntityTowardCommit,
        invalidateSpatial: spatial.invalidate,
        setColliders(instanceId, colliders) {
          if (colliders === null) entityColliders.delete(instanceId);
          else entityColliders.set(instanceId, colliders);
          signal.notify();
        },
        collidersOf: entityCollidersOf,
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
      trade: featureValue<TradeSystem>("trade"),
      quest: featureValue<QuestJournal>("quest"),
      social: featureValue<Social>("social"),
      chat: featureValue<Chat>("chat"),
      unlocks: featureValue<Unlocks>("unlocks"),
      economy,
      leaderboard: featureValue<Leaderboard>("leaderboard"),
      roster: featureValue<Roster>("roster"),
      store,
      dialogue: featureValue<GameDialogue>("dialogue"),
      cards: featureValue<GameContextCards>("cards"),
      turn: featureValue<GameContextTurn>("turn"),
      race: featureValue<GameContextRace>("race"),
      players: featureValue<ConnectedPlayers>("players"),
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

/** Explicit `options.save` wins (the shell can inject any backend, e.g. cloud); otherwise `defineGame({ persist })` auto-wires a localStorage save for offline/single-player worlds only. */
function resolveSaveOptions<TAssetRef extends ModelAssetRef, TMultiplayer>(
  definition: GameDefinition<TAssetRef, TMultiplayer>,
  options: GameContextOptions<TAssetRef, TMultiplayer>,
): RuntimeSaveOptions | undefined {
  if (options.save !== undefined) return options.save;
  const persist = definition.persist;
  if (persist === undefined || persist === false) return undefined;
  if (!isOffline(definition.multiplayer)) return undefined;
  const config: PersistConfig = persist === true ? {} : persist;
  return {
    backend: config.storage === "memory" ? memorySaveBackend() : localSaveBackend(),
    mode: config.mode,
    key: saveKey(definition.name),
    version: config.version,
    autosaveMs: config.autosaveMs,
    now: options.now,
  };
}
