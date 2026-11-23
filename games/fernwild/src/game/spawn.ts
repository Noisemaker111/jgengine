import {
  authoredSpawnRotation,
} from "@jgengine/core/world/authoredSpawn";
import {
  editorLayers,
} from "../editorLayers";

export const SPAWN_YAW = authoredSpawnRotation(editorLayers);

/** Metres `at` lies right of `mark` across the spawn facing, to a centimetre; 0 when either is missing. */
export function acrossSpawn(at: readonly number[] | undefined, mark: readonly number[] | null): number {
  if (at === undefined || mark === null) return 0;
  // Looking along the facing (sin, cos), the screen's right is (-cos, sin) in XZ.
  return Math.round(((at[2]! - mark[2]!) * Math.sin(SPAWN_YAW) - (at[0]! - mark[0]!) * Math.cos(SPAWN_YAW)) * 100) / 100;
}
