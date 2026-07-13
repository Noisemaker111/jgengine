export type GlideVec3 = readonly [number, number, number];

export interface GlideModelConfig {
  /** Fraction of gravity felt while gliding; default `0.25`. */
  gravityScale?: number;
  /** Gravity used before scaling; default `20`. */
  gravity?: number;
  /** Forward cruise acceleration toward `forwardSpeed`; default `10`. */
  thrustAccel?: number;
  /** Cruise speed the glider settles toward along its heading; default `12`. */
  forwardSpeed?: number;
  /** Yaw radians/s at full steer input; default `1.6`. */
  yawRate?: number;
  /** Vertical thrust (units/s²) at full throttle — powered climb; default `0` (unpowered glide). */
  climbAccel?: number;
  /** Terminal fall speed; default `8`. */
  maxFallSpeed?: number;
  /** Control softness in `[0, 1]` — `1` full authority, lower values (turbulence) blunt steering and thrust; default `1`. */
  control?: number;
}

export interface GlideInput {
  /** Steering in `[-1, 1]` (positive turns toward +x when facing +z). */
  yaw?: number;
  /** Powered climb in `[0, 1]` (needs `climbAccel`). */
  throttle?: number;
  /** Runtime control-authority override in `[0, 1]` — schedule-varying turbulence; overrides the config `control`. */
  control?: number;
}

export interface GlideStep {
  position: GlideVec3;
  velocity: GlideVec3;
  heading: number;
}

/**
 * A kinematic glider (#282.6) — the walk-controller-compatible sibling of `physics/traversal`'s
 * rigid-body `Glide`, with the yaw and powered-climb authority that one lacks. External flows —
 * `physics/flowTube` corridors, `world/windZones` schedules — compose per tick through
 * `externalVelocity`, and turbulence degrades control through the `control` scalar.
 */
export interface GlideModel {
  step(dt: number, input?: GlideInput, externalVelocity?: GlideVec3): GlideStep;
  pose(): GlideStep;
  launch(position: GlideVec3, heading: number, initialSpeed?: number): void;
}

/**
 * Gliding/wingsuit descent control — lift, drag, and steering from a launch.
 *
 * @capability glide gliding/wingsuit descent control from a launch
 */
export function createGlideModel(config: GlideModelConfig = {}): GlideModel {
  const gravity = (config.gravity ?? 20) * (config.gravityScale ?? 0.25);
  const thrustAccel = config.thrustAccel ?? 10;
  const forwardSpeed = config.forwardSpeed ?? 12;
  const yawRate = config.yawRate ?? 1.6;
  const climbAccel = config.climbAccel ?? 0;
  const maxFallSpeed = config.maxFallSpeed ?? 8;
  const baseControl = config.control ?? 1;

  let x = 0;
  let y = 0;
  let z = 0;
  let heading = 0;
  let vx = 0;
  let vy = 0;
  let vz = 0;

  function snapshot(): GlideStep {
    return { position: [x, y, z], velocity: [vx, vy, vz], heading };
  }

  return {
    launch(position, nextHeading, initialSpeed = forwardSpeed) {
      x = position[0];
      y = position[1];
      z = position[2];
      heading = nextHeading;
      vx = Math.sin(heading) * initialSpeed;
      vy = 0;
      vz = Math.cos(heading) * initialSpeed;
    },
    pose: snapshot,
    step(dt, input = {}, externalVelocity) {
      if (dt <= 0) return snapshot();
      const control = Math.max(0, Math.min(1, input.control ?? baseControl));
      heading += (input.yaw ?? 0) * yawRate * control * dt;

      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      const along = vx * fx + vz * fz;
      const cruise = (forwardSpeed - along) * Math.min(1, (thrustAccel / Math.max(1, forwardSpeed)) * dt);
      vx += fx * cruise * control;
      vz += fz * cruise * control;

      vy -= gravity * dt;
      const throttle = Math.max(0, Math.min(1, input.throttle ?? 0));
      if (climbAccel > 0 && throttle > 0) vy += climbAccel * throttle * control * dt;
      if (vy < -maxFallSpeed) vy = -maxFallSpeed;

      const [ex, ey, ez] = externalVelocity ?? [0, 0, 0];
      x += (vx + ex) * dt;
      y += (vy + ey) * dt;
      z += (vz + ez) * dt;
      return snapshot();
    },
  };
}
