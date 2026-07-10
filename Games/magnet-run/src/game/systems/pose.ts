import { BOT_HALF_HEIGHT, CEILING_Y, FLOOR_Y, TRAIN_ROOF_Y, laneX, sectorWorldStart } from "./constants";
import type { RunState } from "./runState";

export interface BotPose {
  position: readonly [number, number, number];
  rotationZ: number;
}

export function surfaceY(surfaceKind: "floor" | "ceiling" | "train"): number {
  if (surfaceKind === "ceiling") return CEILING_Y - BOT_HALF_HEIGHT;
  if (surfaceKind === "train") return TRAIN_ROOF_Y + BOT_HALF_HEIGHT;
  return FLOOR_Y + BOT_HALF_HEIGHT;
}

export function botPoseFor(state: RunState): BotPose {
  const x = laneX(state.lane);
  const y = surfaceY(state.surface.kind);
  const z = sectorWorldStart(state.sectorIndex) + state.z;
  const rotationZ = state.surface.kind === "ceiling" ? Math.PI : 0;
  return { position: [x, y, z], rotationZ };
}
