import type { Lane } from "./course";

export const SECTOR_LENGTH = 400;
export const SECTOR_COUNT = 3;
export const TUNNEL_START_Z = -(SECTOR_COUNT * SECTOR_LENGTH) / 2;

export const LANE_WIDTH = 2.4;
export const LANE_COUNT = 3;

export const FLOOR_Y = 0;
export const CEILING_Y = 6.2;
export const TRAIN_ROOF_Y = 3.3;
export const BOT_HALF_HEIGHT = 0.5;

export const TUNNEL_HALF_WIDTH = 4.6;

export function laneX(lane: Lane): number {
  return (lane - 1) * LANE_WIDTH;
}

export function sectorWorldStart(sectorIndex: number): number {
  return TUNNEL_START_Z + sectorIndex * SECTOR_LENGTH;
}

export function worldZFor(sectorIndex: number, localZ: number): number {
  return sectorWorldStart(sectorIndex) + localZ;
}
