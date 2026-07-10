import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { scatter, type ScatterConfig } from "@jgengine/core/world/scatter";
import type { Aabb } from "@jgengine/core/world/geometry";

import { ICE_GRID_CONFIG } from "../ice/build";
import { loopNormalAt, offsetPoint } from "../race/geometry";
import { CENTERLINE, CORRIDOR_LATERAL_OFFSET, SECTOR_GATES, toWorld } from "../race/track";
import { FLARE_OBJECT, PINE_OBJECTS, RIDGE_OBJECT, TENT_OBJECTS, type PineObjectId, type TentObjectId } from "../objects/catalog";

export interface ShoreProp {
  readonly id: string;
  readonly catalogId: PineObjectId | TentObjectId;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
}

const ICE_AABB: Aabb = {
  minX: ICE_GRID_CONFIG.originX,
  maxX: ICE_GRID_CONFIG.originX + ICE_GRID_CONFIG.width * ICE_GRID_CONFIG.cellSize,
  minZ: ICE_GRID_CONFIG.originZ,
  maxZ: ICE_GRID_CONFIG.originZ + ICE_GRID_CONFIG.height * ICE_GRID_CONFIG.cellSize,
};

const SHORE_BAND = 46;
const SHORE_AABB: Aabb = {
  minX: ICE_AABB.minX - SHORE_BAND,
  maxX: ICE_AABB.maxX + SHORE_BAND,
  minZ: ICE_AABB.minZ - SHORE_BAND,
  maxZ: ICE_AABB.maxZ + SHORE_BAND,
};

const PINE_SCATTER: ScatterConfig = {
  area: SHORE_AABB,
  count: 70,
  seed: "frostbite-circuit-pines",
  minDistance: 7,
  avoid: [ICE_AABB],
  avoidMargin: 5,
  jitter: 1,
};

function pineVariant(index: number): PineObjectId {
  return PINE_OBJECTS[index % PINE_OBJECTS.length]!;
}

function buildPines(): ShoreProp[] {
  return scatter(PINE_SCATTER).map((point, index) => ({
    id: `pine-${index}`,
    catalogId: pineVariant(index),
    position: [point.x, 0, point.z] as const,
    rotationY: ((point.index * 137.5) % 360) * (Math.PI / 180),
  }));
}

const CAMP_CENTER = toWorld(offsetPoint(CENTERLINE[0]!, loopNormalAt(CENTERLINE, 0), CORRIDOR_LATERAL_OFFSET.outer + 22));

function buildCamp(): ShoreProp[] {
  const tents: ShoreProp[] = [];
  const spacing = 8;
  const variants: TentObjectId[] = [TENT_OBJECTS[0]!, TENT_OBJECTS[1]!, TENT_OBJECTS[1]!, TENT_OBJECTS[1]!, TENT_OBJECTS[0]!, TENT_OBJECTS[1]!, TENT_OBJECTS[1]!, TENT_OBJECTS[0]!];
  for (let i = 0; i < variants.length; i += 1) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    tents.push({
      id: `tent-${i}`,
      catalogId: variants[i]!,
      position: [CAMP_CENTER[0] + col * spacing, 0, CAMP_CENTER[2] + row * spacing] as const,
      rotationY: Math.PI / 2,
    });
  }
  return tents;
}

export const SHORE_PROPS: readonly ShoreProp[] = [...buildPines(), ...buildCamp()];

export interface GateFlare {
  readonly id: string;
  readonly position: readonly [number, number, number];
}

const GATE_FLARE_OFFSET = 15;

export const GATE_FLARES: readonly GateFlare[] = SECTOR_GATES.flatMap((gate) => {
  const index = gate.corner * 2;
  const sampleIndex = gate.corner * 32;
  const normal = loopNormalAt(CENTERLINE, sampleIndex);
  const center = CENTERLINE[sampleIndex % CENTERLINE.length]!;
  return [
    { id: `flare-${index}`, position: toWorld(offsetPoint(center, normal, -GATE_FLARE_OFFSET), 0.5) },
    { id: `flare-${index + 1}`, position: toWorld(offsetPoint(center, normal, GATE_FLARE_OFFSET), 0.5) },
  ];
});

const RIDGE_GAP_OFFSETS: readonly number[] = [
  (CORRIDOR_LATERAL_OFFSET.inner + CORRIDOR_LATERAL_OFFSET.mid) / 2,
  (CORRIDOR_LATERAL_OFFSET.mid + CORRIDOR_LATERAL_OFFSET.outer) / 2,
];
const RIDGE_STRIDE = 8;

export interface RidgePost {
  readonly id: string;
  readonly position: readonly [number, number, number];
}

export const RIDGE_POSTS: readonly RidgePost[] = RIDGE_GAP_OFFSETS.flatMap((offset, gapIndex) => {
  const posts: RidgePost[] = [];
  for (let i = 0; i < CENTERLINE.length; i += RIDGE_STRIDE) {
    const point = offsetPoint(CENTERLINE[i]!, loopNormalAt(CENTERLINE, i), offset);
    posts.push({ id: `ridge-${gapIndex}-${i}`, position: toWorld(point, 0.2) });
  }
  return posts;
});

export function placeShoreProps(ctx: GameContext): void {
  for (const prop of SHORE_PROPS) {
    ctx.scene.object.remove(prop.id);
    ctx.scene.object.place(prop.catalogId, prop.position[0], prop.position[1], prop.position[2], {
      instanceId: prop.id,
      rotation: prop.rotationY,
    });
  }
  for (const flare of GATE_FLARES) {
    ctx.scene.object.remove(flare.id);
    ctx.scene.object.place(FLARE_OBJECT, flare.position[0], flare.position[1], flare.position[2], { instanceId: flare.id });
  }
  for (const post of RIDGE_POSTS) {
    ctx.scene.object.remove(post.id);
    ctx.scene.object.place(RIDGE_OBJECT, post.position[0], post.position[1], post.position[2], { instanceId: post.id });
  }
}
