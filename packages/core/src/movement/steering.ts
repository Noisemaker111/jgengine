/**
 * Yaw-frame steering math. The engine's heading convention is
 * `forward = (sin yaw, cos yaw)` on the XZ plane with +Y up, which makes a
 * positive yaw increment rotate counterclockwise seen from above — a turn to
 * the entity's LEFT on screen. Every hand-written `heading += steer * rate * dt`
 * therefore turns the wrong way; integrate steering through `steerYaw` instead.
 */

export type YawVectorXZ = readonly [number, number];

/** XZ forward direction of a yaw (`rotationY`): `(sin yaw, cos yaw)`. */
export function yawForward(yaw: number): YawVectorXZ {
  return [Math.sin(yaw), Math.cos(yaw)];
}

/** XZ screen-right of a yaw — `forward × up` with up = +Y: `(-cos yaw, sin yaw)`. */
export function yawRight(yaw: number): YawVectorXZ {
  return [-Math.cos(yaw), Math.sin(yaw)];
}

/**
 * Integrate one steering step. `steerRight` is the signed steer input
 * (+1 = turn right, matching `DRIVE_AXIS_BINDINGS`' KeyD/ArrowRight),
 * `turnRatePerSecond` is radians per second at full lock. Steering right
 * decreases yaw in the engine frame; this helper owns that sign so game
 * code never re-derives it.
 */
export function steerYaw(
  yaw: number,
  steerRight: number,
  turnRatePerSecond: number,
  dt: number,
): number {
  return yaw - steerRight * turnRatePerSecond * dt;
}

/**
 * Signed steer-right input that closes on `desiredYaw` when integrated
 * through `steerYaw` — the seek half every AI driver and homing script
 * needs. Magnitude is the wrapped radian error in (−π, π]; scale and clamp
 * it into [-1, 1] at the call site.
 */
export function steerToward(yaw: number, desiredYaw: number): number {
  let delta = (desiredYaw - yaw) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta <= -Math.PI) delta += TWO_PI;
  return -delta;
}

const TWO_PI = Math.PI * 2;
