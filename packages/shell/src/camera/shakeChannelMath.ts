import { addTrauma, createTrauma, shakeOffset, stepTrauma, type ShakeOffset, type TraumaState } from "./rigMath";

export interface CameraShakeChannel {
  shake(amplitude: number, decayPerSecond?: number): void;
  step(dt: number): void;
  sample(config?: Parameters<typeof shakeOffset>[1]): ShakeOffset;
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
