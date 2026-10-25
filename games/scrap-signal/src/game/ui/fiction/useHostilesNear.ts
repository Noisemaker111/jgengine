import { useGameStore } from "@jgengine/react/hooks";
import { enemyById } from "../../entities/enemies/catalog";

/** The same earshot the music uses to call a skirmish (`audio/drive.ts`). */
const THREAT_RADIUS = 42;

/**
 * True while any hostile machine is within earshot of the reclaimer. The rig keeps its combat
 * readouts at full strength while this holds and lets them dim once the area is quiet.
 */
export function useHostilesNear(): boolean {
  return useGameStore((ctx) => {
    const me = ctx.scene.entity.get(ctx.player.userId);
    if (me === null) return false;
    for (const entity of ctx.scene.entity.list()) {
      if (enemyById(entity.name) === undefined) continue;
      if (Math.hypot(entity.position[0] - me.position[0], entity.position[2] - me.position[2]) <= THREAT_RADIUS) return true;
    }
    return false;
  });
}
