export type Team = "cyan" | "magenta";

export const PITCH_RX = 26;
export const PITCH_RZ = 16;
export const GOAL_HALF_WIDTH = 4;
export const GOAL_LINE_X = PITCH_RX;
export const CENTER_CIRCLE_RADIUS = 5;
export const ARENA_BOUNDS_W = (PITCH_RX + 18) * 2;
export const ARENA_BOUNDS_D = (PITCH_RZ + 16) * 2;

export type Vec2 = readonly [number, number];

function normalizedRadiusSquared(x: number, z: number, marginX: number, marginZ: number): number {
  const rx = PITCH_RX - marginX;
  const rz = PITCH_RZ - marginZ;
  const nx = x / rx;
  const nz = z / rz;
  return nx * nx + nz * nz;
}

export function isInsidePitch(x: number, z: number, margin = 0): boolean {
  return normalizedRadiusSquared(x, z, margin, margin) <= 1;
}

export function clampToPitch([x, z]: Vec2, margin = 0): Vec2 {
  const r2 = normalizedRadiusSquared(x, z, margin, margin);
  if (r2 <= 1) return [x, z];
  const scale = 1 / Math.sqrt(r2);
  return [x * scale, z * scale];
}

export function pitchBoundaryNormal(x: number, z: number): Vec2 {
  const nx = x / (PITCH_RX * PITCH_RX);
  const nz = z / (PITCH_RZ * PITCH_RZ);
  const len = Math.hypot(nx, nz);
  if (len < 1e-6) return [1, 0];
  return [nx / len, nz / len];
}

export function scoringTeamFor(x: number, z: number): Team | null {
  if (Math.abs(z) > GOAL_HALF_WIDTH) return null;
  if (x <= -GOAL_LINE_X) return "magenta";
  if (x >= GOAL_LINE_X) return "cyan";
  return null;
}

export function ownGoalX(team: Team): number {
  return team === "cyan" ? -GOAL_LINE_X : GOAL_LINE_X;
}

export function opponentGoalX(team: Team): number {
  return team === "cyan" ? GOAL_LINE_X : -GOAL_LINE_X;
}

export function distance2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}
