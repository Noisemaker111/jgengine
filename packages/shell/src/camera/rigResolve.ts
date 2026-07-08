import type {
  CameraRigKind,
  GameCameraConfig,
  ObserverCameraConfig,
} from "@jgengine/core/game/playableGame";

/**
 * Resolves which rig mounts from a `GameCameraConfig`. Precedence, most to least
 * specific: an explicit `rig` field always wins; then `perspective: "first"`
 * (the historical shorthand for `rig: "orbit" | "first"`); then the mere presence
 * of a rig's own config block selects that rig, checked in the fixed order below
 * (#207.8) so a config carrying more than one block resolves deterministically
 * instead of depending on object key order. Set `rig` explicitly to break a tie.
 */
export function resolveRigKind(config: GameCameraConfig | undefined): CameraRigKind {
  if (config?.rig !== undefined) return config.rig;
  if (config?.perspective === "first") return "first";
  if (config?.topDown !== undefined) return "topDown";
  if (config?.rts !== undefined) return "rts";
  if (config?.shoulder !== undefined) return "shoulder";
  if (config?.lockOn !== undefined) return "lockOn";
  if (config?.chase !== undefined) return "chase";
  if (config?.observer !== undefined) return "observer";
  if (config?.turntable !== undefined) return "turntable";
  if (config?.sideScroll !== undefined) return "sideScroll";
  if (config?.inspection !== undefined) return "inspection";
  return "orbit";
}

/**
 * The turntable rig is a flat facade over the observer's point-orbit mode: map
 * its `target`/`distance`/… onto an observer block so ObserverRig runs unchanged.
 */
export function turntableAsObserver(config: GameCameraConfig | undefined): GameCameraConfig {
  const t = config?.turntable;
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
  return { ...config, observer };
}
