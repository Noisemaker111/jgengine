import type { ReceiveMap } from "@jgengine/core/combat/effects";
import type { MovementPose } from "@jgengine/core/movement/poseState";
import type { StatCatalog } from "@jgengine/core/scene/entityStats";
import { AMMO_START } from "../../ammo";
import { xpRequiredForLevel } from "../../progression/curves";

export interface PlayerDef {
  id: string;
  name: string;
  walkSpeed: number;
  poses: readonly MovementPose[];
  stats: StatCatalog;
  receive: ReceiveMap;
}

export const player: PlayerDef = {
  id: "vault_hunter",
  name: "Vault Hunter",
  walkSpeed: 5.8,
  poses: ["standing", "running", "crouch"],
  stats: {
    health: { max: 90, min: 1 },
    shield: { max: 60 },
    xp: { max: xpRequiredForLevel(1), current: 0 },
    level: { max: 30, min: 1, current: 1 },
    skillPoints: { max: 29, current: 0 },
    skill_brawn: { max: 5, current: 0 },
    skill_gunlust: { max: 5, current: 0 },
    skill_quickcharge: { max: 5, current: 0 },
    grenades: { max: 6, current: 2 },
    ammo_pistol: { max: AMMO_START.pistol.max, current: AMMO_START.pistol.current },
    ammo_smg: { max: AMMO_START.smg.max, current: AMMO_START.smg.current },
    ammo_shotgun: { max: AMMO_START.shotgun.max, current: AMMO_START.shotgun.current },
    ammo_rifle: { max: AMMO_START.rifle.max, current: AMMO_START.rifle.current },
    ammo_sniper: { max: AMMO_START.sniper.max, current: AMMO_START.sniper.current },
    ammo_rocket: { max: AMMO_START.rocket.max, current: AMMO_START.rocket.current },
  },
  receive: {
    damage: { order: ["shield", "health"] },
  },
};

export const players: PlayerDef[] = [player];
