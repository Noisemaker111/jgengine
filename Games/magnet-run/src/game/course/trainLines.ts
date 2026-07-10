import type { TrainLineDef } from "../systems/trains";
import { TUNNEL_START_Z, SECTOR_LENGTH, SECTOR_COUNT } from "../systems/constants";

const TUNNEL_END_Z = TUNNEL_START_Z + SECTOR_COUNT * SECTOR_LENGTH;

export const trainLines: Record<"alpha" | "beta", TrainLineDef> = {
  alpha: {
    id: "alpha",
    displayName: "TRAIN 7",
    lane: 0,
    roofPolarity: "blue",
    speed: 24,
    length: 32,
    headway: 15,
    offset: 3,
    trackStartZ: TUNNEL_START_Z - 40,
    trackEndZ: TUNNEL_END_Z + 40,
  },
  beta: {
    id: "beta",
    displayName: "TRAIN 12",
    lane: 2,
    roofPolarity: "red",
    speed: 20,
    length: 28,
    headway: 18,
    offset: 10,
    trackStartZ: TUNNEL_START_Z - 40,
    trackEndZ: TUNNEL_END_Z + 40,
  },
};

export const trainLineList = Object.values(trainLines);
