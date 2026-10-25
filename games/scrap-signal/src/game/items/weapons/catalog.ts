import { seededRng } from "@jgengine/core/random/rng";
import { registerGun, rollGun, type GunDef } from "../../handroll";

const starterRng = seededRng("scrap-starter-arsenal");

export const starterPistol: GunDef = rollGun(starterRng, 1, { family: "pistol", rarity: "common" });

export { registerGun, rollGun };
export type { GunDef };
