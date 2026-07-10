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

export interface GameDefinition<
  TAssetRef extends ModelAssetRef = ModelAssetRef,
  TMultiplayer = unknown,
> {
  name: string;
  assets: AssetCatalog<TAssetRef>;
  multiplayer: TMultiplayer;
  scene: EntityStore;
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
