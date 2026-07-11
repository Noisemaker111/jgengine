export type SwingVec3 = readonly [number, number, number];

export interface GrappleSwingConfig {
  /** Rope shortens by this many units/s while `reeling`. Default `0` (fixed length). */
  reelSpeed?: number;
  minLength?: number;
  /** Extra spring pull toward the anchor when the rope is taut (elastic feel); default `0` (hard constraint only). */
  stiffness?: number;
  /** Velocity damping per second while attached; default `0.1`. */
  damping?: number;
}

export interface GrappleSwingState {
  attached: boolean;
  anchor: SwingVec3 | null;
  ropeLength: number;
}

export interface GrappleSwingStep {
  position: SwingVec3;
  velocity: SwingVec3;
}

/**
 * A rope-swing constraint for kinematic controllers (#282.5) — the walk-controller-compatible
 * sibling of `physics/traversal`'s rigid-body `Grapple`. Fire at an anchor, feed each frame's
 * integrated position/velocity through `step`, and commit what comes back (via `beforeCommit`
 * or `setPose`): positions beyond the rope clamp to its sphere and velocity loses its outward
 * radial component, which is exactly a pendulum swing.
 */
export interface GrappleSwing {
  fire(anchor: SwingVec3, from: SwingVec3): void;
  release(): void;
  state(): GrappleSwingState;
  /** Constrain one frame. `reeling` shortens the rope; returns the corrected position/velocity. */
  step(position: SwingVec3, velocity: SwingVec3, dt: number, reeling?: boolean): GrappleSwingStep;
}

export function createGrappleSwing(config: GrappleSwingConfig = {}): GrappleSwing {
  const reelSpeed = config.reelSpeed ?? 0;
  const minLength = config.minLength ?? 1;
  const stiffness = config.stiffness ?? 0;
  const damping = config.damping ?? 0.1;

  let anchor: SwingVec3 | null = null;
  let ropeLength = 0;

  return {
    fire(nextAnchor, from) {
      anchor = nextAnchor;
      ropeLength = Math.max(
        minLength,
        Math.hypot(from[0] - nextAnchor[0], from[1] - nextAnchor[1], from[2] - nextAnchor[2]),
      );
    },
    release() {
      anchor = null;
    },
    state: () => ({ attached: anchor !== null, anchor, ropeLength }),
    step(position, velocity, dt, reeling = false) {
      if (anchor === null || dt <= 0) return { position, velocity };
      if (reeling && reelSpeed > 0) ropeLength = Math.max(minLength, ropeLength - reelSpeed * dt);

      let px = position[0];
      let py = position[1];
      let pz = position[2];
      let vx = velocity[0];
      let vy = velocity[1];
      let vz = velocity[2];

      const dx = px - anchor[0];
      const dy = py - anchor[1];
      const dz = pz - anchor[2];
      const distance = Math.hypot(dx, dy, dz);
      if (distance > ropeLength && distance > 1e-9) {
        const nx = dx / distance;
        const ny = dy / distance;
        const nz = dz / distance;
        px = anchor[0] + nx * ropeLength;
        py = anchor[1] + ny * ropeLength;
        pz = anchor[2] + nz * ropeLength;
        const radial = vx * nx + vy * ny + vz * nz;
        if (radial > 0) {
          vx -= nx * radial;
          vy -= ny * radial;
          vz -= nz * radial;
        }
        if (stiffness > 0) {
          const pull = (distance - ropeLength) * stiffness * dt;
          vx -= nx * pull;
          vy -= ny * pull;
          vz -= nz * pull;
        }
      }

      const damp = Math.max(0, 1 - damping * dt);
      return { position: [px, py, pz], velocity: [vx * damp, vy * damp, vz * damp] };
    },
  };
}
