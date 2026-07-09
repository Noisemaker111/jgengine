import type { StatModifierSet } from "../stats/statModifiers";

export type TalentRequirement = string | { nodeId: string; rank: number };

export interface TalentNodeDef<TStat extends string = string> {
  id: string;
  branch?: string;
  maxRank: number;
  requires?: readonly TalentRequirement[];
  requiresPointsInBranch?: number;
  modifiersPerRank?: StatModifierSet<TStat>;
  grantsAbilities?: readonly string[];
}

export type TalentAllocateReason = "unknown-node" | "max-rank" | "no-points" | "requires" | "branch-points";
export type TalentAllocateResult = { ok: true } | { ok: false; reason: TalentAllocateReason };

export interface ResolvedTalents<TStat extends string = string> {
  stats: StatModifierSet<TStat>;
  abilities: readonly string[];
}

export interface TalentSnapshot {
  points: number;
  ranks: Record<string, number>;
}

export interface TalentTreeConfig<TStat extends string = string> {
  nodes: readonly TalentNodeDef<TStat>[];
  points?: number;
}

export interface TalentTree<TStat extends string = string> {
  rank(nodeId: string): number;
  pointsAvailable(): number;
  pointsSpent(): number;
  pointsInBranch(branch: string): number;
  grantPoints(amount: number): void;
  canAllocate(nodeId: string): TalentAllocateResult;
  allocate(nodeId: string): TalentAllocateResult;
  resolved(): ResolvedTalents<TStat>;
  reset(): void;
  snapshot(): TalentSnapshot;
  hydrate(snapshot: TalentSnapshot): void;
}

const DEFAULT_BRANCH = "";

export function createTalentTree<TStat extends string = string>(
  config: TalentTreeConfig<TStat>,
): TalentTree<TStat> {
  const nodesById = new Map<string, TalentNodeDef<TStat>>();
  for (const node of config.nodes) nodesById.set(node.id, node);

  const ranks = new Map<string, number>();
  let points = Math.max(0, config.points ?? 0);
  let cache: ResolvedTalents<TStat> | null = null;

  function rank(nodeId: string): number {
    return ranks.get(nodeId) ?? 0;
  }

  function branchOf(node: TalentNodeDef<TStat>): string {
    return node.branch ?? DEFAULT_BRANCH;
  }

  function pointsInBranch(branch: string): number {
    let total = 0;
    for (const node of nodesById.values()) {
      if (branchOf(node) === branch) total += rank(node.id);
    }
    return total;
  }

  function pointsSpent(): number {
    let total = 0;
    for (const value of ranks.values()) total += value;
    return total;
  }

  function requirementUnmet(requirement: TalentRequirement): boolean {
    const reqNodeId = typeof requirement === "string" ? requirement : requirement.nodeId;
    const reqRank = typeof requirement === "string" ? 1 : requirement.rank;
    return rank(reqNodeId) < reqRank;
  }

  function canAllocate(nodeId: string): TalentAllocateResult {
    const node = nodesById.get(nodeId);
    if (!node) return { ok: false, reason: "unknown-node" };
    const currentRank = rank(nodeId);
    if (currentRank >= node.maxRank) return { ok: false, reason: "max-rank" };
    if (points < 1) return { ok: false, reason: "no-points" };
    for (const requirement of node.requires ?? []) {
      if (requirementUnmet(requirement)) return { ok: false, reason: "requires" };
    }
    if (node.requiresPointsInBranch !== undefined) {
      const inBranch = pointsInBranch(branchOf(node)) - currentRank;
      if (inBranch < node.requiresPointsInBranch) return { ok: false, reason: "branch-points" };
    }
    return { ok: true };
  }

  function resolve(): ResolvedTalents<TStat> {
    const stats: StatModifierSet<TStat> = {};
    const abilities: string[] = [];
    const seenAbilities = new Set<string>();

    for (const node of nodesById.values()) {
      const nodeRank = rank(node.id);
      if (nodeRank <= 0) continue;

      if (node.modifiersPerRank) {
        for (const stat of Object.keys(node.modifiersPerRank) as TStat[]) {
          const modifier = node.modifiersPerRank[stat];
          if (!modifier) continue;
          const entry = stats[stat] ?? {};
          if (modifier.add !== undefined) entry.add = (entry.add ?? 0) + modifier.add * nodeRank;
          if (modifier.multiply !== undefined) {
            entry.multiply = (entry.multiply ?? 1) * Math.pow(modifier.multiply, nodeRank);
          }
          stats[stat] = entry;
        }
      }

      if (node.grantsAbilities) {
        for (const ability of node.grantsAbilities) {
          if (seenAbilities.has(ability)) continue;
          seenAbilities.add(ability);
          abilities.push(ability);
        }
      }
    }

    return { stats, abilities };
  }

  return {
    rank,
    pointsAvailable() {
      return points;
    },
    pointsSpent,
    pointsInBranch,
    grantPoints(amount) {
      if (amount > 0) points += amount;
    },
    canAllocate,
    allocate(nodeId) {
      const result = canAllocate(nodeId);
      if (!result.ok) return result;
      points -= 1;
      ranks.set(nodeId, rank(nodeId) + 1);
      cache = null;
      return { ok: true };
    },
    resolved() {
      if (cache === null) cache = resolve();
      return cache;
    },
    reset() {
      points += pointsSpent();
      ranks.clear();
      cache = null;
    },
    snapshot() {
      const snapshotRanks: Record<string, number> = {};
      for (const [nodeId, value] of ranks) {
        if (value > 0) snapshotRanks[nodeId] = value;
      }
      return { points, ranks: snapshotRanks };
    },
    hydrate(snapshot) {
      ranks.clear();
      points = snapshot.points;
      for (const [nodeId, value] of Object.entries(snapshot.ranks)) {
        const node = nodesById.get(nodeId);
        if (!node) continue;
        const clamped = Math.max(0, Math.min(value, node.maxRank));
        if (clamped > 0) ranks.set(nodeId, clamped);
      }
      cache = null;
    },
  };
}
