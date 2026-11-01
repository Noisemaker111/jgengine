import type {
  CameraRigKind,
  GameCameraConfig,
  ObserverCameraConfig,
} from "@jgengine/core/game/playableGame";
import type { GameCameraRigConfigs } from "@jgengine/core/camera/cameraConfig";
import type { OrbitCameraConfig } from "@jgengine/core/camera/orbitCameraMath";
import type { CameraRigOverride } from "@jgengine/core/runtime/cameraDirector";
import { readCaptureCamera } from "@jgengine/core/world/captureCamera";

const RIG_BLOCKS = ["firstPerson", "topDown", "rts", "shoulder", "lockOn", "chase", "observer", "turntable", "sideScroll", "inspection"] as const;

/** @internal */
export function resolveRuntimeCameraConfig(config: GameCameraConfig | undefined, override: CameraRigOverride | null | undefined): GameCameraConfig | undefined {
  if (override === null || override === undefined) return config;
  const { orbit, follow, rigs, shake, ...rest } = override.config;
  const merged: GameCameraConfig = { ...config, ...rest, rig: override.kind };
  if (orbit !== undefined) merged.orbit = { ...config?.orbit, ...orbit };
  if (follow !== undefined) merged.follow = { ...config?.follow, ...follow };
  if (shake !== undefined) merged.shake = { ...config?.shake, ...shake };
  if (rigs !== undefined) {
    const blocks: GameCameraRigConfigs = { ...config?.rigs };
    for (const key of RIG_BLOCKS) {
      if (rigs[key] !== undefined) Object.assign(blocks, { [key]: { ...config?.rigs?.[key], ...rigs[key] } });
    }
    merged.rigs = blocks;
  }
  return merged;
}

/**
 * The camera config that renders this frame, with the capture camera winning over everything.
 *
 * A game owns its camera three ways: the static `camera` block, a runtime `ctx.camera.setRig`
 * selection, and a director cinematic. A capture harness can rewrite the first, but the other two
 * run afterwards and quietly photograph the game's own camera. `installCaptureCamera` is read here,
 * above all three, so `?look=`/`--look` frames what it was asked for; with nothing installed this is
 * exactly `resolveRuntimeCameraConfig` and every game behaves as before.
 *
 * @capability capture render a framed capture camera over a game that owns its camera
 * @internal
 */
export function resolveCaptureCameraConfig(config: GameCameraConfig | undefined, override: CameraRigOverride | null | undefined): GameCameraConfig | undefined {
  return resolveRuntimeCameraConfig(config, readCaptureCamera() ?? override);
}

/** The flat orbit-rig config the orbit camera reads: the `orbit` block plus the follow lock switches. @internal */
export function orbitRigConfig(config: GameCameraConfig | undefined): OrbitCameraConfig {
  const follow = config?.follow;
  return {
    ...config?.orbit,
    ...(follow?.followLock === undefined ? {} : { followLock: follow.followLock }),
    ...(follow?.followEnabled === undefined ? {} : { followEnabled: follow.followEnabled }),
  };
}

/**
 * Resolves which rig mounts from a `GameCameraConfig`. Precedence, most to least
 * specific: an explicit `rig` field always wins; then `perspective: "first"`
 * (the historical shorthand for `rig: "orbit" | "first"`); then the mere presence
 * of a rig's own config block selects that rig, checked in the fixed order below
 * (#207.8) so a config carrying more than one block resolves deterministically
 * instead of depending on object key order. Set `rig` explicitly to break a tie.
  * @internal
  */
export function resolveRigKind(config: GameCameraConfig | undefined): CameraRigKind {
  if (config?.rig !== undefined) return config.rig;
  if (config?.perspective === "first") return "first";
  if (config?.rigs?.topDown !== undefined) return "topDown";
  if (config?.rigs?.rts !== undefined) return "rts";
  if (config?.rigs?.shoulder !== undefined) return "shoulder";
  if (config?.rigs?.lockOn !== undefined) return "lockOn";
  if (config?.rigs?.chase !== undefined) return "chase";
  if (config?.rigs?.observer !== undefined) return "observer";
  if (config?.rigs?.turntable !== undefined) return "turntable";
  if (config?.rigs?.sideScroll !== undefined) return "sideScroll";
  if (config?.rigs?.inspection !== undefined) return "inspection";
  return "orbit";
}

/**
 * The turntable rig is a flat facade over the observer's point-orbit mode: map
 * its `target`/`distance`/… onto an observer block so ObserverRig runs unchanged.
  * @internal
  */
export function turntableAsObserver(config: GameCameraConfig | undefined): GameCameraConfig {
  const t = config?.rigs?.turntable;
  if (t === undefined) return config ?? {};
  const observer: ObserverCameraConfig = {
    ...(t.target !== undefined ? { bind: { kind: "point", position: t.target } } : {}),
    ...(t.distance !== undefined ? { distance: t.distance } : {}),
    ...(t.height !== undefined ? { height: t.height } : {}),
    ...(t.lookHeight !== undefined ? { lookHeight: t.lookHeight } : {}),
    ...(t.orbitSpeed !== undefined ? { orbitSpeed: t.orbitSpeed } : {}),
    ...(t.startAngle !== undefined ? { startAngle: t.startAngle } : {}),
    ...(t.fov !== undefined ? { fov: t.fov } : {}),
  };
  return { ...config, rigs: { ...config?.rigs, observer } };
}
