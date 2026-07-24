import type { CardPile, CardPileConfig } from "../cards/cardPile";
import type {
  EffectInput,
  EffectResult,
  EffectVia,
  ReceiveMap,
  SingleTargetEffectInput,
} from "../combat/effects";
import type { ProjectileSystem } from "../combat/projectiles";
import type { HitReaction, HitReactionConfig, ImpactPresetName } from "../combat/hitReaction";
import type { VfxPresetName } from "../combat/vfxPresets";
import type { TelegraphShape } from "../combat/telegraph";
import type { CommandDefinition, CommandResult } from "../commands/commandRegistry";
import type { ChargeOptions as WalletChargeOptions } from "../economy/wallet";
import type { Cosmetics } from "../game/cosmetics";
import type { GameDefinition } from "../game/defineGame";
import type { TerrainField } from "../world/terrain";
import type { GameEventMap, GameEvents, VfxKind } from "../game/events";
import type { VfxInstanceStore } from "../game/vfxInstance";
import type { GameFeed } from "../game/feed";
import type { Leaderboard } from "../game/leaderboard";
import type { Loadouts } from "../game/loadout";
import type { Drop, LootTableDef } from "../game/lootTable";
import type { GameDialogue } from "../game/dialogue";
import type { QuestJournal } from "../game/quest";
import type { WorldItemRecord, WorldItemSpawnInput } from "../game/worldItem";
import type { Chat } from "../game/chat";
import type { Social } from "../game/social";
import type { TradeField, TradeSystem } from "../game/trade";
import type { Unlocks } from "../game/unlocks";
import type { InventoryLayout, InventorySet } from "../inventory/inventoryModel";
import type { ContextVerb } from "../interaction/contextMenu";
import type { ProximityPrompt } from "../interaction/proximityPrompt";
import type { ItemUseHandler, ItemUseInput, ItemUseRejection, ItemUseResult } from "../item/use";
import type { WeaponStats } from "../item/weapon";
import type { PoseAllowedStates, PoseState } from "../movement/poseState";
import type { ModelAssetRef } from "../scene/assetCatalog";
import type { BodyBind } from "../scene/bodyBind";
import type { PaintLayer } from "../scene/paintLayer";
import type { EntityStatsApi, StatCatalog } from "../scene/entityStats";
import type {
  EntityBlackboard,
  EntityPose,
  EntityPosition,
  EntityStore,
  SceneEntity,
  SpawnOptions,
  SpawnPose,
} from "../scene/entityStore";
import type { Forms } from "../scene/form";
import type { EntityColliderSet, MeasuredBounds, ModelBodySource } from "../scene/colliders";
import type { CollisionMeshSource } from "../scene/collisionMesh";
import type { ObjectRaycastHit, ObjectRaycastInput } from "../scene/objectQuery";
import type { ObjectStore } from "../scene/objectStore";
import type { Roster } from "../scene/roster";
import type { SelectionSet } from "../scene/selection";
import type { ConnectedPlayers } from "../game/connectedPlayers";
import type { Possession } from "../scene/possession";
import type { SceneRaycastHit, SceneRaycastInput } from "../scene/sceneRaycast";
import type { MoveTowardOptions, SpatialApi } from "../scene/spatial";
import type { CycleTargetOptions } from "../scene/targeting";
import type { Stats } from "../stats/statModifiers";
import type { ObservableKeyedStore } from "../store/observableKeyedStore";
import type { SnapshotModule, SnapshotViewer, WorldSnapshot } from "./worldSnapshot";
import type { ReplicationPolicy } from "./worldProjection";
import type { RuntimeSave, RuntimeSaveOptions } from "./runtimeSave";
import type { SimClock } from "../time/simClock";
import type { TurnLoop, TurnLoopConfig } from "../turn/turnLoop";
import type { RaceState, RaceStateConfig } from "../game/race";
import type { CameraDirector } from "./cameraDirector";
import type { InputSnapshot } from "./inputSnapshot";
import type { MotionIntents } from "./motionIntents";
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
  /**
   * Seed for {@link GameContext.rng}. Defaults to the game name so two contexts of the same
   * definition share a stream unless a host passes a unique seed per world/session.
   */
  seed?: string | number;
  /**
   * Injected `[0,1)` generator for this world. Defaults to a {@link seededRng} from {@link seed}.
   * Never use `Math.random` on simulation paths — pass `ctx.rng` into pure helpers instead.
   */
  rng?: () => number;
  /** Bind `ctx.game.save` to a pluggable backend (offline/single-player whole-world save). The shell resolves this from `defineGame({ save })`; multiplayer leaves it off (the host persists). */
  save?: RuntimeSaveOptions;
  /**
   * Host-side per-viewer replication policy — private-state and area-of-interest projection over the
   * wire. Bound on the authoritative host only. Unset (the default) replicates the whole world to every
   * client, exactly as before; the simulation is identical either way, so a game plays the same.
   */
  replication?: ReplicationPolicy;
  /**
   * Render-model lookup feeding collider auto-fit: what each entity kind / object catalog id renders as
   * (resolved `entityModels`/`objectModels` — the shell wires this automatically). When set, entities and
   * objects without authored `colliders` get hitboxes fitted to their model's measured bounds instead of
   * the humanoid/unit-cube defaults. A multiplayer host should receive the same lookup as its clients so
   * both resolve identical colliders.
   */
  models?: GameContextModels;
}

