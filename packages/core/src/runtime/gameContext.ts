import { type CardPile, type CardPileConfig } from "../cards/cardPile";
import {
  type EffectInput,
  type EffectResult,
  type EffectVia,
  type ReceiveMap,
  type SingleTargetEffectInput,
} from "../combat/effects";
import { type ProjectileSystem } from "../combat/projectiles";
import {
  type HitReaction,
  type HitReactionConfig,
  type ImpactPresetName,
} from "../combat/hitReaction";
import { type TelegraphShape } from "../combat/telegraph";
import {
  createCommandRegistry,
  type CommandDefinition,
  type CommandResult,
} from "../commands/commandRegistry";
import { type ChargeOptions as WalletChargeOptions } from "../economy/wallet";
import { type Cosmetics } from "../game/cosmetics";
import type { GameDefinition, GameFeatures, PersistConfig } from "../game/defineGame";
import { groundFieldFor, type TerrainField } from "../world/terrain";
import { createGameEvents, type GameEventMap, type GameEvents, type VfxKind } from "../game/events";
import { type VfxInstanceStore } from "../game/vfxInstance";
import { createGameFeed, type GameFeed } from "../game/feed";
import { setGamePhase } from "../game/gamePhase";
import { type Leaderboard } from "../game/leaderboard";
import { type Loadouts } from "../game/loadout";
import { createLootRegistry, grantDrops, type Drop, type LootTableDef } from "../game/lootTable";
import { type GameDialogue } from "../game/dialogue";
import { type QuestJournal } from "../game/quest";
import { type WorldItemRecord, type WorldItemSpawnInput } from "../game/worldItem";
import { type Chat } from "../game/chat";
import { createSocial, type Social } from "../game/social";
import { type TradeField, type TradeSystem } from "../game/trade";
import { type Unlocks } from "../game/unlocks";
import { type InventoryLayout, type InventorySet } from "../inventory/inventoryModel";
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
import { type PoseAllowedStates, type PoseState } from "../movement/poseState";
import type { ModelAssetRef } from "../scene/assetCatalog";
import { type BodyBind } from "../scene/bodyBind";
import { type PaintLayer } from "../scene/paintLayer";
import { type EntityStatsApi, type StatCatalog, type StatValueMap } from "../scene/entityStats";
import {
  type EntityBlackboard,
  type EntityPose,
  type EntityPosition,
  type EntityStore,
  type SceneEntity,
  type SpawnOptions,
  type SpawnPose,
} from "../scene/entityStore";
import { type Forms } from "../scene/form";
import { type EntityColliderSet, type ModelBodySource } from "../scene/colliders";
import { type ObjectRaycastHit, type ObjectRaycastInput } from "../scene/objectQuery";
import { type ObjectStore } from "../scene/objectStore";
import { type Roster } from "../scene/roster";
import { type SelectionSet } from "../scene/selection";
import { type ConnectedPlayers } from "../game/connectedPlayers";
import { type Possession } from "../scene/possession";
import { type SceneRaycastHit, type SceneRaycastInput } from "../scene/sceneRaycast";
import { type MoveTowardOptions, type SpatialApi } from "../scene/spatial";
import { type CycleTargetOptions } from "../scene/targeting";
import { type Stats } from "../stats/statModifiers";
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
import { type RaceState, type RaceStateConfig } from "../game/race";
import { createCameraDirector, type CameraDirector } from "./cameraDirector";
import { createInputSnapshot, type InputSnapshot } from "./inputSnapshot";
import { type MotionIntents } from "./motionIntents";
import { baselineDescriptors, type BaselineDeps } from "./descriptors/baseline";
import { featureDescriptors, type FeatureDeps } from "./descriptors/features";
import { createCombatSubsystem } from "./context/combat";
import { createContextRegistries } from "./context/registries";
import { createPlayerSubsystem } from "./context/player";
import { createSceneSubsystem } from "./context/scene";
import { createWorldItemContext } from "./context/worldItems";
import type { OnDeathSpec } from "../combat/death";

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

/** Feature keys surfaced on `ctx.game` (every {@link GameFeatures} key except `cosmetics`, which lives on `ctx.player`). */
type GameFeatureKey = Exclude<keyof GameFeatures, "cosmetics">;

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
   * Host-side per-viewer replication policy â€” private-state and area-of-interest projection over the
   * wire. Bound on the authoritative host only. Unset (the default) replicates the whole world to every
   * client, exactly as before; the simulation is identical either way, so a game plays the same.
   */
  replication?: ReplicationPolicy;
  /**
   * Render-model lookup feeding collider auto-fit: what each entity kind / object catalog id renders as
   * (resolved `entityModels`/`objectModels` â€” the shell wires this automatically). When set, entities and
   * objects without authored `colliders` get hitboxes fitted to their model's measured bounds instead of
   * the humanoid/unit-cube defaults. A multiplayer host should receive the same lookup as its clients so
   * both resolve identical colliders.
   */
  models?: GameContextModels;
}

