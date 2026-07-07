import { createContext, useContext } from "react";

import { addTrauma, createTrauma, shakeOffset, stepTrauma, type ShakeOffset, type TraumaState } from "./rigMath";

export interface CameraShakeChannel {
  /**
   * Add a trauma impulse. `amplitude` is a 0..1 fraction (1 = a full boss slam);
   * `decayPerSecond` optionally overrides how fast this and subsequent trauma
   * bleed off. Any gameplay system (combat hitstop, explosions, vehicle crashes)
   * can call this — the active rig reads the resulting shake every frame.
   */
  shake(amplitude: number, decayPerSecond?: number): void;
  /** Advance decay + the shake clock (called once per frame by the mounted rig). */
  step(dt: number): void;
  /** Current positional + roll shake for the given tuning. */
  sample(config?: Parameters<typeof shakeOffset>[1]): ShakeOffset;
  /** Live trauma in [0,1] (for HUD/debug). */
  trauma(): number;
}

export function createCameraShakeChannel(defaultDecayPerSecond = 1.6): CameraShakeChannel {
  const state: TraumaState = createTrauma();
  let decay = defaultDecayPerSecond;
  return {
    shake(amplitude, decayPerSecond) {
      if (decayPerSecond !== undefined) decay = decayPerSecond;
      addTrauma(state, amplitude);
    },
    step(dt) {
      stepTrauma(state, decay, dt);
    },
    sample(config) {
      return shakeOffset(state, config);
    },
    trauma() {
      return state.trauma;
    },
  };
}

/**
 * Process-wide default channel. A shell mounts its own channel via
 * `CameraShakeContext`, but game systems that have no React context (e.g. a
 * `loop.onTick` reacting to `entity.died`) can import `cameraShake` and feed the
 * default channel directly.
 */
export const defaultCameraShakeChannel: CameraShakeChannel = createCameraShakeChannel();

/** Feed the default camera-shake channel from anywhere (see G7 hitstop cross-cut). */
export function cameraShake(amplitude: number, decayPerSecond?: number): void {
  defaultCameraShakeChannel.shake(amplitude, decayPerSecond);
}

export const CameraShakeContext = createContext<CameraShakeChannel>(defaultCameraShakeChannel);

/** The active rig's shake channel — call `.shake(...)` to add trauma from React UI. */
export function useCameraShake(): CameraShakeChannel {
  return useContext(CameraShakeContext);
}