/** Per-kind render-model lookup for {@link GameContextOptions.models}; a resolved `ModelConfig` satisfies {@link ModelBodySource} structurally.
 * @capability collider-autofit hitboxes and physical bodies fit each kind's rendered model bounds automatically — no hand-tuned sizes
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
   * Report the entity-local AABB the renderer actually mounted for `catalogId` — stored per catalog
   * id as a blocking physical body and consulted after authored `colliders` and index-`dims` fitted
   * models, before the visual-scale fallback. The shell reports custom `renderObject` content and
   * dims-less models automatically, so a placed prop's body wraps its real rendered shape instead of
   * a unit-cube guess. Pass `null` to clear. Returns `false` when the bounds are degenerate.
   * @capability measured-colliders hitboxes and blocking bodies wrap what the renderer actually mounted — custom render props and dims-less models stop falling back to fixed-size boxes.
   */
  reportBounds(catalogId: string, bounds: MeasuredBounds | null): boolean;
  /**
   * Report the entity-local triangle soup the renderer actually mounted for `catalogId` — stored per
   * catalog id as a blocking physical body whose raycasts hit the real surface (a BVH over the
   * triangles) while movement obstruction keeps the conservative AABB. Consulted right after
   * authored `colliders` / index collision meshes and before the fitted-box, measured-bounds, and
   * visual-scale fallbacks. The shell reports rendered models automatically. Pass `null` to clear.
   * Returns `false` when no valid triangle survives.
   */
  reportCollisionMesh(catalogId: string, mesh: CollisionMeshSource | null): boolean;
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

/**
 * Request a transient spell/ability VFX burst. The easy path is a named `preset` —
 * `vfx({ preset: "arrow", from: caster, to: enemy })` renders a visible bolt with no color
 * or archetype tuning; `"lightning"`, `"web"`, `"slash"`, `"shield"`, `"heal"`, `"explosion"`
 * and the rest of {@link vfxPresets} likewise just work. `from`/`to` accept an instance id
 * (the shell follows its live pose) or a fixed world point. Anything you also pass — `kind`,
 * `color` (`0xRRGGBB`), `radius`, `durationMs` — overrides the preset; supply `kind` + `color`
 * yourself for a fully custom burst with no preset. `durationMs` defaults per `kind`.
 */
