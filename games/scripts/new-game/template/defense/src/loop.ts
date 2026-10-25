import { buildSystem } from "./game/build";
import { siegeSystem } from "./game/siege";
import { hold } from "./game/spec";

/** The rules tick here: the hold's world spec, the siege on the lanes, then the pointer and keys. */
export const systems = [hold.system, siegeSystem, buildSystem];
