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

export const player_default: PlayerDef = {
  id: "player_default",
  name: "Hero",
  model: "player/default",
  walkSpeed: 4.3,
  poses: ["standing", "running"],
  stats: {
    health: { max: 100 },
    mana: { max: 100 },
    xp: { max: xpRequiredForLevel(1), current: 0 },
    level: { max: 60, min: 1, current: 1 },
  },
  receive: {
    damage: { order: ["health"] },
    heal: { order: ["health"] },
    restore_mana: { order: ["mana"] },
  },
};

export const players: PlayerDef[] = [player_default];