/** Per-kind render-model lookup for {@link GameContextOptions.models}; a resolved `ModelConfig` satisfies {@link ModelBodySource} structurally.
 * @capability collider-autofit hitboxes and physical bodies fit each kind's rendered model bounds automatically â€” no hand-tuned sizes
 */
export interface GameContextModels {
  entity?(kind: string): ModelBodySource | null | undefined;
  object?(catalogId: string): ModelBodySource | null | undefined;
}

export interface SceneObjectContext extends ObjectStore {
  catalog(instanceId: string): GameContextObjectEntry | null;
  raycast(input: ObjectRaycastInput): ObjectRaycastHit | null;
  raycastAll(input: ObjectRaycastInput): readonly ObjectRaycastHit[];
  setColliders(instanceId: string, colliders: EntityColliderSet | null): void;
  collidersOf(instanceId: string): EntityColliderSet | null;
  /**
   * Per-instance selection/highlight state for placed objects â€” the reactive counterpart to
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
   * endpoints and params change over time â€” the persistent complement to the one-shot {@link SceneEntityContext.vfx}
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
   * â€” unknown instance/target).
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
   * Lazily creates (on first call) or returns the existing declarative bind for `key` â€” the sim-snapshot â†’
   * scene-entity pose mirror (#673). Call `bind(key).sync(bodies, dt)` once per tick with every sim body's
   * current snapshot instead of hand-writing `setPose` per body: an id seen for the first time is spawned
   * from its `kind`, an id already bound is posed, and a previously-bound id absent from this tick's
   * `bodies` is despawned â€” no per-game spawn/despawn dance.
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
  /** Run a command attributed to `actorUserId` â€” a shared-world host routes each client's command through this so the handler can read {@link actor}. */
  runAs(actorUserId: string, name: string, input: unknown): CommandResult<GameContext>;
  /** The user a command is running on behalf of, or `null` outside a {@link runAs} call â€” commands default to `ctx.player.userId` when this is `null`. */
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
  /** `options.overdraft` opts this charge into carrying a negative balance (`true` unlimited, `{ max }` capped) â€” omitted keeps the strict no-debt default. */
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
  /** Lazily creates (on first call, `config` required) or returns the existing reactive race for `id` â€” discrete mutations and eventful `update` calls bump `ctx.version()`, so HUDs stop hand-managing `store.set` (#286.2). */
  state(id: string, config?: RaceStateConfig): RaceState;
}

