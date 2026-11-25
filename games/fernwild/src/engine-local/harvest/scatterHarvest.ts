// @skill jgengine-gameplay
import type { ScatterClearing } from "@jgengine/core/scatter/scatterClearing";
import { length2 } from "@jgengine/core/math/scalar";
import { createSpatialIndex } from "@jgengine/core/spatial/spatialIndex";
import {
  createResourceNodeField,
  type ResourceGrant,
  type ResourceNodeDef,
  type ResourceNodeState,
  type ToolProfile,
} from "@jgengine/core/world/resourceNode";

/** What one scatter species yields when struck: a resource node definition without its id, plus its trunk radius. */
export interface HarvestableDef extends Omit<ResourceNodeDef, "id"> {
  /** Trunk/boulder radius in metres added to the striker's reach. Default 0.5. */
  radius?: number;
}

/** A placement the harvest can strike: a resolved scatter instance or anything with an id, a species and a spot. */
export interface HarvestPlacement {
  id: string;
  item: string;
  x: number;
  z: number;
  scale?: number;
}

/** One swing: where from, which way, how far and with what. */
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
  /** Scales every grant (a harvesting stat, a creature's gather bonus). Default 1. */
  multiplier?: number;
  /** Only these species can be hit by this swing (a fist strikes trees, a hand picks bushes). Default every harvestable. */
  accepts?: (item: string) => boolean;
}

/** What a swing took. */
export interface HarvestHit {
  id: string;
  item: string;
  granted: readonly ResourceGrant[];
  /** The node emptied on this swing and left the world. */
  depleted: boolean;
  /** 0..1 left after the swing. */
  fraction: number;
}

/** Construction options for {@link createScatterHarvest}. */
export interface ScatterHarvestConfig {
  /** Harvestable species by scatter item id; items not listed are scenery. */
  kinds: Readonly<Record<string, HarvestableDef>>;
  /** Hides depleted placements in the renderer and shows them again on respawn. */
  clearing?: ScatterClearing;
  /** Injected [0,1) generator for yield variance. */
  rng?: () => number;
  /** Spatial index cell in metres. Default 16. */
  cellSize?: number;
}

/** Plain save data: the touched nodes only. */
export interface ScatterHarvestState {
  nodes: Record<string, ResourceNodeState>;
}

/** Strikeable scatter: trees, rocks and bushes the player hits for resources, which vanish when spent and regrow. */
export interface ScatterHarvest {
  /** Index the placements a strike can reach (call when the scatter resolves, before `restore`). Non-harvestable items are skipped. */
  setPlacements(placements: readonly HarvestPlacement[]): void;
  /** The standing harvestable placement a swing would hit, nearest first. */
  target(strike: Omit<HarvestStrike, "tool" | "multiplier">): HarvestPlacement | null;
  /** Swing: hit the target, grant its resources, clear it from the world when spent. Null when nothing is in reach. */
  strike(strike: HarvestStrike): HarvestHit | null;
  /** Count down regrowth; returns the ids that grew back this tick. */
  tick(dt: number): readonly string[];
  isDepleted(id: string): boolean;
  /** Swap the species table in play (yields, budgets, regrowth); touched nodes keep their state. */
  retune(kinds: Readonly<Record<string, HarvestableDef>>): void;
  snapshot(): ScatterHarvestState;
  restore(state: ScatterHarvestState): void;
  reset(): void;
}

/** Metres of slack around a strike's reach the query covers before the trunk radii are added. */
const REACH_SLACK = 4;

/**
 * Turn scatter into resources: every placed tree, rock or bush of a listed species is a depletable,
 * respawning node (backed by {@link createResourceNodeField} resolved on first hit, so ten thousand trees
 * cost nothing until someone swings). A strike picks the nearest standing placement inside reach and a
 * facing cone, applies the tool's biases (a hatchet favours wood, a pick favours stone, a fist gets
 * thatch), and a spent node is hidden through {@link ScatterClearing} until it regrows.
 *
 * @capability scatter-harvest strike scatter trees, rocks and bushes for tool-biased resources; spent ones vanish and regrow
 */
export function createScatterHarvest(config: ScatterHarvestConfig): ScatterHarvest {
  let kinds = config.kinds;
  const cellSize = config.cellSize ?? 16;
  const byId = new Map<string, HarvestPlacement>();
  const index = createSpatialIndex({ cellSize });
  const candidates: string[] = [];
  /** Widest trunk radius any standing placement adds to a strike's reach. */
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
    // The cone as a cosine: a placement is outside it when its direction's dot with the facing is below.
    // A cone of half a turn or more takes every direction, so no placement pays for the test.
    const coneCos = cone >= Math.PI ? Number.NEGATIVE_INFINITY : Math.cos(cone);
    const facingX = Math.sin(strike.yaw);
    const facingZ = Math.cos(strike.yaw);
    const full = strike.reach + REACH_SLACK + widestRadius;
    // Nearest first, so look near first: a ring that holds a hit no farther than its own radius holds the
    // nearest one, and a lookout over 80 m (the probe, onboarding's hints) stops reading thousands of trees.
    for (let searched = Math.min(full, cellSize); ; searched = Math.min(full, searched * 2)) {
      let best: HarvestPlacement | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const id of index.querySphere(strike.x, 0, strike.z, searched, candidates)) {
        const placement = byId.get(id);
        if (placement === undefined) continue;
        const kind = kinds[placement.item];
        if (kind === undefined) continue;
        // Geometry first: most of the query is out of reach, and that test is cheaper than the filters.
        const dx = placement.x - strike.x;
        const dz = placement.z - strike.z;
        const distance = length2(dx, dz);
        if (distance >= bestDistance) continue;
        const radius = (kind.radius ?? 0.5) * (placement.scale ?? 1);
        if (distance - radius > strike.reach) continue;
        if (distance > radius && dx * facingX + dz * facingZ < coneCos * distance) continue;
        if ((strike.accepts !== undefined && !strike.accepts(placement.item)) || field.isDepleted(placement.id)) continue;
        best = placement;
        bestDistance = distance;
      }
      if (searched >= full || (best !== null && bestDistance <= searched)) return best;
    }
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
