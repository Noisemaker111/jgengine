import type { MovementCommitFrame } from "@jgengine/core/game/playableGame";

import { AIR_PITCH_ACCEL, AIR_STEER_ACCEL, GRAVITY } from "../physics/constants";
import { applyAirSteer, stepSwing } from "../physics/swing";
import { getBridge } from "./bridge";

/**
 * Replaces the shell's default walk-controller step entirely with the
 * courier's hand-rolled pendulum/ballistic physics (see `game/physics/swing.ts`).
 * Reads/writes the module-level `FlightBridge` since this callback receives
 * no `ctx` — see `game/runtime/bridge.ts` for why.
 */
export function beforeCommit(frame: MovementCommitFrame): readonly [number, number, number] | undefined {
  const bridge = getBridge();
  if (!bridge.active) return undefined;
  if (bridge.frozen) return frame.current;

  const steeredVelocity = applyAirSteer(
    bridge.velocity,
    bridge.aim.yaw,
    bridge.input.steer,
    bridge.input.pitch,
    frame.dt,
    AIR_STEER_ACCEL,
    AIR_PITCH_ACCEL,
  );

  const stepped = stepSwing(
    {
      position: { x: frame.current[0], y: frame.current[1], z: frame.current[2] },
      velocity: steeredVelocity,
      attached: bridge.attached,
      anchor: bridge.anchor,
      ropeLength: bridge.ropeLength,
      apex: bridge.apex,
    },
    GRAVITY,
    frame.dt,
  );

  bridge.velocity = stepped.velocity;
  bridge.apex = stepped.apex;
  return [stepped.position.x, stepped.position.y, stepped.position.z];
}
