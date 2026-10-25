import { buildSystem } from "./game/build";
import { realm } from "./game/spec";
import { townSystem } from "./game/town";

/** The rules tick here: the realm's world spec, the town around it, then the pointer and build keys. */
export const systems = [realm.system, townSystem, buildSystem];
