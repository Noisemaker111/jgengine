import { buildSystem } from "./game/build";
import { onNewPlayer, systems as playSystems } from "./game/play";

/** The rules tick here: the camp's world spec and the play around it, then building. */
export const systems = [...playSystems, buildSystem];

export { onNewPlayer };
