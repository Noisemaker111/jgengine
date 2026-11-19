import type { WorldSolid, WorldSolids } from "../world/worldSolids";
import type { ScatterInstance } from "./scatterRegion";

/**
 * How much of one scatter palette item blocks movement, in metres at placement scale 1. Each
 * placement becomes one upright box scaled by the placement's own scale.
 */
export interface ScatterSolidSpec {
  radius: number;
  height: number;
}

export const SCATTER_SOLID_LAYER = "scatter:solids";

/** @capability scatter-solids scattered rocks and props block the player, NPCs and physics like any wall */
export function scatterSolids(
  instances: readonly ScatterInstance[],
  specs: Readonly<Record<string, ScatterSolidSpec>>,
  hidden?: ReadonlySet<string>,
): WorldSolid[] {
  const out: WorldSolid[] = [];
  for (const instance of instances) {
    const spec = specs[instance.item];
    if (spec === undefined || spec.radius <= 0 || spec.height <= 0) continue;
    if (hidden?.has(instance.id) === true) continue;
    const half = spec.radius * instance.scale;
    const rise = (spec.height * instance.scale) / 2;
    out.push({ center: [instance.x, instance.y + rise, instance.z], halfExtents: [half, rise, half] });
  }
  return out;
}

/** @capability scatter-solids scattered rocks and props block the player, NPCs and physics like any wall */
export function syncScatterSolids(
  solids: Pick<WorldSolids, "set">,
  instances: readonly ScatterInstance[],
  specs: Readonly<Record<string, ScatterSolidSpec>>,
  hidden?: ReadonlySet<string>,
): void {
  solids.set(SCATTER_SOLID_LAYER, scatterSolids(instances, specs, hidden));
}
