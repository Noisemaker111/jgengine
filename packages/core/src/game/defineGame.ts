import type { ActionCodesMap } from "../input/actionBindings";
import type { GameFeedOptions } from "./feed";
import type { ItemTraits } from "../inventory/inventoryModel";
import type { StorageTier } from "../inventory/storageTier";
import type { SaveConfig } from "../runtime/save";
import { createAssetCatalog, type AssetCatalog, type ModelAssetRef } from "../scene/assetCatalog";
import { createEntityStore, type EntityStore } from "../scene/entityStore";
import type { TimeConfig } from "../time/simClock";
import type { WorldFeature } from "../world/features";

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
}

/**
 * Opt-in `ctx.game.*` subsystems. Absent = off: the game doesn't carry (or expose) it, and `ctx.game.<name>`
 * is `undefined`. Present (`true`) builds it. The universal base — `commands`, `events`, `store`, `feed` — is
 * always on and not listed here. This is what keeps core genre-agnostic: a puzzle game isn't handed an MMO's
 * leaderboard/roster/turn plumbing it never asked for.
 */
export interface GameFeatures {
  /** Owned/captured entity roster (`ctx.game.roster`) — pet/monster collection games. */
  roster?: boolean;
  /** Card pile zones (`ctx.game.cards`) — deckbuilders, card games. */
  cards?: boolean;
  /** Turn/phase loop (`ctx.game.turn`) — turn-based games. */
  turn?: boolean;
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
  ui?: unknown;
  loop?: GameLoop<any>;
}

/** Input to {@link defineGame} — a `GameDefinition` with `scene` derived and `assets` optional. */
export type GameDefinitionConfig<
  TAssetRef extends ModelAssetRef = ModelAssetRef,
  TMultiplayer = unknown,
> = Omit<GameDefinition<TAssetRef, TMultiplayer>, "scene" | "assets"> & {
  assets?: AssetCatalog<TAssetRef>;
};

/** Task-first entry point for authoring a game: fills in `scene` and default `assets`, validates `name`. */
export function defineGame<TAssetRef extends ModelAssetRef, TMultiplayer>(
  config: GameDefinitionConfig<TAssetRef, TMultiplayer>,
): GameDefinition<TAssetRef, TMultiplayer> {
  if (config.name.trim().length === 0) {
    throw new Error("defineGame: name must be non-empty");
  }
  return { ...config, scene: createEntityStore(), assets: config.assets ?? createAssetCatalog() };
}
