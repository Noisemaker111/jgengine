/**
 * The forward-axis convention: a generator or scene kind declares which way its "front" faces (a
 * bookcase's open/book face, a building's entrance) once, as data, instead of leaving every placement
 * to hand-tuned `rotationY` trial-and-error. `StudioStage`'s `faceCamera` (`@jgengine/shell/scene/
 * StudioStage`) reads the declared axis to auto-orient a product shot; a placement tool can read the
 * same field to face a freshly dropped asset toward the camera/path by default. `DEFAULT_FORWARD`
 * (+Z) is what a generator/scene-kind gets when it omits `forward` — build your front toward it.
 * @capability forward-axis declared front convention for parametric assets — auto-orient product shots
 */
export const DEFAULT_FORWARD: readonly [number, number, number] = [0, 0, 1];

/**
 * The yaw (radians, around Y) that rotates `forward` so it points from `origin` toward `target`, both
 * XZ points. Pure — no three.js — so `StudioStage.faceCamera` and any future placement tool share one
 * tested formula instead of re-deriving atan2 math per call site. Only `forward`'s X/Z components
 * matter (yaw is a rotation about Y); returns 0 when `origin` and `target` coincide.
 * @internal — consumed through `StudioStage`'s `faceCamera` prop, not called directly by game code.
 */
export function yawToFace(
  forward: readonly [number, number, number],
  origin: readonly [number, number],
  target: readonly [number, number],
): number {
  const dx = target[0] - origin[0];
  const dz = target[1] - origin[1];
  if (dx === 0 && dz === 0) return 0;
  const angleToTarget = Math.atan2(dx, dz);
  const angleForward = Math.atan2(forward[0], forward[2]);
  return angleToTarget - angleForward;
}
