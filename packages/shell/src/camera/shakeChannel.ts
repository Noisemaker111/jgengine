import { createContext, useContext } from "react";

import {
  createCameraShakeChannel,
  type CameraShakeChannel,
} from "./shakeChannelMath";

export type { CameraShakeChannel } from "./shakeChannelMath";
export { createCameraShakeChannel } from "./shakeChannelMath";

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
