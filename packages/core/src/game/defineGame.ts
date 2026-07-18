import type { ActionCodesMap } from "../input/actionBindings";
import type { GameFeedOptions } from "./feed";
import type { GamePhase } from "./gamePhase";
import type { SystemDefinition } from "./defineSystem";
import { mergeSystemFeatures } from "./defineSystem";
import { composeGameLoop } from "./systemRuntime";
import type { ItemTraits } from "../inventory/inventoryModel";
import type { StorageTier } from "../inventory/storageTier";
import type { GameContext } from "../runtime/gameContext";
import type { ReplicationPolicy } from "../runtime/worldProjection";
import type { RuntimeSaveMode } from "../runtime/runtimeSave";
import type { SaveConfig } from "../runtime/save";
import { createAssetCatalog, type AssetCatalog, type ModelAssetRef } from "../scene/assetCatalog";
import { createEntityStore, type EntityStore } from "../scene/entityStore";
import type { StoreHandle } from "../store/defineStore";
import type { TimeConfig } from "../time/simClock";
import type { WorldFeature } from "../world/features";

/** Tunes offline whole-world save (`defineGame({ persist })`). Defaults: continuous `autosave` to `localStorage`, one slot, no version. */
export interface PersistConfig {
  /** `"autosave"` (default) writes on a debounce after any change; `"manual"` writes only on `ctx.game.save.checkpoint()` (save points / quest triggers). */
  mode?: RuntimeSaveMode;
  /** `"local"` (default) persists to `localStorage`; `"memory"` keeps saves in-session only (tests, "no persistence" mode). */
  storage?: "local" | "memory";
  /** Save-format version; bump when the world shape changes in a save-breaking way. */
  version?: number;
  /** Autosave debounce in ms (autosave mode). Default 3000. */
  autosaveMs?: number;
}

/** World gravity and jump tuning, plus scene-object collision opt-ins, for the game's physics step. */
export interface PhysicsConfig {
  gravity?: number;
  jumpVelocity?: number;
  /** Opt placed scene objects into projectile raycasts as blocking cover AABBs. Default false — enabling changes where shots land. */
  projectileObstacles?: boolean;
}

/** Shape of one named inventory a game declares — slot count, accepted item types, HUD binding. */
export interface InventoryDeclaration {
  slots: number;
  hud?: string;
  accepts?: string | readonly string[];
  traits?: ItemTraits;
  applyModifiers?: boolean;
  tier?: StorageTier;
}

/** Hosting mode for a game's multiplayer server: `"persistent"`, or a custom mode with its own options. */
export type GameServerConfig = "persistent" | { mode: string; [key: string]: unknown };

/** Identity of a player joining or leaving a hosted world — passed to the multiplayer loop hooks. */
export interface LoopPlayer {
  userId: string;
  isNew: boolean;
}

/** Lifecycle hooks a game implements to drive init, per-tick simulation, and player join/leave. */
export interface GameLoop<TContext = unknown> {
  onInit?(ctx: TContext): void;
  /** Once per join. `player` identifies the joiner in a hosted world; single-player callers may omit it. */
  onNewPlayer?(ctx: TContext, player?: LoopPlayer): void;
  onTick?(ctx: TContext, dt: number): void;
  /** Once per leave in a hosted world (never fired single-player). Despawn the player's entities / release their slots here. */
  onPlayerLeave?(ctx: TContext, player: LoopPlayer): void;
  /** Scenario/run reset — clear run-scoped state. Composed system `reset` hooks run here too. */
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
  /** Quest/mission journal (`ctx.game.quest`) — quest-driven games. */
  quest?: boolean;
  /** Shop/vendor barter (`ctx.game.trade`) — games with buy/sell economies. */
  trade?: boolean;
  /** Earned unlockable content (`ctx.game.unlocks`) — progression-gated games. */
  unlocks?: boolean;
  /** Cosmetic skins/customization (`ctx.player.cosmetics`) — appearance-customization games. */
  cosmetics?: boolean;
  /** Owned/captured entity roster (`ctx.game.roster`) — pet/monster collection games. */
  roster?: boolean;
  /** Card pile zones (`ctx.game.cards`) — deckbuilders, card games. */
  cards?: boolean;
  /** Turn/phase loop (`ctx.game.turn`) — turn-based games. */
  turn?: boolean;
  /** Talkable-NPC dialogue bridge (`ctx.game.dialogue`) — auto-registers `dialogue.open`/`dialogue.close`; dialogue-driven games. */
  dialogue?: boolean;
  /** Lap/checkpoint race state (`ctx.game.race`) — racers. */
  race?: boolean;
  /** Competitive score tracking (`ctx.game.leaderboard`) — ranked/arcade games. */
  leaderboard?: boolean;
  /** Friends/party/presence/emotes/world-invites (`ctx.game.social`) — social/MMO games. */
  social?: boolean;
  /** Channels + messages (`ctx.game.chat`) — implies `social`; multiplayer/social games. */
  chat?: boolean;
  /** Connected-player set (`ctx.game.players`) — shared-world hosts whose loop ticks every player, not just `ctx.player`. */
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
  /** The store slot holding this game's run state; `start`/`restart` transform its current value. */
  store: StoreHandle<TState>;
  /** Pure transition into a live run. `input` is whatever the `start` command was invoked with (e.g. a chosen difficulty/tier). */
  start(state: TState, ctx: GameContext, input?: unknown): TState;
  /** Pure transition back into a fresh live run — same shape as `start` but never re-shows the menu first. */
  restart(state: TState, ctx: GameContext): TState;
  /** Derive the canonical {@link GamePhase} from the run state. The runtime calls this after every loop hook (`onInit`/`onNewPlayer`/`onTick`) as well as after `start`/`restart`, publishing the result only when it changed — so a game never hand-writes a per-tick `setGamePhase` ternary or its own previous-phase diff. */
  phaseOf(state: TState): GamePhase;
  /** Override the registered command names — default `"start"`/`"restart"` — for games whose input bindings already name them differently. */
  commands?: {
    start?: string;
    restart?: string;
  };
}

