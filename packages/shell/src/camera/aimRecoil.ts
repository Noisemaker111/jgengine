/** How fast a kick reaches the view: about 90% of it lands in the first 65 ms. */
const RISE_PER_SECOND = 35;
/** Share of the remaining climb given back per second: 6 returns about 85% within 0.3 s. */
const DEFAULT_RECOVER = 6;
/** The most a burst can climb before more kicks stop adding, so a held trigger never flips the view. */
const MAX_CLIMB = 0.35;

/**
 * Recoil on the look: kicks rise into the view quickly, then the view settles back toward where the
 * shooter was aiming. Only the climb the kick added is given back, so a player who drags the aim down
 * against the kick keeps their correction. @internal
 */
export interface AimRecoil {
  kick(pitch: number, yaw?: number, recover?: number): void;
  /** Advance by `dt` seconds and return the look change to add this frame. */
  step(dt: number): { pitch: number; yaw: number };
  /** Climb still owed back to the view, for tests and probes. */
  debt(): { pitch: number; yaw: number };
}

/** @internal */
export function createAimRecoil(): AimRecoil {
  let risePitch = 0;
  let riseYaw = 0;
  let debtPitch = 0;
  let debtYaw = 0;
  let recover = DEFAULT_RECOVER;
  return {
    kick(pitch, yaw = 0, rate = DEFAULT_RECOVER) {
      const room = Math.max(0, MAX_CLIMB - Math.abs(debtPitch + risePitch));
      risePitch += Math.sign(pitch) * Math.min(Math.abs(pitch), room);
      riseYaw += yaw;
      recover = rate;
    },
    step(dt) {
      const share = Math.min(1, dt * RISE_PER_SECOND);
      const upPitch = risePitch * share;
      const upYaw = riseYaw * share;
      risePitch -= upPitch;
      riseYaw -= upYaw;
      debtPitch += upPitch;
      debtYaw += upYaw;
      const back = Math.min(1, recover * dt);
      const downPitch = debtPitch * back;
      const downYaw = debtYaw * back;
      debtPitch -= downPitch;
      debtYaw -= downYaw;
      return { pitch: upPitch - downPitch, yaw: upYaw - downYaw };
    },
    debt: () => ({ pitch: debtPitch + risePitch, yaw: debtYaw + riseYaw }),
  };
}
