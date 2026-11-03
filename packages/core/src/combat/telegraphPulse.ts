import type { TelegraphShape } from "./telegraph";

/** @internal */
export function telegraphPulseOpacity(bornMs: number, windupMs: number, nowMs: number): number {
  const progress = Math.max(0, Math.min(1, (nowMs - bornMs) / Math.max(1, windupMs)));
  return 0.45 + 0.5 * progress;
}

/**
 * Where a telegraph decal sits and how it turns, so the drawn area is the area `pointInTelegraph`
 * hits: laid flat, then a cone's arc (drawn around local +X) and a line's length (local Y) turned to
 * the yaw `dir` (`atan2(dx, dz)`).
 * @internal
 */
export function telegraphDecalPose(
  shape: TelegraphShape,
  at: readonly [number, number, number],
  dir: number,
): { position: [number, number, number]; rotation: [number, number, number] } {
  const forwardOffset = shape.kind === "line" ? shape.length / 2 : 0;
  const spin = shape.kind === "cone" ? dir - Math.PI / 2 : shape.kind === "line" ? Math.PI + dir : 0;
  return {
    position: [at[0] + Math.sin(dir) * forwardOffset, at[1] + 0.06, at[2] + Math.cos(dir) * forwardOffset],
    rotation: [-Math.PI / 2, 0, spin],
  };
}