export interface VfxInput {
  /** A named visual flavor from {@link vfxPresets}. Fills in `kind`/`color`/defaults; explicit fields below still win. */
  preset?: VfxPresetName | (string & {});
  /** Visual archetype. Optional when `preset` is given; required otherwise. */
  kind?: VfxKind;
  /** `0xRRGGBB` tint. Optional when `preset` is given; required otherwise. */
  color?: number;
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
  /**
   * Report the entity-local AABB the renderer actually mounted for `kind` — stored per kind as a
   * tight damage hitbox and consulted after authored `colliders` and index-`dims` fitted models,
   * before the scale/humanoid-default fallbacks. The shell reports custom `renderEntity` content and
   * dims-less models automatically, so hitboxes wrap the rendered mesh instead of the fixed
   * 0.7×1.8×0.7 box. Runtime-measured on the client; authoritative hosts that never render should
   * author `colliders` or model `dims` instead. Pass `null` to clear. Returns `false` when the
   * bounds are degenerate.
   * @capability measured-hitboxes an entity rendered with a custom mesh takes hits in a box matching its rendered bounds, not the fixed humanoid rectangle.
   */
  reportBounds(kind: string, bounds: MeasuredBounds | null): boolean;
  /**
   * Report the entity-local triangle soup the renderer actually mounted for `kind` — stored per kind
   * as a damage hitbox that raycasts the model's own triangles (BVH), so shots aimed between a
   * character's feet or past its shoulder miss instead of hitting a bounding box. Consulted right
   * after authored `colliders` / index collision meshes and before the fitted-box and
   * measured-bounds fallbacks. The shell reports rendered models automatically; authoritative hosts
   * that never render should author `colliders` or index collision meshes for identical results.
   * Pass `null` to clear. Returns `false` when no valid triangle survives.
   * @capability conforming-hitboxes shots aimed between a character's feet or past its shoulder MISS — damage raycasts hit the rendered model's triangles, not its bounding box.
   */
  reportCollisionMesh(kind: string, mesh: CollisionMeshSource | null): boolean;
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

/** Reachable audio seam on `ctx.game`: `play`, `music`, and `resume` route through the `audio.play`/`audio.music`/`audio.resume` events the shell's audio engine listens on, so game code triggers sound without importing the shell. Retained `loop`/`setLoop`/`stopLoop` add id-keyed loops with live pitch/gain control over `audio.loopStart`/`audio.loopSet`/`audio.loopStop` (#1051). */
export interface GameAudio {
  play(sound: string, at?: readonly [number, number, number]): void;
  /** Crossfade the procedural soundtrack to `theme` (null fades out); `transpose` shifts the incoming theme's key in semitones. */
  music(theme: string | null, transpose?: number): void;
  resume(): void;
  /**
   * Start — or idempotently keep — the retained, id-keyed loop `id` playing catalog `sound`, emitting
   * `audio.loopStart`. Re-calling with the same `sound` does not restart it (no click); a different `sound`
   * replaces the source. Pair with {@link GameAudio.setLoop} to track a live signal — an RPM-pitched engine
   * loop, a slip-scaled tire squeal (#1051) — and {@link GameAudio.stopLoop} to end it.
   */
  loop(id: string, sound: string, options?: { at?: readonly [number, number, number] }): void;
  /**
   * Live-update retained loop `id` via `audio.loopSet`: `rate` re-pitches it (1 = authored pitch, clamped
   * 0.25–4 by the shell), `gain` rescales volume (0–1), `at` repositions its emitter. Cheap to call every
   * tick (~60 Hz) — the shell ramps rate/gain over ~20 ms to avoid zipper noise. A no-op when `id` is not a
   * live loop (an update may race a stop) (#1051).
   */
  setLoop(id: string, params: { rate?: number; gain?: number; at?: readonly [number, number, number] }): void;
  /** Stop and dispose retained loop `id` (emits `audio.loopStop`); an unknown `id` is ignored (#1051). */
  stopLoop(id: string): void;
}

/** The live engine handle a game's loop, systems, commands, and UI read and mutate — entities, objects, the reactive store, opted-in `game.*` subsystems, world queries, and the sim clock. One context = one running world. */
export interface GameContext {
  scene: {
    object: SceneObjectContext;
    entity: SceneEntityContext;
    worldItem: SceneWorldItemContext;
    raycast(input: SceneRaycastInput): SceneRaycastHit | null;
    raycastAll(input: SceneRaycastInput): readonly SceneRaycastHit[];
  };
  world: GameContextWorld;
  /**
   * Deterministic `[0,1)` stream for this world — loot, AI, combat rolls, and any sim path that
   * needs randomness. Same seed → same sequence. Never fall back to `Math.random` in systems;
   * pass this into pure helpers (`rollCheck`, `autoTarget`, loot tables, …).
   *
   * @capability game-context-rng per-world seeded randomness for replay, lockstep, and multi-world hosts
   */
  rng: () => number;
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
