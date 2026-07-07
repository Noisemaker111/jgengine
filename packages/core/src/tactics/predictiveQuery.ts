import {
  resolveAreaTargets,
  type AreaTargetInput,
  type CombatSpatialDeps,
} from "../combat/effects";
import type { EntityPosition } from "../scene/entityStore";
import type { Aim, QueryArcOptions } from "../scene/spatial";
import type { Tile } from "./tacticalGrid";

export interface PredictiveDeps {
  spatial: CombatSpatialDeps;
  queryArc(options: QueryArcOptions): string[];
  canReceive?(instanceId: string, effect: string): string | null;
}

export interface PredictedTarget {
  instanceId: string;
  scale: number;
}

export interface AreaPredictInput extends AreaTargetInput {
  effect?: string;
  requireReceive?: boolean;
}

export interface ArcPredictInput {
  from: string;
  aim: Aim;
  radius: number;
  halfAngleDeg?: number;
  effect?: string;
  requireReceive?: boolean;
}

function receiveGate(
  deps: PredictiveDeps,
  effect: string | undefined,
  requireReceive: boolean,
): ((instanceId: string) => boolean) | undefined {
  if (!requireReceive || effect === undefined || deps.canReceive === undefined) return undefined;
  const gate = deps.canReceive;
  return (instanceId) => gate(instanceId, effect) === null;
}

export function predictAreaEffect(deps: PredictiveDeps, input: AreaPredictInput): PredictedTarget[] {
  const requireReceive = input.requireReceive ?? true;
  return resolveAreaTargets(deps.spatial, input, receiveGate(deps, input.effect, requireReceive));
}

export function predictArcEffect(deps: PredictiveDeps, input: ArcPredictInput): PredictedTarget[] {
  const requireReceive = input.requireReceive ?? true;
  const gate = receiveGate(deps, input.effect, requireReceive);
  const hit = deps.queryArc({
    from: input.from,
    aim: input.aim,
    radius: input.radius,
    ...(input.halfAngleDeg === undefined ? {} : { halfAngleDeg: input.halfAngleDeg }),
  });
  const targets: PredictedTarget[] = [];
  for (const instanceId of hit) {
    if (gate !== undefined && !gate(instanceId)) continue;
    targets.push({ instanceId, scale: 1 });
  }
  return targets;
}

export interface TilePredictInput {
  at: EntityPosition;
  radius: number;
  originTile: Tile;
  tileSize: number;
}

export function predictTiles(input: TilePredictInput): Tile[] {
  const reach = Math.ceil(input.radius / input.tileSize);
  const tiles: Tile[] = [];
  for (let dc = -reach; dc <= reach; dc += 1) {
    for (let dr = -reach; dr <= reach; dr += 1) {
      const worldX = input.at[0] + dc * input.tileSize;
      const worldZ = input.at[2] + dr * input.tileSize;
      const dx = worldX - input.at[0];
      const dz = worldZ - input.at[2];
      if (Math.sqrt(dx * dx + dz * dz) <= input.radius) {
        tiles.push([input.originTile[0] + dc, input.originTile[1] + dr]);
      }
    }
  }
  return tiles;
}
