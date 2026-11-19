import { clamp } from "../math/scalar";
import { resolveRng } from "../random/resolveRng";
import { createRefillSlots } from "../time/refillSlots";

/** A quantity that is either fixed or a uniformly sampled `[min, max]` range resolved by the field rng. */
export type Quantity = number | readonly [number, number];

export interface ResourceYield {
  /** Generic resource kind id — "wood", "ore", "fiber", "hide". The field never interprets it. */
  kind: string;
  /** Base amount granted per harvest hit; a `[min, max]` range samples deterministic variance from the field rng. */
  amount: Quantity;
}

export interface ResourceNodeDef {
  id: string;
  budget: number;
  resources: readonly ResourceYield[];
  /** Seconds to refill after depletion. Omit for a node that never respawns (a one-shot deposit). */
  respawn?: number;
  /** Budget restored on respawn; defaults to `budget`. */
  respawnBudget?: number;
}

export interface ToolProfile {
  /** Budget consumed per harvest hit; defaults to 1. Clamped to the node's remaining budget. */
  power?: number;
  biases?: Readonly<Record<string, number>>;
  /** Multiplier for resource kinds not listed in `biases`; defaults to 1 (set 0 for a tool that only extracts listed kinds). */
  defaultBias?: number;
}

export interface HarvestOptions {
  /** Scalar applied to every granted amount — a stronger creature/harvester yields more; defaults to 1. */
  multiplier?: number;
}

export interface ResourceGrant {
  kind: string;
  amount: number;
}

export interface HarvestResult {
  nodeId: string;
  granted: readonly ResourceGrant[];
  spent: number;
  harvested: boolean;
  depleted: boolean;
}

export interface ResourceNodeState {
  id: string;
  budget: number;
  maxBudget: number;
  depleted: boolean;
  /** Seconds remaining until respawn; 0 when full or when the node never respawns. */
  respawnTimer: number;
  respawnBlocked: boolean;
  /** 0..1 remaining fraction of `maxBudget`. */
  fraction: number;
}

export interface ResourceNodeFieldConfig {
  nodes: readonly ResourceNodeDef[];
  resolve?: (nodeId: string) => ResourceNodeDef | null;
  /** Injected [0,1) generator for deterministic yield variance. Omitting it falls back to `Math.random` and warns once. */
  rng?: () => number;
  /**
   * Freeze respawn for a node while this returns true — a structure within radius, a nearby occupant.
   * Consulted every tick alongside the per-node `respawnBlocked` flag (either one suppresses).
   */
  respawnSuppressed?: (state: ResourceNodeState) => boolean;
}

export interface ResourceNodeField {
  harvest(nodeId: string, tool: ToolProfile, options?: HarvestOptions): HarvestResult;
  tick(dt: number): void;
  state(nodeId: string): ResourceNodeState;
  isDepleted(nodeId: string): boolean;
  setRespawnBlocked(nodeId: string, blocked: boolean): void;
  ids(): readonly string[];
  snapshot(): Record<string, ResourceNodeState>;
  hydrate(snapshot: Record<string, ResourceNodeState>): void;
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
  respawnBlocked: boolean;
}

