import type { ReceiveMap } from "@jgengine/core/combat/effects";
import type { MovementPose } from "@jgengine/core/movement/poseState";
import type { StatCatalog } from "@jgengine/core/scene/entityStats";
import { xpRequiredForLevel } from "../../progression/curves";

export interface PlayerDef {
  id: string;
  name: string;
  model: string;
  walkSpeed: number;
  poses: readonly MovementPose[];
  stats: StatCatalog;
  receive: ReceiveMap;
}

export const player: PlayerDef = {
  id: "player",
  name: "Operative",
  model: "player/operative",
  walkSpeed: 5,
  poses: ["standing", "running"],
  stats: {
    health: { max: 100 },
    xp: { max: xpRequiredForLevel(1), current: 0 },
    level: { max: 30, min: 1, current: 1 },
  },
  receive: {
    damage: { order: ["health"] },
  },
};

export const players: PlayerDef[] = [player];
