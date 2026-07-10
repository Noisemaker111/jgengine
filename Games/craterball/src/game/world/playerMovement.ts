import type { MovementCommitFrame } from "@jgengine/core/game/playableGame";
import { clampToPitch } from "../arena/geometry";

const PLAYER_WALL_MARGIN = 0.6;

export function beforeCommit(frame: MovementCommitFrame): readonly [number, number, number] {
  const [x, z] = clampToPitch([frame.next[0], frame.next[2]], PLAYER_WALL_MARGIN);
  return [x, frame.next[1], z];
}
