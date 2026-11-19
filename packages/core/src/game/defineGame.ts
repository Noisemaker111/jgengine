import type { EditorDocument } from "../editor/types";
import type { ProjectileTravelDeps } from "../combat/projectiles";
import type { ActionCodesMap } from "../input/actionBindings";
import type { GameFeedOptions } from "../feed/feed";
import type { GamePhase } from "./gamePhase";
import type { SystemDefinition } from "./defineSystem";
import { mergeSystemFeatures } from "./defineSystem";
import { composeGameLoop } from "./systemRuntime";
import { buildNewGameWorld, giveNewGameStart, validateNewGame, type NewGameConfig } from "./newGame";
import type { ItemTraits } from "../inventory/inventoryModel";
import type { StorageTier } from "../inventory/storageTier";
import type { GameContext } from "../runtime/gameContext";
import type { ReplicationPolicy } from "../runtime/worldProjection";
import type { RuntimeSaveMode, RuntimeSaveOptions } from "../save/snapshotSave";
import type { SaveConfig } from "../save/saveConfig";
import type { SaveBackend } from "../save/saveStore";
import { createAssetCatalog, type AssetCatalog, type ModelAssetRef } from "../scene/assetCatalog";
import { createEntityStore, type EntityStore } from "../scene/entityStore";
import type { StoreHandle } from "../store/defineStore";
import type { TimeConfig } from "../time/simClock";
import type { SimulationConfig } from "../runtime/simLoop";
import type { WorldFeature } from "../world/features";
import { resolveWorldPhysics } from "../placement/place";
import type { PhysicsBackend } from "../physics/physicsBackend";
import type { CharacterControllerConfig } from "../movement/characterController";

/** Tunes offline whole-world save (`defineGameDefinition({ persist })`). Offline games already autosave to `localStorage` by default — pass this only to tune it (or `persist: false` to opt out). Defaults: continuous `autosave` to `localStorage`, one slot, no version. */
export interface PersistConfig {
  /** `"autosave"` (default) writes on a trailing timer while the world changes — at most once per `autosaveMs`, so a never-idle world (AI, physics, day/night) still persists; `"manual"` writes only on `ctx.game.save.checkpoint()` (save points / quest triggers). */
  mode?: RuntimeSaveMode;
  storage?: "local" | "memory" | SaveBackend;
  version?: number;
  migrate?: RuntimeSaveOptions["migrate"] | undefined;
  /** Autosave debounce in ms (autosave mode). Default 3000. */
  autosaveMs?: number;
}

export interface PhysicsConfig {
  gravity?: number | undefined;
  jumpVelocity?: number | undefined;
  /** Physics solver used by the shell movement controller and the context's physics stage. */
  backend?: PhysicsBackend;
  controller?: CharacterControllerConfig;
  projectileObstacles?: boolean;
}

export interface InventoryDeclaration {
  slots: number;
  hud?: string;
  accepts?: string | readonly string[];
  traits?: ItemTraits;
  applyModifiers?: boolean;
  tier?: StorageTier;
}

export type GameServerConfig = "persistent" | { mode: string; [key: string]: unknown };

export interface LoopPlayer {
  userId: string;
  isNew: boolean;
}

export interface GameLoop<TContext = unknown> {
  onInit?(ctx: TContext): void;
  onNewPlayer?(ctx: TContext, player?: LoopPlayer): void;
  onTick?(ctx: TContext, dt: number): void;
  /** Once per leave in a hosted world (never fired single-player). Despawn the player's entities / release their slots here. */
  onPlayerLeave?(ctx: TContext, player: LoopPlayer): void;
  onReset?(ctx: TContext): void;
  /** World teardown (mode switch, unmount). Composed system `dispose` hooks run here too. */
  onDispose?(ctx: TContext): void;
}

/**
 * A scope cleanups register onto, run in LIFO order exactly once — the shared shape behind every
 * teardown path in this codebase (a looping audio handle's source/gain nodes, a GPU texture swap on
 * entity/scene replacement). Registering after `dispose()` has already run invokes the cleanup
 * immediately instead of dropping it, so a resource created by a still-in-flight async step (e.g. a
 * decoded audio buffer) never leaks past a `stop()`/unmount that raced ahead of it.
 * @internal
 */
export interface DisposerScope {
  onDispose(cleanup: () => void): void;
}

/** @internal */
export interface Disposer extends DisposerScope {
  dispose(): void;
}

/** @internal */
export function createDisposer(): Disposer {
  const cleanups: Array<() => void> = [];
  let disposed = false;
  return {
    onDispose(cleanup) {
      if (disposed) {
        cleanup();
        return;
      }
      cleanups.push(cleanup);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      while (cleanups.length > 0) {
        cleanups.pop()!();
      }
    },
  };
}

/**
 * Opt-in `ctx.game.*` subsystems. Absent = off: the game doesn't carry (or expose) it, and `ctx.game.<name>`
 * is `undefined`. Present (`true`) builds it. The universal base — `commands`, `events`, `store`, `feed` — is
 * always on and not listed here. This is what keeps core genre-agnostic: a puzzle game isn't handed an MMO's
 * leaderboard/roster/turn plumbing it never asked for.
 */
