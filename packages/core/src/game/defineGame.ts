import type { ActionCodesMap } from "../input/actionBindings";
import type { GameFeedOptions } from "./feed";
import type { ItemTraits } from "../inventory/inventoryModel";
import type { StorageTier } from "../inventory/storageTier";
import type { SaveConfig } from "../runtime/save";
import { createAssetCatalog, type AssetCatalog, type ModelAssetRef } from "../scene/assetCatalog";
import { createEntityStore, type EntityStore } from "../scene/entityStore";
import type { TimeConfig } from "../time/simClock";
import type { WorldFeature } from "../world/features";

export interface PhysicsConfig {
  gravity?: number;
  jumpVelocity?: number;
  /** Opt placed scene objects into projectile raycasts as blocking cover AABBs. Default false — enabling changes where shots land. */
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

export interface GameLoop<TContext = unknown> {
  onInit?(ctx: TContext): void;
  onNewPlayer?(ctx: TContext): void;
  onTick?(ctx: TContext, dt: number): void;
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
}

export interface GameDefinition<
  TAssetRef extends ModelAssetRef = ModelAssetRef,
  TMultiplayer = unknown,
> {
  name: string;
  assets: AssetCatalog<TAssetRef>;
  multiplayer: TMultiplayer;
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

export type GameDefinitionConfig<
  TAssetRef extends ModelAssetRef = ModelAssetRef,
  TMultiplayer = unknown,
> = Omit<GameDefinition<TAssetRef, TMultiplayer>, "scene" | "assets"> & {
  assets?: AssetCatalog<TAssetRef>;
};

export function defineGame<TAssetRef extends ModelAssetRef, TMultiplayer>(
  config: GameDefinitionConfig<TAssetRef, TMultiplayer>,
): GameDefinition<TAssetRef, TMultiplayer> {
  if (config.name.trim().length === 0) {
    throw new Error("defineGame: name must be non-empty");
  }
  return { ...config, scene: createEntityStore(), assets: config.assets ?? createAssetCatalog() };
}
