import { onNewPlayer, systems as journeySystems } from "./game/journey";

/** The rules tick here: the journey's world spec and the walk around it. */
export const systems = [...journeySystems];

export { onNewPlayer };
