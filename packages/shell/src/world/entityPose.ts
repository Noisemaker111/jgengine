import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { RenderPose } from "@jgengine/core/runtime/poseInterpolation";

export interface PoseWritable {
  position: { set(x: number, y: number, z: number): void };
  rotation: { y: number };
}

export interface PoseSource {
  position: readonly [number, number, number];
  rotationY: number;
}

/** @internal */
export function writeEntityPose(target: PoseWritable, source: PoseSource): void {
  target.position.set(source.position[0], source.position[1], source.position[2]);
  target.rotation.y = source.rotationY;
}

/** The pose last written to one marker group, reused across frames. @internal */
export type PoseMemo = [number, number, number, number];

/** A marker group that owns its own matrix instead of three recomposing it every frame. @internal */
export interface MatrixPoseTarget extends PoseWritable {
  updateMatrix(): void;
}

/** A memo that never matches, so the first write to a marker group always lands. @internal */
export function emptyPoseMemo(): PoseMemo {
  return [Number.NaN, Number.NaN, Number.NaN, Number.NaN];
}

/**
 * Write a marker pose and recompose only when it changed. The marker group runs with
 * `matrixAutoUpdate=false`, so an idle actor or a parked prop leaves its whole subtree out of the
 * per-frame world-matrix pass instead of forcing every child to recompose (#2038).
 * @internal
 */
export function writePoseIfChanged(target: MatrixPoseTarget, source: PoseSource, memo: PoseMemo): boolean {
  const [x, y, z] = source.position;
  if (memo[0] === x && memo[1] === y && memo[2] === z && memo[3] === source.rotationY) return false;
  memo[0] = x;
  memo[1] = y;
  memo[2] = z;
  memo[3] = source.rotationY;
  target.position.set(x, y, z);
  target.rotation.y = source.rotationY;
  target.updateMatrix();
  return true;
}

/** {@link writePoseIfChanged} for the interpolated pose in `ctx.sim`, falling back to `live`. @internal */
export function writeRenderPoseIfChanged(
  target: MatrixPoseTarget,
  ctx: Pick<GameContext, "sim">,
  entityId: string,
  live: PoseSource,
  scratch: RenderPose,
  memo: PoseMemo,
): boolean {
  if (!ctx.sim.renderPose(entityId, scratch)) {
    scratch[0] = live.position[0];
    scratch[1] = live.position[1];
    scratch[2] = live.position[2];
    scratch[3] = live.rotationY;
  }
  if (memo[0] === scratch[0] && memo[1] === scratch[1] && memo[2] === scratch[2] && memo[3] === scratch[3]) return false;
  memo[0] = scratch[0];
  memo[1] = scratch[1];
  memo[2] = scratch[2];
  memo[3] = scratch[3];
  target.position.set(scratch[0], scratch[1], scratch[2]);
  target.rotation.y = scratch[3];
  target.updateMatrix();
  return true;
}

/** Write the interpolated render pose from `ctx.sim` (falls back to `live` when no history exists). @internal */
export function writeRenderPose(
  target: PoseWritable,
  ctx: Pick<GameContext, "sim">,
  entityId: string,
  live: PoseSource,
  scratch: RenderPose,
): void {
  if (ctx.sim.renderPose(entityId, scratch)) {
    target.position.set(scratch[0], scratch[1], scratch[2]);
    target.rotation.y = scratch[3];
    return;
  }
  writeEntityPose(target, live);
}

/** @internal */
export function posesEqual(a: PoseSource, b: PoseSource): boolean {
  return (
    a.position[0] === b.position[0] &&
    a.position[1] === b.position[1] &&
    a.position[2] === b.position[2] &&
    a.rotationY === b.rotationY
  );
}
