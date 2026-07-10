import { createApexDetector, type ApexDetector, type Vec3 } from "../physics/swing";

/**
 * `PlayerMovementConfig.beforeCommit` (the shell's sanctioned custom-movement
 * escape hatch) receives only `{ entityId, current, next, dt }` — no `ctx`,
 * no session handle — yet a hand-rolled pendulum controller needs live
 * per-session state (velocity, rope anchor, apex window, live steer input)
 * inside it every frame. There is no ctx-reachable channel `beforeCommit` can
 * read, so this module-level bridge is the only bridge available; it is
 * fully replaced by `resetBridge()` on every `onInit`, so a fresh mount never
 * inherits a previous mount's flight state. Logged as an engine gap — see the
 * game's final report.
 */
export interface FlightBridge {
  /** False only before `onInit` has run once — `beforeCommit` defers to the default controller until then. */
  active: boolean;
  /** True outside the "playing" phase — `beforeCommit` holds position steady instead of integrating physics. */
  frozen: boolean;
  velocity: Vec3;
  attached: boolean;
  anchor: Vec3 | null;
  ropeLength: number;
  apex: ApexDetector;
  aim: { yaw: number; pitch: number };
  input: { steer: number; pitch: number };
}

function freshBridge(): FlightBridge {
  return {
    active: false,
    frozen: true,
    velocity: { x: 0, y: 0, z: 0 },
    attached: false,
    anchor: null,
    ropeLength: 0,
    apex: createApexDetector(),
    aim: { yaw: 0, pitch: 0 },
    input: { steer: 0, pitch: 0 },
  };
}

let bridge: FlightBridge = freshBridge();

export function resetBridge(): FlightBridge {
  bridge = freshBridge();
  return bridge;
}

export function getBridge(): FlightBridge {
  return bridge;
}
