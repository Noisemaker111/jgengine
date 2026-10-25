import { farmSystem, onNewPlayer } from "./game/farm";
import { farm } from "./game/spec";

/** The rules tick here: the farm's world spec (crops, coins, requests) and the play around it. */
export const systems = [farm.system, farmSystem];

export { onNewPlayer };
