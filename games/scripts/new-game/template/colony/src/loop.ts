import { buildSystem } from "./game/build";
import { lifeSystem } from "./game/life";
import { colony } from "./game/spec";

/** The rules tick here: the colony's world spec, its life (work, raids, arrivals), then the pointer and keys. */
export const systems = [colony.system, lifeSystem, buildSystem];