/** Fully-resolved game description produced by {@link defineGame} — assets, scene, and opted-in subsystems. */
export interface GameDefinition<
  TAssetRef extends ModelAssetRef = ModelAssetRef,
  TMultiplayer = unknown,
> {
  name: string;
  assets: AssetCatalog<TAssetRef>;
  multiplayer: TMultiplayer;
  /** @deprecated No longer the runtime store — `createGameContext` mints a fresh per-context `EntityStore` so one host can serve many worlds without state bleed (#632). Retained only for API compatibility; read `ctx.scene.entity` instead. */
  scene: EntityStore;
  /** Opt-in `ctx.game.*` subsystems beyond the always-on base; omitted systems are `undefined` on `ctx.game`. */
  features?: GameFeatures;
  /**
   * Composable game capabilities — the preferred authoring path for runtime behavior.
   * Each system owns timing, events, and optional save/replication/reset/disposal.
   * Installing a system with `feature` enables that `ctx.game.*` capability without a redundant flag.
   * Classic `loop` hooks still run for incremental migration (systems tick first, then `loop.onTick`).
   */
  systems?: readonly SystemDefinition[];
  world?: WorldFeature;
  physics?: PhysicsConfig;
  /** Simulation clock: real→game time scale, selectable speeds, calendar. Exposed as `ctx.time`; the shell feeds its scaled dt to `loop.onTick`. */
  time?: TimeConfig;
  /** Per-action ring-buffer capacity for `ctx.game.feed`. Default 20. */
  feed?: GameFeedOptions;
  inventories?: Record<string, InventoryDeclaration>;
  input?: ActionCodesMap;
  server?: GameServerConfig;
  save?: SaveConfig;
  /** Offline/single-player whole-world save. `true` autosaves the entire game to `localStorage`; a config object tunes the mode/cadence/target. Binds `ctx.game.save` — the game drives save points and restore. Ignored for multiplayer worlds (the host persists). */
  persist?: boolean | PersistConfig;
  ui?: unknown;
  loop?: GameLoop<GameContext>;
  /** Declarative start/restart run lifecycle — see {@link LifecycleConfig}. Omitted games keep hand-rolling their own commands. */
  lifecycle?: LifecycleConfig;
  /**
   * Host-side per-viewer replication policy — private-state and area-of-interest projection over the
   * wire. Applied on every authoritative host (ws, Convex, loopback); clients need not set it. Unset
   * replicates the whole world to every client (today's behavior). Changes only what each client sees,
   * never the simulation, so the game plays identically with or without it.
   */
  replication?: ReplicationPolicy;
}

/** Input to {@link defineGame} — a `GameDefinition` with `scene` derived and `assets` optional. */
export type GameDefinitionConfig<
  TAssetRef extends ModelAssetRef = ModelAssetRef,
  TMultiplayer = unknown,
> = Omit<GameDefinition<TAssetRef, TMultiplayer>, "scene" | "assets"> & {
  assets?: AssetCatalog<TAssetRef>;
};

/**
 * Task-first entry point for authoring a game: fills in `scene` and default `assets`, validates `name`,
 * OR-merges `features` from installed systems, and composes `loop` from `systems` + any classic hooks.
 *
 * @capability define-game single public game-authoring path — compose systems, world, and loop in one definition
 */
export function defineGame<TAssetRef extends ModelAssetRef, TMultiplayer>(
  config: GameDefinitionConfig<TAssetRef, TMultiplayer>,
): GameDefinition<TAssetRef, TMultiplayer> {
  if (config.name.trim().length === 0) {
    throw new Error("defineGame: name must be non-empty");
  }
  // Boolean `features: { quest: true }` is sugar for the same activation map systems produce via
  // `feature: "quest"`. Both OR-merge here; `createGameContext` only reads this final map through
  // featureDescriptors.enabled — one enable path, no dual checks at install time.
  const features = mergeSystemFeatures(config.features, config.systems);
  const loop = composeGameLoop(config.systems, config.loop);
  return {
    ...config,
    features,
    loop,
    scene: createEntityStore(),
    assets: config.assets ?? createAssetCatalog(),
  };
}