function toState(node: NodeRuntime, depleted: boolean, respawnTimer: number): ResourceNodeState {
  return {
    id: node.def.id,
    budget: node.budget,
    maxBudget: node.maxBudget,
    depleted,
    respawnTimer,
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
  const rng = resolveRng(config.rng, "createResourceNode");
  const nodes = new Map<string, NodeRuntime>();
  const order: string[] = [];

  const slots = createRefillSlots({ slots: [], refillSeconds: [0, 0] }, rng);
  const waiting = new Set<string>();
  let now = 0;
  const stateOf = (node: NodeRuntime): ResourceNodeState => {
    const id = node.def.id;
    return toState(node, !slots.isFilled(id), slots.remaining(id, now));
  };

  const listed = new Set<string>();
  const materialize = (def: ResourceNodeDef): NodeRuntime => {
    const node: NodeRuntime = {
      def,
      budget: def.budget,
      maxBudget: def.budget,
      respawnBudget: def.respawnBudget ?? def.budget,
      respawnBlocked: false,
    };
    nodes.set(def.id, node);
    order.push(def.id);
    slots.add(def.id);
    if (def.budget > 0) slots.fill(def.id);
    else if (def.respawn !== undefined) waiting.add(def.id);
    return node;
  };
  for (const def of config.nodes) {
    if (nodes.has(def.id)) throw new Error(`duplicate resource node "${def.id}"`);
    listed.add(def.id);
    materialize(def);
  }

  const getNode = (id: string): NodeRuntime => {
    const node = nodes.get(id);
    if (node !== undefined) return node;
    const resolved = config.resolve?.(id) ?? null;
    if (resolved === null || resolved.id !== id) throw new Error(`unknown resource node "${id}"`);
    return materialize(resolved);
  };
  const forget = (id: string): void => {
    nodes.delete(id);
    slots.remove(id);
    waiting.delete(id);
    order.splice(order.indexOf(id), 1);
  };

  const isSuppressed = (node: NodeRuntime): boolean => {
    if (node.respawnBlocked) return true;
    if (config.respawnSuppressed === undefined) return false;
    return config.respawnSuppressed(stateOf(node));
  };

  return {
    harvest(nodeId, tool, options = {}) {
      const node = getNode(nodeId);
      if (!slots.isFilled(nodeId) || node.budget <= 0) {
        return { nodeId, granted: [], spent: 0, harvested: false, depleted: !slots.isFilled(nodeId) };
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
        depleted = true;
        slots.empty(nodeId, now, node.def.respawn ?? 0);
        if (node.def.respawn !== undefined) waiting.add(nodeId);
      }

      return { nodeId, granted, spent, harvested: true, depleted };
    },
    tick(dt) {
      if (dt <= 0) return;
      now += dt;
      for (const id of waiting) {
        const node = nodes.get(id)!;
        if (isSuppressed(node)) {
          slots.postpone(id, dt);
          continue;
        }
        if (slots.remaining(id, now) > 0) continue;
        node.budget = node.respawnBudget;
        slots.fill(id);
        waiting.delete(id);
        if (!listed.has(id) && node.budget >= node.maxBudget) forget(id);
      }
    },
    state(nodeId) {
      return stateOf(getNode(nodeId));
    },
    isDepleted(nodeId) {
      // An untouched resolvable node is full; asking must not materialize it.
      const node = nodes.get(nodeId);
      if (node !== undefined) return !slots.isFilled(nodeId);
      if (config.resolve?.(nodeId)?.id === nodeId) return false;
      throw new Error(`unknown resource node "${nodeId}"`);
    },
    setRespawnBlocked(nodeId, blocked) {
      getNode(nodeId).respawnBlocked = blocked;
    },
    ids() {
      return order;
    },
    snapshot() {
      const out: Record<string, ResourceNodeState> = {};
      for (const id of order) out[id] = stateOf(nodes.get(id)!);
      return out;
    },
    hydrate(snapshot) {
      for (const id of [...order]) if (!listed.has(id) && snapshot[id] === undefined) forget(id);
      for (const id of Object.keys(snapshot)) if (!nodes.has(id) && config.resolve?.(id)?.id === id) getNode(id);
      for (const id of order) {
        const saved = snapshot[id];
        if (saved === undefined) continue;
        const node = nodes.get(id)!;
        node.budget = saved.budget;
        if (saved.depleted) {
          slots.empty(id, now, saved.respawnTimer);
          if (node.def.respawn !== undefined) waiting.add(id);
        } else {
          slots.fill(id);
          waiting.delete(id);
        }
        node.respawnBlocked = saved.respawnBlocked;
      }
    },
  };
}
