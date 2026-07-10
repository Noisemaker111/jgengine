import { GOAL_HALF_WIDTH, PITCH_RX, PITCH_RZ } from "../arena/geometry";

export interface DressingPlacement {
  catalogId: string;
  x: number;
  z: number;
  rotationY: number;
  scale: readonly [number, number, number];
  color: string;
}

export const WALL_SEGMENT = "wall_segment";
export const TOWER_FLOOD = "tower_flood";
export const STAND_BLOCK = "stand_block";
export const BANNER_CYAN = "banner_cyan";
export const BANNER_MAGENTA = "banner_magenta";

export const BASALT = "#23201d";
export const BASALT_LIGHT = "#332e28";
export const ASH_SAND = "#cdb891";
export const ASH_SAND_DARK = "#a68f6b";
export const CYAN = "#3bc7c4";
export const MAGENTA = "#d94a8c";

const GOAL_GAP_HALF_ANGLE = Math.asin(GOAL_HALF_WIDTH / PITCH_RZ);

function isGoalGapAngle(theta: number): boolean {
  const normalized = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const nearEast = normalized <= GOAL_GAP_HALF_ANGLE || normalized >= 2 * Math.PI - GOAL_GAP_HALF_ANGLE;
  const nearWest = Math.abs(normalized - Math.PI) <= GOAL_GAP_HALF_ANGLE;
  return nearEast || nearWest;
}

export function generateWallSegments(count = 56): DressingPlacement[] {
  const segments: DressingPlacement[] = [];
  for (let i = 0; i < count; i += 1) {
    const theta = (i / count) * Math.PI * 2;
    if (isGoalGapAngle(theta)) continue;
    const x = PITCH_RX * Math.cos(theta);
    const z = PITCH_RZ * Math.sin(theta);
    const tangentX = -PITCH_RX * Math.sin(theta);
    const tangentZ = PITCH_RZ * Math.cos(theta);
    const rotationY = Math.atan2(tangentX, tangentZ);
    const shade = i % 3 === 0 ? BASALT_LIGHT : BASALT;
    segments.push({
      catalogId: WALL_SEGMENT,
      x,
      z,
      rotationY,
      scale: [1.5, 2.4, 1.9],
      color: shade,
    });
  }
  return segments;
}

export function generateFloodlightTowers(): DressingPlacement[] {
  const corners: readonly [number, number][] = [
    [-(PITCH_RX + 9), -(PITCH_RZ + 8)],
    [PITCH_RX + 9, -(PITCH_RZ + 8)],
    [-(PITCH_RX + 9), PITCH_RZ + 8],
    [PITCH_RX + 9, PITCH_RZ + 8],
  ];
  return corners.map(([x, z], index) => ({
    catalogId: TOWER_FLOOD,
    x,
    z,
    rotationY: (index * Math.PI) / 6,
    scale: [1.4, 11, 1.4] as const,
    color: "#161310",
  }));
}

export function generateCrowdStands(blocksPerRow = 9, tiers = 2): DressingPlacement[] {
  const stands: DressingPlacement[] = [];
  const spanStart = -PITCH_RX + 6;
  const spanLength = PITCH_RX * 2 - 12;
  for (const side of [-1, 1] as const) {
    for (let tier = 0; tier < tiers; tier += 1) {
      const z = side * (PITCH_RZ + 5 + tier * 3.4);
      const height = 2.4 + tier * 1.6;
      const color = tier === 0 ? ASH_SAND : ASH_SAND_DARK;
      for (let i = 0; i < blocksPerRow; i += 1) {
        const x = spanStart + (spanLength * (i + 0.5)) / blocksPerRow;
        stands.push({
          catalogId: STAND_BLOCK,
          x,
          z,
          rotationY: 0,
          scale: [3.1, height, 2.6],
          color,
        });
      }
    }
  }
  return stands;
}

export function generateBanners(perGoal = 3): DressingPlacement[] {
  const banners: DressingPlacement[] = [];
  const spread = PITCH_RZ * 1.2;
  for (let i = 0; i < perGoal; i += 1) {
    const z = -spread + (2 * spread * i) / Math.max(1, perGoal - 1);
    banners.push({
      catalogId: BANNER_CYAN,
      x: -(PITCH_RX + 3.2),
      z,
      rotationY: Math.PI / 2,
      scale: [0.18, 3.2, 1.6],
      color: CYAN,
    });
    banners.push({
      catalogId: BANNER_MAGENTA,
      x: PITCH_RX + 3.2,
      z,
      rotationY: Math.PI / 2,
      scale: [0.18, 3.2, 1.6],
      color: MAGENTA,
    });
  }
  return banners;
}

export function generateArenaDressing(): readonly DressingPlacement[] {
  return [...generateWallSegments(), ...generateFloodlightTowers(), ...generateCrowdStands(), ...generateBanners()];
}
