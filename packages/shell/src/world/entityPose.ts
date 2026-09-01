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
