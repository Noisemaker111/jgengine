export type FlowVec3 = readonly [number, number, number];

export interface FlowTubeConfig {
  from: FlowVec3;
  to: FlowVec3;
  /** Tube radius; flow strength fades from the axis to zero here. */
  radius: number;
  /** Axial flow speed on the core at full spool. */
  strength: number;
  /** Radial falloff exponent — `1` linear, `2` (default) keeps a fat core with soft edges. */
  falloff?: number;
  /** Extra reach past each end where the axial envelope fades to zero; default `0` (hard caps). */
  capFalloff?: number;
}

/**
 * An axial corridor of directional flow with radial core falloff and a spool scalar — fan tunnels,
 * updraft shafts, river narrows, thruster wash. Pure math: sample `velocityAt(point, spool)` and add
 * it to whatever integrator moves the body (walk controller drift, `BuoyantBody`, a custom sim).
 */
export interface FlowTube {
  readonly axis: FlowVec3;
  readonly length: number;
  /** Flow velocity at a world point, scaled by `spool` in `[0, 1]` (default `1`); zero outside the tube. */
  velocityAt(point: FlowVec3, spool?: number): FlowVec3;
  /** The radial × axial envelope in `[0, 1]` at a world point — feed particle density, audio gain, rumble. */
  intensityAt(point: FlowVec3): number;
}

export function createFlowTube(config: FlowTubeConfig): FlowTube {
  if (!(config.radius > 0)) throw new Error(`flow tube radius must be positive, got ${config.radius}`);
  const [fx, fy, fz] = config.from;
  const dx = config.to[0] - fx;
  const dy = config.to[1] - fy;
  const dz = config.to[2] - fz;
  const length = Math.hypot(dx, dy, dz);
  if (length <= 1e-9) throw new Error("flow tube needs distinct from/to points");
  const axis: FlowVec3 = [dx / length, dy / length, dz / length];
  const falloff = config.falloff ?? 2;
  const capFalloff = Math.max(0, config.capFalloff ?? 0);

  function envelopeAt(point: FlowVec3): number {
    const px = point[0] - fx;
    const py = point[1] - fy;
    const pz = point[2] - fz;
    const along = px * axis[0] + py * axis[1] + pz * axis[2];
    if (along < -capFalloff || along > length + capFalloff) return 0;
    const axial =
      capFalloff <= 0
        ? along >= 0 && along <= length
          ? 1
          : 0
        : along < 0
          ? 1 + along / capFalloff
          : along > length
            ? 1 - (along - length) / capFalloff
            : 1;
    if (axial <= 0) return 0;
    const rx = px - axis[0] * along;
    const ry = py - axis[1] * along;
    const rz = pz - axis[2] * along;
    const radial = Math.hypot(rx, ry, rz);
    if (radial >= config.radius) return 0;
    return axial * Math.pow(1 - radial / config.radius, falloff);
  }

  return {
    axis,
    length,
    velocityAt(point, spool = 1) {
      const scale = envelopeAt(point) * config.strength * Math.max(0, Math.min(1, spool));
      return scale <= 0 ? [0, 0, 0] : [axis[0] * scale, axis[1] * scale, axis[2] * scale];
    },
    intensityAt: envelopeAt,
  };
}

/** Sum several tubes' flow at one point — each entry carries its own spool. */
export function combineFlowVelocity(
  tubes: readonly (FlowTube | { tube: FlowTube; spool: number })[],
  point: FlowVec3,
): FlowVec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const entry of tubes) {
    const tube = "velocityAt" in entry ? entry : entry.tube;
    const spool = "velocityAt" in entry ? 1 : entry.spool;
    const [vx, vy, vz] = tube.velocityAt(point, spool);
    x += vx;
    y += vy;
    z += vz;
  }
  return [x, y, z];
}
