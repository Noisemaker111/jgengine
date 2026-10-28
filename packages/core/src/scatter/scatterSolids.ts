import type { WorldSolid, WorldSolids } from "../world/worldSolids";
import type { ScatterInstance } from "./scatterRegion";

/**
 * How much of one scatter palette item blocks movement, in metres at placement scale 1. Each
 * placement becomes one upright box scaled by the placement's own scale.
 */
export interface ScatterSolidSpec {
  /** Half-width of the blocking box: about the visible footprint's radius. */
  radius: number;
  /** Height of the blocking box above the placement's grounded base. */
  height: number;
}

/** Layer {@link syncScatterSolids} owns in `ctx.world.solids`. */
export const SCATTER_SOLID_LAYER = "scatter:solids";

/**
 * One solid per placement whose palette item has a spec, skipping `hidden` placements (a mined rock
 * stops blocking once it is gone).
 * @capability scatter-solids scattered rocks and props block the player, NPCs and physics like any wall
 */
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

/**
 * Write the solid placements into `solids` (usually `ctx.world.solids`) as the
 * {@link SCATTER_SOLID_LAYER} layer; an empty result removes the layer. Call again when the
 * placements or the hidden set change.
 * @capability scatter-solids scattered rocks and props block the player, NPCs and physics like any wall
 */
export function syncScatterSolids(
  solids: Pick<WorldSolids, "set">,
  instances: readonly ScatterInstance[],
  specs: Readonly<Record<string, ScatterSolidSpec>>,
  hidden?: ReadonlySet<string>,
): void {
  solids.set(SCATTER_SOLID_LAYER, scatterSolids(instances, specs, hidden));
}
