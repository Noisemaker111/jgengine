import type { Euler, Quaternion } from "three";

/** @internal */
export function setBillboardQuaternion(quaternion: Quaternion, euler: Euler, yaw: number): void {
  euler.set(0, yaw, 0);
  quaternion.setFromEuler(euler);
}