export interface GameFeatures {
  quest?: boolean;
  trade?: boolean;
  unlocks?: boolean;
  cosmetics?: boolean;
  roster?: boolean;
  cards?: boolean;
  turn?: boolean;
  dialogue?: boolean;
  /** Lap/checkpoint race state (`ctx.game.race`) — racers. */
  race?: boolean;
  leaderboard?: boolean;
  social?: boolean;
  chat?: boolean;
  players?: boolean;
}

/**
 * Declarative start/restart run lifecycle: the state transitions a game's run phase every genre repeats
 * (title screen → live run → live run → title screen again), expressed as pure functions over one typed
 * {@link StoreHandle} slot instead of hand-rolled `commands.define("start"/"restart")` glue that re-derives
 * phase after every mutation. `start`/`restart` receive the store's own value type — the store's `TState`,
 * never `ctx.game.store.get(key) as T` — and return the next value; the runtime writes it back and derives
 * {@link GamePhase} from it via `phaseOf` in one place, so every adopting game gets identical, correct
 * phase-sync for free.
 *
 * @capability lifecycle declarative start/restart run flow — the engine owns the command glue and phase sync, the game supplies pure state transitions
 */
export interface LifecycleConfig<TState = unknown> {
  store: StoreHandle<TState>;
  start(state: TState, ctx: GameContext, input?: unknown): TState;
  /** Pure transition back into a fresh live run — same shape as `start` but never re-shows the menu first. */
  restart(state: TState, ctx: GameContext): TState;
  /** Derive the canonical {@link GamePhase} from the run state. The runtime calls this after every loop hook (`onInit`/`onNewPlayer`/`onTick`) as well as after `start`/`restart`, publishing the result only when it changed — so a game never hand-writes a per-tick `setGamePhase` ternary or its own previous-phase diff. */
  phaseOf(state: TState): GamePhase;
  commands?: {
    start?: string;
    restart?: string;
  };
}

/**
 * How a game declares its run-phase story to {@link defineGameDefinition}. Every game states this
 * explicitly so the shell never has to guess — a silent game used to default to `"playing"`, which
 * painted the touch dock over title/menu/results screens (#1337, Harbor Heat #1329).
 *
 * - A {@link LifecycleConfig} — the game moves through menu/playing/paused/ended run states; the
 *   runtime owns the command glue and phase sync.
 * - `"always-live"` — an explicit, truthful declaration that the game has **no** menu/pause/end
 *   screens and runs live from boot. Runtime behaviour is identical to declaring no lifecycle at all
 *   (no phase sync, no start/restart commands), but the intent is now *stated*, not implied by
 *   silence. Games that instead drive phases by hand call {@link setGamePhase} directly and leave
 *   this unset.
 */
export type GameLifecycle<TState = unknown> = LifecycleConfig<TState> | "always-live";

export interface GameProjectileTravelOptions extends Pick<ProjectileTravelDeps, "maxActive" | "maxRetained"> {
  /** Collision-source limit, default 2048; an oversized source throws rather than dropping targets. */
  maxTargets?: number;
  sweep?: (ctx: GameContext, ...args: Parameters<NonNullable<ProjectileTravelDeps["sweep"]>>) => ReturnType<NonNullable<ProjectileTravelDeps["sweep"]>>;
  acceleration?: (ctx: GameContext, ...args: Parameters<NonNullable<ProjectileTravelDeps["acceleration"]>>) => ReturnType<NonNullable<ProjectileTravelDeps["acceleration"]>>;
  /** Bounded entity IDs for the default moving-target query; omission uses this world's entities. */
  targets?(ctx: GameContext): readonly string[];
}

export interface GameDefinition<
  TAssetRef extends ModelAssetRef = ModelAssetRef,
  TMultiplayer = unknown,
