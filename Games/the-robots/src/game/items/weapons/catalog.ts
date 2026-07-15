import { seededRng } from "@jgengine/core/random/rng";
import { registerGun, rollGun, type GunDef } from "../../handroll";

const starterRng = seededRng("bl2-starter-arsenal");

export const starterPistol: GunDef = rollGun(starterRng, 1, { family: "pistol", rarity: "common" });
export const starterSmg: GunDef = rollGun(starterRng, 2, { family: "smg", rarity: "uncommon" });

export { registerGun, rollGun };
export type { GunDef };