/** Reachable audio seam on `ctx.game`: `play`, `music`, and `resume` route through the `audio.play`/`audio.music`/`audio.resume` events the shell's audio engine listens on, so game code triggers sound without importing the shell. Retained `loop`/`setLoop`/`stopLoop` add id-keyed loops with live pitch/gain control over `audio.loopStart`/`audio.loopSet`/`audio.loopStop` (#1051). */
export interface GameAudio {
  play(sound: string, at?: readonly [number, number, number]): void;
  /** Crossfade the procedural soundtrack to `theme` (null fades out); `transpose` shifts the incoming theme's key in semitones. */
  music(theme: string | null, transpose?: number): void;
  resume(): void;
  /**
   * Start â€” or idempotently keep â€” the retained, id-keyed loop `id` playing catalog `sound`, emitting
   * `audio.loopStart`. Re-calling with the same `sound` does not restart it (no click); a different `sound`
   * replaces the source. Pair with {@link GameAudio.setLoop} to track a live signal â€” an RPM-pitched engine
   * loop, a slip-scaled tire squeal (#1051) â€” and {@link GameAudio.stopLoop} to end it.
   */
  loop(id: string, sound: string, options?: { at?: readonly [number, number, number] }): void;
  /**
   * Live-update retained loop `id` via `audio.loopSet`: `rate` re-pitches it (1 = authored pitch, clamped
   * 0.25â€“4 by the shell), `gain` rescales volume (0â€“1), `at` repositions its emitter. Cheap to call every
   * tick (~60 Hz) â€” the shell ramps rate/gain over ~20 ms to avoid zipper noise. A no-op when `id` is not a
   * live loop (an update may race a stop) (#1051).
   */
  setLoop(id: string, params: { rate?: number; gain?: number; at?: readonly [number, number, number] }): void;
  /** Stop and dispose retained loop `id` (emits `audio.loopStop`); an unknown `id` is ignored (#1051). */
  stopLoop(id: string): void;
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
    /** Play a model's one-shot animation clip bound to `event` in its `animation.oneShots` (e.g. an attack swing) â€” emits `entity.animation` for the shell to pick up. */
    playEntityAnimation(instanceId: string, event: string): void;
    feed: GameContextFeed;
    loot: GameContextLoot;
    /** Shop/vendor barter â€” present only when `features.trade` is set. */
    trade?: TradeSystem;
    /** Quest/mission journal â€” present only when `features.quest` is set. */
    quest?: QuestJournal;
    /** Talkable-NPC dialogue open/close bridge â€” present only when `features.dialogue` is set. */
    dialogue?: GameDialogue;
    /** Friends/party/presence/emotes/world-invites â€” present only when `features.social` is set. */
    social?: Social;
    /** Channels + messages â€” present only when `features.chat` is set (implies `social`). */
    chat?: Chat;
    /** Earned unlockable content â€” present only when `features.unlocks` is set. */
    unlocks?: Unlocks;
    economy: GameContextEconomy;
    /** Competitive score tracking â€” present only when `features.leaderboard` is set. */
    leaderboard?: Leaderboard;
    /** Owned-entity roster â€” present only when `features.roster` is set. */
    roster?: Roster;
    /** Game-defined keyed reactive store slot (#163.1); mutations bump `ctx.version()`/notify `ctx.subscribe`. */
    store: ObservableKeyedStore<unknown>;
    /** Card pile zones â€” present only when `features.cards` is set. */
    cards?: GameContextCards;
    /** Turn/phase loop â€” present only when `features.turn` is set. */
    turn?: GameContextTurn;
    /** Lap/checkpoint race state â€” present only when `features.race` is set. */
    race?: GameContextRace;
    /** Connected-player set for a shared world â€” present only when `features.players` is set. */
    players?: ConnectedPlayers;
    /** Whole-world save/load bound to a pluggable backend â€” present only when `defineGame({ save })` is set (offline/single-player). Drive save points and quest/area checkpoints with `checkpoint()`, restore on boot with `load()`. */
    save?: RuntimeSave;
    /**
     * Register a save-only snapshot module after boot (system-owned persistence).
     * Used by `composeGameLoop` / `installSystems` when a system declares `save`.
     */
    registerSave?(module: SnapshotModule): void;
    /**
     * Register a hostâ†’client replication module after boot (system-owned replication).
     * Used by `composeGameLoop` / `installSystems` when a system declares `replicate`.
     */
    registerReplicate?(module: SnapshotModule): void;
  };
  player: {
    /** The acting player's id â€” the command actor inside `runAs`, the local player everywhere else. */
    userId: string;
    isNew: boolean;
    /** The acting player's inventory set â€” the command actor's bags inside `runAs`, the local player's everywhere else. */
    inventory: InventorySet<string>;
    /** A specific player's inventory set â€” how a host reads or grants into any connected player's bags. */
    inventoryFor(userId: string): InventorySet<string>;
    /** The acting player's stat modifiers â€” the command actor's inside `runAs`, the local player's everywhere else. */
    stats: Stats<string>;
    /** A specific player's stat modifiers â€” how a host reads or buffs any connected player's stats. */
    statsFor(userId: string): Stats<string>;
    loadout: Loadouts;
    applyLoadout(userId: string, loadoutId: string): { reason: string } | null;
    movement: PoseState;
    possession: Possession;
    /** Cosmetic skins/customization â€” present only when `features.cosmetics` is set. */
    cosmetics?: Cosmetics;
    /** Motion seam into the movement integrator (#162.4); routes to the command actor's queue (or the local player outside a command), so a command's impulse lands on whoever ran it. See `MotionIntents`. */
    motion: MotionIntents;
    /** A specific player's motion queue â€” how the host-side per-player movement integrator drains each connected player's impulses. */
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
   * Bump {@link version}/notify {@link subscribe} directly â€” the escape hatch for a command that only
   * mutates game-owned state outside the entity/object/economy/store layers (an external session map,
   * a plain closure variable) and needs to force a reactive HUD refresh without faking a `ctx.game.store.set`.
   */
  touch(): void;
  /**
   * Gather every opted-in live subsystem into one {@link WorldSnapshot} â€” entities, entity stats, the
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
   * "feature on" â€” never a second enable check against systems.
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