> {
  name: string;
  assets: AssetCatalog<TAssetRef>;
  multiplayer: TMultiplayer;
  /** @deprecated No longer the runtime store — `createGameContext` mints a fresh per-context `EntityStore` so one host can serve many worlds without state bleed (#632). Retained only for API compatibility; read `ctx.scene.entity` instead. */
  scene: EntityStore;
  features?: GameFeatures | undefined;
  /**
   * Composable game capabilities — the preferred authoring path for runtime behavior.
   * Each system owns timing, events, and optional save/replication/reset/disposal.
   * Installing a system with `feature` enables that `ctx.game.*` capability without a redundant flag.
   * Classic `loop` hooks still run for incremental migration (systems tick first, then `loop.onTick`).
   */
  systems?: readonly SystemDefinition[];
  world?: WorldFeature;
  authoredDocument?: EditorDocument;
  /** Bounded projectile travel providers receive their live world; the authoritative clock stays engine-owned. */
  projectileTravel?: GameProjectileTravelOptions;
  /** Optional pursuit target policy; callbacks are world-local injections, never saved behavior data. */
  pursuit?: {
    /** Additional eligibility for nearest, held, explicit and forced targets at scheduled pursuit ticks.
     * Receives the live world and entity IDs; cannot bypass self/existence/effect acceptance checks.
     * Omission retains player-role acquisition; explicit targets may still name nonplayers.
     * A supplied callback must return exactly true to accept; missing, null or asynchronous results deny.
     * Keep this pair query bounded (for example, a caller-owned faction roster lookup).
     */
    eligible(ctx: GameContext, selfId: string, candidateId: string): boolean;
  };
  physics?: PhysicsConfig;
  time?: TimeConfig;
  /** How the simulation is stepped — a fixed `hz` with render interpolation, or `"variable"` (default) once per frame. Exposed as `ctx.sim`. */
  simulation?: SimulationConfig;
  feed?: GameFeedOptions;
  inventories?: Record<string, InventoryDeclaration>;
  input?: ActionCodesMap;
  server?: GameServerConfig;
  save?: SaveConfig;
  persist?: boolean | PersistConfig;
  ui?: unknown;
  /**
   * What the player has at second 0, as data: cash, kit, unlocks, prebuilt pieces and the systems
   * that work for the player on their own. The engine builds every new game from it (pieces after
   * `onInit`, the rest after `onNewPlayer` for each new player) and checks read it from here.
   */
  newGame?: NewGameConfig;
  loop?: GameLoop<GameContext>;
  /**
   * Resolved run lifecycle — see {@link LifecycleConfig}. The config boundary also accepts the
   * `"always-live"` sentinel ({@link GameLifecycle}); {@link defineGameDefinition} resolves that to
   * `undefined` here, so a resolved definition only ever carries a real {@link LifecycleConfig} or
   * nothing.
   */
  lifecycle?: LifecycleConfig | undefined;
  /**
   * Host-side per-viewer replication policy — private-state and area-of-interest projection over the
   * wire. Applied on every authoritative host (ws, Convex, loopback); clients need not set it. Unset
   * replicates the whole world to every client (today's behavior). Changes only what each client sees,
   * never the simulation, so the game plays identically with or without it.
   */
  replication?: ReplicationPolicy;
}

export type GameDefinitionConfig<
  TAssetRef extends ModelAssetRef = ModelAssetRef,
  TMultiplayer = unknown,
> = Omit<GameDefinition<TAssetRef, TMultiplayer>, "scene" | "assets" | "lifecycle"> & {
  assets?: AssetCatalog<TAssetRef>;
  /**
   * The game's run-phase story — a {@link LifecycleConfig} or the `"always-live"` sentinel. Every
   * game must state one (or drive phases by hand via {@link setGamePhase}).
   * See {@link GameLifecycle}.
   */
  lifecycle?: GameLifecycle;
};

function withNewGame(loop: GameLoop<GameContext>, config: GameDefinitionConfig<ModelAssetRef, unknown>): GameLoop<GameContext> {
  const newGame = config.newGame;
  if (newGame === undefined) return loop;
  const inventories = Object.keys(config.inventories ?? {});
  validateNewGame(newGame, { inventories, systems: (config.systems ?? []).map((system) => system.id) });
  return {
    ...loop,
    onInit(ctx) {
      loop.onInit?.(ctx);
      buildNewGameWorld(ctx, newGame);
    },
    onNewPlayer(ctx, player) {
      loop.onNewPlayer?.(ctx, player);
      if (player === undefined ? ctx.player.isNew : player.isNew) giveNewGameStart(ctx, newGame, player?.userId ?? ctx.player.userId, inventories);
    },
  };
}

export function defineGameDefinition<TAssetRef extends ModelAssetRef, TMultiplayer>(
  config: GameDefinitionConfig<TAssetRef, TMultiplayer>,
): GameDefinition<TAssetRef, TMultiplayer> {
  if (config.name.trim().length === 0) {
    throw new Error("defineGameDefinition: name must be non-empty");
  }
  // Boolean `features: { quest: true }` is sugar for the same activation map systems produce via
  // `feature: "quest"`. Both OR-merge here; `createGameContext` only reads this final map through
  // featureDescriptors.enabled — one enable path, no dual checks at install time.
  const features = mergeSystemFeatures(config.features, config.systems);
  const loop = withNewGame(composeGameLoop(config.systems, config.loop), config);
  // A place world carries the laws of that place: its physics resolves over the game-level default,
  // so every consumer of definition.physics (movement, combat, shell) sees the active world's laws.
  const physics = resolveWorldPhysics(config.world, config.physics);
  // `"always-live"` is an explicit "no lifecycle sync" declaration — resolve the sentinel to
  // `undefined` so every downstream consumer only ever sees a real LifecycleConfig or nothing,
  // exactly as before the sentinel existed. The statement was for the gate, not the runtime.
  const lifecycle: LifecycleConfig | undefined =
    config.lifecycle === "always-live" ? undefined : config.lifecycle;
  return {
    ...config,
    ...(physics === undefined ? {} : { physics }),
    features,
    loop,
    lifecycle,
    scene: createEntityStore(),
    assets: config.assets ?? createAssetCatalog(),
  };
}
