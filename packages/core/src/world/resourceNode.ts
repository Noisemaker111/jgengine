/** A quantity that is either fixed or a uniformly sampled `[min, max]` range resolved by the field rng. */
export type Quantity = number | readonly [number, number];

/** One resource kind a node can yield and its base per-harvest amount (before tool bias and harvester multiplier). */
export interface ResourceYield {
  /** Generic resource kind id — "wood", "ore", "fiber", "hide". The field never interprets it. */
  kind: string;
  /** Base amount granted per harvest hit; a `[min, max]` range samples deterministic variance from the field rng. */
  amount: Quantity;
}

/** A harvestable node definition: a finite budget, the resources it yields, and how it respawns. */
export interface ResourceNodeDef {
  id: string;
  /** Total harvestable budget (hit points / finite quantity). Each harvest consumes the tool's `power`. */
  budget: number;
  /** Resource kinds this node can yield; a tool's bias selects and scales among them. */
  resources: readonly ResourceYield[];
  /** Seconds to refill after depletion. Omit for a node that never respawns (a one-shot deposit). */
  respawn?: number;
  /** Budget restored on respawn; defaults to `budget`. */
  respawnBudget?: number;
}

/**
 * How a tool extracts from a node — its per-hit power and per-resource yield bias. Two profiles over the
 * same multi-resource node return different resources and amounts: the generic pick-vs-hatchet mechanic.
 */
export interface ToolProfile {
  /** Budget consumed per harvest hit; defaults to 1. Clamped to the node's remaining budget. */
  power?: number;
  /** Per-resource-kind yield multiplier. A kind absent here falls back to `defaultBias`. */
  biases?: Readonly<Record<string, number>>;
  /** Multiplier for resource kinds not listed in `biases`; defaults to 1 (set 0 for a tool that only extracts listed kinds). */
  defaultBias?: number;
}

/** Options for a single harvest. */
export interface HarvestOptions {
  /** Scalar applied to every granted amount — a stronger creature/harvester yields more; defaults to 1. */
  multiplier?: number;
}

/** One resource kind granted by a harvest and its resolved amount. */
export interface ResourceGrant {
  kind: string;
  amount: number;
}

/** Outcome of one harvest attempt. */
export interface HarvestResult {
  nodeId: string;
  /** Resources granted this harvest; empty when the node was already depleted or the tool extracted nothing. */
  granted: readonly ResourceGrant[];
  /** Budget actually consumed (0 when the node was already depleted). */
  spent: number;
  /** Whether the node still had budget and produced a harvest. */
  harvested: boolean;
  /** Whether this harvest reduced the node to empty. */
  depleted: boolean;
}

/** Serializable per-node runtime state — round-trips through save/load and multiplayer sync. */
export interface ResourceNodeState {
  id: string;
  /** Remaining budget. */
  budget: number;
  /** Budget the node refills to on respawn — the nominal "full" value for `fraction`. */
  maxBudget: number;
  depleted: boolean;
  /** Seconds remaining until respawn; 0 when full or when the node never respawns. */
  respawnTimer: number;
  /** Explicit respawn-block flag (a structure claimed the spot); OR-ed with the field's suppression predicate. */
  respawnBlocked: boolean;
  /** 0..1 remaining fraction of `maxBudget`. */
  fraction: number;
}

export interface ResourceNodeFieldConfig {
  nodes: readonly ResourceNodeDef[];
  /** Injected [0,1) generator for deterministic yield variance; defaults to `Math.random`. */
  rng?: () => number;
  /**
   * Freeze respawn for a node while this returns true — a structure within radius, a nearby occupant.
   * Consulted every tick alongside the per-node `respawnBlocked` flag (either one suppresses).
   */
  respawnSuppressed?: (state: ResourceNodeState) => boolean;
}

