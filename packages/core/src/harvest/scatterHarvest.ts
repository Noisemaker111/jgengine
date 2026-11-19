// @skill jgengine-gameplay
import type { ScatterClearing } from "../scatter/scatterClearing";
import { length2 } from "../math/scalar";
import { createSpatialIndex } from "../spatial/spatialIndex";
import {
  createResourceNodeField,
  type ResourceGrant,
  type ResourceNodeDef,
  type ResourceNodeState,
  type ToolProfile,
} from "../world/resourceNode";

export interface HarvestableDef extends Omit<ResourceNodeDef, "id"> {
  /** Trunk/boulder radius in metres added to the striker's reach. Default 0.5. */
  radius?: number;
}

export interface HarvestPlacement {
  id: string;
  item: string;
  x: number;
  z: number;
  scale?: number;
}

export interface HarvestStrike {
  x: number;
  z: number;
  /** Facing yaw in radians (0 faces +z). */
  yaw: number;
  /** Arm or tool reach in metres. */
  reach: number;
  /** Half-angle of the swing cone in radians. Default 0.9. */
  cone?: number;
  tool: ToolProfile;
  multiplier?: number;
  accepts?: (item: string) => boolean;
}

export interface HarvestHit {
  id: string;
  item: string;
  granted: readonly ResourceGrant[];
  depleted: boolean;
  /** 0..1 left after the swing. */
  fraction: number;
}

export interface ScatterHarvestConfig {
  kinds: Readonly<Record<string, HarvestableDef>>;
  clearing?: ScatterClearing;
  rng?: () => number;
  /** Spatial index cell in metres. Default 16. */
  cellSize?: number;
}

export interface ScatterHarvestState {
  nodes: Record<string, ResourceNodeState>;
}

export interface ScatterHarvest {
  setPlacements(placements: readonly HarvestPlacement[]): void;
  target(strike: Omit<HarvestStrike, "tool" | "multiplier">): HarvestPlacement | null;
  /** Swing: hit the target, grant its resources, clear it from the world when spent. Null when nothing is in reach. */
  strike(strike: HarvestStrike): HarvestHit | null;
  tick(dt: number): readonly string[];
  isDepleted(id: string): boolean;
  retune(kinds: Readonly<Record<string, HarvestableDef>>): void;
  snapshot(): ScatterHarvestState;
  restore(state: ScatterHarvestState): void;
  reset(): void;
}

function angleBetween(a: number, b: number): number {
  const diff = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(diff);
}

/** Metres of slack around a strike's reach the query covers before the trunk radii are added. */
const REACH_SLACK = 4;

/** @capability scatter-harvest strike scatter trees, rocks and bushes for tool-biased resources; spent ones vanish and regrow */
export function createScatterHarvest(config: ScatterHarvestConfig): ScatterHarvest {
  let kinds = config.kinds;
  const cellSize = config.cellSize ?? 16;
  const byId = new Map<string, HarvestPlacement>();
  const index = createSpatialIndex({ cellSize });
  const candidates: string[] = [];
  let widestRadius = 0.5;

  const measure = (): void => {
    let widest = 0.5;
    for (const placement of byId.values()) {
      const kind = kinds[placement.item];
      if (kind === undefined) continue;
      widest = Math.max(widest, (kind.radius ?? 0.5) * (placement.scale ?? 1));
    }
    widestRadius = widest;
  };

  const defOf = (id: string): ResourceNodeDef | null => {
    const placement = byId.get(id);
    const kind = placement === undefined ? undefined : kinds[placement.item];
    return kind === undefined ? null : { ...kind, id };
  };
  const build = () => createResourceNodeField({ nodes: [], resolve: defOf, ...(config.rng === undefined ? {} : { rng: config.rng }) });
  let field = build();

  const syncClearing = (): void => {
    config.clearing?.restore(field.ids().filter((id) => field.isDepleted(id)));
  };

  const target = (strike: Omit<HarvestStrike, "tool" | "multiplier">): HarvestPlacement | null => {
    const cone = strike.cone ?? 0.9;
    let best: HarvestPlacement | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const ids = index.querySphere(strike.x, 0, strike.z, strike.reach + REACH_SLACK + widestRadius, candidates);
    for (const id of ids) {
      const placement = byId.get(id);
      if (placement === undefined) continue;
      const kind = kinds[placement.item];
      if (kind === undefined) continue;
      // Geometry first: most of the query is out of reach, and that test is cheaper than the filters.
      const dx = placement.x - strike.x;
      const dz = placement.z - strike.z;
      const distance = length2(dx, dz);
      const radius = (kind.radius ?? 0.5) * (placement.scale ?? 1);
      if (distance - radius > strike.reach) continue;
      if (distance > radius && angleBetween(Math.atan2(dx, dz), strike.yaw) > cone) continue;
      if ((strike.accepts !== undefined && !strike.accepts(placement.item)) || field.isDepleted(placement.id)) continue;
      if (distance < bestDistance) {
        best = placement;
        bestDistance = distance;
      }
    }
    return best;
  };

  return {
    setPlacements(placements) {
      byId.clear();
      index.clear();
      for (const placement of placements) {
        if (kinds[placement.item] === undefined) continue;
        byId.set(placement.id, placement);
        index.insert(placement.id, {
          centerX: placement.x,
          centerY: 0,
          centerZ: placement.z,
          radius: 0,
          minX: placement.x,
          minY: 0,
          minZ: placement.z,
          maxX: placement.x,
          maxY: 0,
          maxZ: placement.z,
        });
      }
      measure();
    },
    target,
    strike(strike) {
      const hit = target(strike);
      if (hit === null) return null;
      const result = field.harvest(hit.id, strike.tool, strike.multiplier === undefined ? {} : { multiplier: strike.multiplier });
      if (result.depleted) config.clearing?.set(hit.id, true);
      return { id: hit.id, item: hit.item, granted: result.granted, depleted: result.depleted, fraction: field.state(hit.id).fraction };
    },
    tick(dt) {
      const before = field.ids().filter((id) => field.isDepleted(id));
      if (before.length === 0) return [];
      field.tick(dt);
      const regrown = before.filter((id) => !field.ids().includes(id) || !field.isDepleted(id));
      for (const id of regrown) config.clearing?.set(id, false);
      return regrown;
    },
    isDepleted: (id) => (byId.has(id) ? field.isDepleted(id) : false),
    retune(next) {
      kinds = next;
      measure();
    },

    snapshot: () => ({ nodes: field.snapshot() }),
    restore(state) {
      field = build();
      field.hydrate(state.nodes);
      syncClearing();
    },
    reset() {
      field = build();
      syncClearing();
    },
  };
}
