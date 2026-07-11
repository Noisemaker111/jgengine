import type { ReceiveMap } from "@jgengine/core/combat/effects";
import type { MovementPose } from "@jgengine/core/movement/poseState";
import type { StatCatalog } from "@jgengine/core/scene/entityStats";
import { AMMO_START } from "../../ammo";
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
  walkSpeed: 5.4,
  poses: ["standing", "running"],
  stats: {
    health: { max: 100 },
    xp: { max: xpRequiredForLevel(1), current: 0 },
    level: { max: 30, min: 1, current: 1 },
    ammo_light: { max: AMMO_START.light.max, current: AMMO_START.light.current },
    ammo_heavy: { max: AMMO_START.heavy.max, current: AMMO_START.heavy.current },
    ammo_shell: { max: AMMO_START.shell.max, current: AMMO_START.shell.current },
    ammo_energy: { max: AMMO_START.energy.max, current: AMMO_START.energy.current },
  },
  receive: {
    damage: { order: ["health"] },
  },
};

export const players: PlayerDef[] = [player];