/** A set of harvestable nodes: harvest with tool profiles, tick respawn timers, snapshot/hydrate for save-load. */
export interface ResourceNodeField {
  /** Apply one harvest hit with `tool`; returns the granted resources and decrements the node's budget. */
  harvest(nodeId: string, tool: ToolProfile, options?: HarvestOptions): HarvestResult;
  /** Count down respawn timers by `dt`; refill any node whose timer elapses and is not suppressed. */
  tick(dt: number): void;
  state(nodeId: string): ResourceNodeState;
  isDepleted(nodeId: string): boolean;
  /** Set the explicit respawn-block flag; persisted in state and honored by `tick`. */
  setRespawnBlocked(nodeId: string, blocked: boolean): void;
  ids(): readonly string[];
  snapshot(): Record<string, ResourceNodeState>;
  /** Restore mutable per-node state (budget, depletion, timers, block flag) from a {@link snapshot}. */
  hydrate(snapshot: Record<string, ResourceNodeState>): void;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function resolveQuantity(quantity: Quantity, rng: () => number): number {
  if (typeof quantity === "number") return quantity;
  const [lo, hi] = quantity;
  return lo + rng() * (hi - lo);
}

interface NodeRuntime {
  def: ResourceNodeDef;
  budget: number;
  maxBudget: number;
  respawnBudget: number;
  depleted: boolean;
  respawnTimer: number;
  respawnBlocked: boolean;
}

function toState(node: NodeRuntime): ResourceNodeState {
  return {
    id: node.def.id,
    budget: node.budget,
    maxBudget: node.maxBudget,
    depleted: node.depleted,
    respawnTimer: node.respawnTimer,
    respawnBlocked: node.respawnBlocked,
    fraction: node.maxBudget > 0 ? clamp(node.budget / node.maxBudget, 0, 1) : 0,
  };
}

/**
 * A field of depletable, respawning harvest nodes with tool-dependent yields — the generic rock / tree /
 * bush / vein / corpse. Each node holds a finite budget across one or more resource kinds. A harvest applies
 * a {@link ToolProfile} whose per-resource biases decide *which* resources and *how much* the same node
 * returns (pick favors ore, hatchet favors wood), scaled by a creature/harvester multiplier and optional
 * deterministic rng variance; the budget drops by the tool's power. When a node empties it starts a respawn
 * timer that `tick(dt)` counts down and refills — unless respawn is suppressed by the per-node flag or the
 * injected predicate (a structure claimed the spot). All state is plain and serializable for save-load and
 * multiplayer sync via {@link snapshot}/{@link hydrate}.
 *
 * @capability resource-node depletable, respawning harvest nodes with tool-dependent yields
 */
export function createResourceNodeField(config: ResourceNodeFieldConfig): ResourceNodeField {
  const rng = config.rng ?? Math.random;
  const nodes = new Map<string, NodeRuntime>();
  const order: string[] = [];

  for (const def of config.nodes) {
    if (nodes.has(def.id)) throw new Error(`duplicate resource node "${def.id}"`);
    const respawnBudget = def.respawnBudget ?? def.budget;
    nodes.set(def.id, {
      def,
      budget: def.budget,
      maxBudget: def.budget,
      respawnBudget,
      depleted: def.budget <= 0,
      respawnTimer: 0,
      respawnBlocked: false,
    });
    order.push(def.id);
  }

  const getNode = (id: string): NodeRuntime => {
    const node = nodes.get(id);
    if (node === undefined) throw new Error(`unknown resource node "${id}"`);
    return node;
  };

  const isSuppressed = (node: NodeRuntime): boolean => {
    if (node.respawnBlocked) return true;
    if (config.respawnSuppressed === undefined) return false;
    return config.respawnSuppressed(toState(node));
  };

  return {
    harvest(nodeId, tool, options = {}) {
      const node = getNode(nodeId);
      if (node.depleted || node.budget <= 0) {
        return { nodeId, granted: [], spent: 0, harvested: false, depleted: node.depleted };
      }

      const power = tool.power !== undefined && tool.power > 0 ? tool.power : 1;
      const spent = Math.min(power, node.budget);
      const multiplier = options.multiplier ?? 1;
      const defaultBias = tool.defaultBias ?? 1;

      const granted: ResourceGrant[] = [];
      for (const resource of node.def.resources) {
        // Resolve variance for every resource so the rng stream stays independent of tool choice.
        const base = resolveQuantity(resource.amount, rng);
        const bias = tool.biases?.[resource.kind] ?? defaultBias;
        const amount = base * bias * multiplier;
        if (amount > 0) granted.push({ kind: resource.kind, amount });
      }

      node.budget -= spent;
      let depleted = false;
      if (node.budget <= 0) {
        node.budget = 0;
        node.depleted = true;
        depleted = true;
        node.respawnTimer = node.def.respawn ?? 0;
      }

      return { nodeId, granted, spent, harvested: true, depleted };
    },
    tick(dt) {
      if (dt <= 0) return;
      for (const id of order) {
        const node = nodes.get(id)!;
        if (!node.depleted || node.def.respawn === undefined) continue;
        if (isSuppressed(node)) continue;
        node.respawnTimer -= dt;
        if (node.respawnTimer <= 0) {
          node.budget = node.respawnBudget;
          node.depleted = false;
          node.respawnTimer = 0;
        }
      }
    },
    state(nodeId) {
      return toState(getNode(nodeId));
    },
    isDepleted(nodeId) {
      return getNode(nodeId).depleted;
    },
    setRespawnBlocked(nodeId, blocked) {
      getNode(nodeId).respawnBlocked = blocked;
    },
    ids() {
      return order;
    },
    snapshot() {
      const out: Record<string, ResourceNodeState> = {};
      for (const id of order) out[id] = toState(nodes.get(id)!);
      return out;
    },
    hydrate(snapshot) {
      for (const id of order) {
        const saved = snapshot[id];
        if (saved === undefined) continue;
        const node = nodes.get(id)!;
        node.budget = saved.budget;
        node.depleted = saved.depleted;
        node.respawnTimer = saved.respawnTimer;
        node.respawnBlocked = saved.respawnBlocked;
      }
    },
  };
}
