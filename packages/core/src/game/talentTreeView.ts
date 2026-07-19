import type { TalentNodeDef, TalentRequirement, TalentTree } from "./talents";

/**
 * Render state of a talent node, derived from its rank and prerequisite satisfaction.
 * - `locked` — rank 0 and at least one prerequisite unmet; cannot be trained yet.
 * - `available` — rank 0, every prerequisite met; ready to take a first point.
 * - `learned` — at least one rank invested, but below `maxRank`.
 * - `maxed` — fully invested (`rank === maxRank`).
 */
export type TalentNodeState = "locked" | "available" | "learned" | "maxed";

/** One prerequisite edge into a node — the source node, the rank it demands, and whether that is met. */
export interface TalentEdgeView {
  /** Prerequisite node id (edge source). */
  from: string;
  /** Rank the prerequisite must reach for this edge to be satisfied. */
  rank: number;
  /** Whether the prerequisite currently sits at or above the required rank. */
  met: boolean;
}

/** A per-node view for rendering: grid placement (tier/branch), rank, state, and inbound prerequisite edges. */
export interface TalentNodeView {
  /** Stable node id (matches the {@link TalentNodeDef}). */
  id: string;
  /** Branch key the node belongs to (`""` when the def has none) — a free string the game styles/columns by. */
  branch: string;
  /** 0-based prerequisite depth: `0` for a root, else `1 + max(tier of prerequisites)`. Drives row/tier layout. */
  tier: number;
  /** Points currently invested in the node. */
  rank: number;
  /** Maximum points the node accepts. */
  maxRank: number;
  /** Derived render state (see {@link TalentNodeState}). */
  state: TalentNodeState;
  /** Whether a point can be spent on the node right now (mirrors `tree.canAllocate(id).ok`). */
  allocatable: boolean;
  /** Inbound prerequisite edges, in definition order. */
  requires: readonly TalentEdgeView[];
}

/** A whole-tree render view: placed nodes plus branch/tier extents and point totals. */
export interface TalentTreeView {
  /** Every node, in definition order, with its render placement and state. */
  nodes: readonly TalentNodeView[];
  /** Distinct branch keys, in first-seen (definition) order — the natural column order. */
  branches: readonly string[];
  /** Number of tiers, i.e. `max(tier) + 1` (0 when the tree is empty). */
  tiers: number;
  /** Points the player still has to spend. */
  pointsAvailable: number;
  /** Points already invested across the tree. */
  pointsSpent: number;
}

const DEFAULT_BRANCH = "";

function requirementNode(requirement: TalentRequirement): string {
  return typeof requirement === "string" ? requirement : requirement.nodeId;
}

function requirementRank(requirement: TalentRequirement): number {
  return typeof requirement === "string" ? 1 : requirement.rank;
}

/**
 * Compute each node's tier as its longest prerequisite chain depth, memoized. Cycles and
 * dangling prerequisite ids are treated as tier `0` contributions so the pass always terminates.
 */
function computeTiers(byId: Map<string, TalentNodeDef>): Map<string, number> {
  const tiers = new Map<string, number>();
  const visiting = new Set<string>();

  function tierOf(id: string): number {
    const cached = tiers.get(id);
    if (cached !== undefined) return cached;
    const node = byId.get(id);
    if (node === undefined || visiting.has(id)) return 0;
    visiting.add(id);
    let depth = 0;
    for (const requirement of node.requires ?? []) {
      const reqId = requirementNode(requirement);
      if (byId.has(reqId)) depth = Math.max(depth, tierOf(reqId) + 1);
    }
    visiting.delete(id);
    tiers.set(id, depth);
    return depth;
  }

  for (const id of byId.keys()) tierOf(id);
  return tiers;
}

/**
 * Project the existing talent model (`createTalentTree`) into a flat, serializable render view: every
 * node placed by branch + prerequisite-depth tier, tagged learned/available/locked/maxed, with its
 * inbound prerequisite edges (and whether each is met) and whether a point can be spent right now. It is
 * a pure read over the node defs plus a live {@link TalentTree}, so a React/canvas widget can lay out
 * nodes, draw edges, and gate clicks without re-deriving topology or re-interpreting eligibility. The
 * model still owns allocation, requirements, and point rules — this only reshapes them for drawing, and
 * never interprets what a node *means* (ids, branches, and ranks stay opaque game data).
 *
 * @capability talent-tree-view flatten a talent tree into a placed, per-node render view — branch/tier layout, learned/available/locked/maxed state, prerequisite edges
 */
export function talentTreeView<TStat extends string = string>(
  nodes: readonly TalentNodeDef<TStat>[],
  tree: TalentTree<TStat>,
): TalentTreeView {
  const byId = new Map<string, TalentNodeDef<TStat>>();
  for (const node of nodes) byId.set(node.id, node);
  const tiers = computeTiers(byId as unknown as Map<string, TalentNodeDef>);

  const branches: string[] = [];
  const seenBranches = new Set<string>();
  let maxTier = -1;

  const viewNodes: TalentNodeView[] = nodes.map((node) => {
    const branch = node.branch ?? DEFAULT_BRANCH;
    if (!seenBranches.has(branch)) {
      seenBranches.add(branch);
      branches.push(branch);
    }
    const tier = tiers.get(node.id) ?? 0;
    if (tier > maxTier) maxTier = tier;

    const rank = tree.rank(node.id);
    const requires: TalentEdgeView[] = (node.requires ?? []).map((requirement) => {
      const from = requirementNode(requirement);
      const required = requirementRank(requirement);
      return { from, rank: required, met: tree.rank(from) >= required };
    });

    let state: TalentNodeState;
    if (rank >= node.maxRank) state = "maxed";
    else if (rank > 0) state = "learned";
    else state = requires.every((edge) => edge.met) ? "available" : "locked";

    return {
      id: node.id,
      branch,
      tier,
      rank,
      maxRank: node.maxRank,
      state,
      allocatable: tree.canAllocate(node.id).ok,
      requires,
    };
  });

  return {
    nodes: viewNodes,
    branches,
    tiers: maxTier + 1,
    pointsAvailable: tree.pointsAvailable(),
    pointsSpent: tree.pointsSpent(),
  };
}
