/**
 * Constrain an uphill heightfield step by its sampled rise/run grade. Try the full step, then
 * X-only, then Z-only, preserving downhill travel and sliding along a traversable axis.
 * The sampler can represent a game's terrain policy independently of the ground used for feet.
 * This endpoint test also applies while jumping; it is not continuous terrain collision.
 * @capability uphill-grade-step constrain sampled heightfield ascent with axis sliding and a configurable terrain-policy sampler
 */
export function resolveTerrainGradeStep(
  sampler: { sampleHeight(x: number, z: number): number } | ((x: number, z: number) => number),
  position: readonly [number, number, number],
  stepX: number,
  stepZ: number,
  maxClimbGrade: number,
): { stepX: number; stepZ: number } {
  if (!Number.isFinite(maxClimbGrade) || maxClimbGrade < 0) {
    throw new RangeError("maxClimbGrade must be finite and nonnegative.");
  }
  const startX = position[0];
  const startZ = position[2];
  const sampleHeight = (x: number, z: number): number => {
    const height = typeof sampler === "function" ? sampler(x, z) : sampler.sampleHeight(x, z);
    if (!Number.isFinite(height)) {
      throw new RangeError(`climbGradeHeight/sampleHeight must return a finite height at (${x}, ${z}); received ${height}.`);
    }
    return height;
  };
  const height = sampleHeight(startX, startZ);
  const allowed = (dx: number, dz: number): boolean => {
    const distance = Math.hypot(dx, dz);
    return distance < 0.0001 || (sampleHeight(startX + dx, startZ + dz) - height) / distance <= maxClimbGrade;
  };
  if (allowed(stepX, stepZ)) return { stepX, stepZ };
  if (allowed(stepX, 0)) return { stepX, stepZ: 0 };
  if (allowed(0, stepZ)) return { stepX: 0, stepZ };
  return { stepX: 0, stepZ: 0 };
}
