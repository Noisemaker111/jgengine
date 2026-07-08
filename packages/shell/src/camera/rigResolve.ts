import type {
  CameraRigKind,
  GameCameraConfig,
  ObserverCameraConfig,
} from "@jgengine/core/game/playableGame";

/**
 * Which rig the shell mounts for a camera config. An explicit `rig` always
 * wins; otherwise a rig is inferred from the config block present (so
 * `camera.turntable` selects the turntable rig on its own, no `rig` needed),
 * then from `perspective`, falling back to `orbit`.
 */
export function resolveRigKind(config: GameCameraConfig | undefined): CameraRigKind {
  if (config?.rig !== undefined) return config.rig;
  if (config?.turntable !== undefined) return "turntable";
  if (config?.perspective === "first") return "first";
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
