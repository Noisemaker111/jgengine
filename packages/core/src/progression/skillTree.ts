import type { AbilityCastType } from "../combat/abilityKit";
import { devtools } from "../devtools/devtools";
import type { StatModifier, StatModifierSet } from "../stats/statModifiers";

/** One node that must be at or above `rank` for a node or synergy to open; `rank` defaults to `1`. */
export interface SkillRequirement {
  nodeId: string;
  rank?: number;
}

/** An action a node or synergy unlocks, shaped to bind straight into `createAbilityKit`'s slot config. */
export interface SkillActiveDef {
  id: string;
  cooldownMs?: number;
  resourceCost?: number;
  castType?: AbilityCastType;
  /** Slot ids whose shared cooldown this action joins. */
  groups?: readonly string[];
}

/**
 * One authored tree node. Every field except `id` is optional data, so a game states its own tree:
 * what a rank costs, what must come first, the passive it folds in and the actions it opens.
 */
export interface SkillNodeDef<TStat extends string = string> {
  id: string;
  /** Grouping for balance and UI; nodes with no branch share `""`. */
  branch?: string;
  /** Points one rank of this node costs (default `1`). */
  cost?: number;
  /** Ranks this node holds (default `1`). */
  maxRank?: number;
  /** Nodes and minimum ranks that must be spent before this node opens at all. */
  requires?: readonly SkillRequirement[];
  /** Points that must already sit in this node's branch, excluding this node's own ranks. */
  requiresPointsInBranch?: number;
  /** Nodes that cannot be ranked alongside this one — the exclusivity that makes builds differ. */
  excludes?: readonly string[];
  /** Passive stats one rank adds; multiplicative entries compound per rank. */
  passives?: StatModifierSet<TStat>;
  /** Actions unlocked by one or more ranks. */
  actives?: readonly SkillActiveDef[];
  /** Free-form tags for caller filters and UI. */
  tags?: readonly string[];
}

/**
 * A payoff that exists only when two or more nodes are ranked together. This is what rewards
 * breadth over dumping every point into one branch.
 */
export interface SkillSynergyDef<TStat extends string = string> {
  id: string;
  /** At least two distinct nodes, each at or above its required rank. */
  requires: readonly SkillRequirement[];
  /** Passive stats added once while the synergy is live. */
  passives?: StatModifierSet<TStat>;
  /** Actions unlocked while the synergy is live. */
  actives?: readonly SkillActiveDef[];
  tags?: readonly string[];
}

/** Everything {@link createSkillTree} reads: nodes, optional synergies, and starting points. */
export interface SkillTreeConfig<TStat extends string = string> {
  nodes: readonly SkillNodeDef<TStat>[];
  synergies?: readonly SkillSynergyDef<TStat>[];
  /** Points the character starts with (default `0`). */
  points?: number;
}

/** Why a spend was refused; each reason is reachable from authored data, so a UI can say which rule bit. */
export type SkillSpendReason =
  | "unknown-node"
  | "max-rank"
  | "no-points"
  | "requires"
  | "branch-points"
  | "excluded";

/** The outcome of one spend or legality check: what it costs and the balance after it, or the rule that stopped it. */
export type SkillSpendResult =
  | { ok: true; spent: number; pointsAvailable: number }
  | { ok: false; reason: SkillSpendReason; detail: string };

/** The whole outcome of a build: merged passives, unlocked actions, live synergies and point accounting. */
export interface SkillResolution<TStat extends string = string> {
  /** Merged passives: node passives per rank, then synergy passives, in config order. */
  stats: StatModifierSet<TStat>;
  /** Every unlocked action in config order, deduplicated by id. */
  actives: readonly SkillActiveDef[];
  activeIds: readonly string[];
  /** Ids of the synergies currently satisfied, in config order. */
  synergies: readonly string[];
  /** Rank held per node, keyed by node id and sorted for a stable readout. */
  ranks: Readonly<Record<string, number>>;
  pointsSpent: number;
  pointsAvailable: number;
}

/** Saved tree state: unspent points and the rank of every ranked node. */
export interface SkillTreeState {
  points: number;
  ranks: Record<string, number>;
}

/** A live skill tree over one authored config, with respec, snapshot/restore and an optional devtools probe. */
export interface SkillTree<TStat extends string = string> {
  rank(nodeId: string): number;
  pointsAvailable(): number;
  /** Points currently committed, counting each node's `cost` per rank. */
  pointsSpent(): number;
  pointsInBranch(branch: string): number;
  grantPoints(amount: number): void;
  canSpend(nodeId: string): SkillSpendResult;
  /** Spend one rank of `nodeId`, charging its `cost`; refused without mutation when a rule blocks it. */
  spend(nodeId: string): SkillSpendResult;
  /** Refund every spent point and clear every rank. Returns the exact number refunded. */
  respec(): { refunded: number; pointsAvailable: number };
  resolved(): SkillResolution<TStat>;
  snapshot(): SkillTreeState;
  /** Replace state from a save; refuses without mutation when it names unknown nodes or malformed counts. */
  restore(next: SkillTreeState): boolean;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

const DEFAULT_BRANCH = "";

function check(condition: boolean, message: string): void {
  if (!condition) throw new RangeError(message);
}

function requirementRank(requirement: SkillRequirement): number {
  return requirement.rank ?? 1;
}

function mergePassives<TStat extends string>(
  target: StatModifierSet<TStat>,
  source: StatModifierSet<TStat> | undefined,
  ranks: number,
): void {
  if (source === undefined || ranks <= 0) return;
  for (const stat of Object.keys(source) as TStat[]) {
    const modifier: StatModifier | undefined = source[stat];
    if (modifier === undefined) continue;
    const entry = target[stat] ?? {};
    if (modifier.add !== undefined) entry.add = (entry.add ?? 0) + modifier.add * ranks;
    if (modifier.multiply !== undefined) entry.multiply = (entry.multiply ?? 1) * modifier.multiply ** ranks;
    target[stat] = entry;
  }
}

/** Check tree data before play; throws `RangeError` naming the offending node, requirement or synergy. */
export function assertSkillTreeConfig<TStat extends string>(config: SkillTreeConfig<TStat>): void {
  check(config.nodes.length > 0, "Skill tree needs at least one node");
  const nodes = new Map<string, SkillNodeDef<TStat>>();
  for (const node of config.nodes) {
    check(node.id.trim() !== "", "Skill node id must not be empty");
    check(!nodes.has(node.id), `Skill node "${node.id}" is declared twice`);
    nodes.set(node.id, node);
  }
  for (const node of config.nodes) {
    const cost = node.cost ?? 1;
    const maxRank = node.maxRank ?? 1;
    check(Number.isInteger(cost) && cost >= 1, `Skill node "${node.id}" cost must be an integer >= 1`);
    check(Number.isInteger(maxRank) && maxRank >= 1, `Skill node "${node.id}" maxRank must be an integer >= 1`);
    const branchPoints = node.requiresPointsInBranch ?? 0;
    check(Number.isInteger(branchPoints) && branchPoints >= 0, `Skill node "${node.id}" requiresPointsInBranch must be an integer >= 0`);
    for (const requirement of node.requires ?? []) requireNode(nodes, node.id, requirement);
    for (const excluded of node.excludes ?? []) {
      check(excluded !== node.id, `Skill node "${node.id}" cannot exclude itself`);
      check(nodes.has(excluded), `Skill node "${node.id}" excludes unknown node "${excluded}"`);
    }
  }
  const synergyIds = new Set<string>();
  for (const synergy of config.synergies ?? []) {
    check(synergy.id.trim() !== "", "Skill synergy id must not be empty");
    check(!synergyIds.has(synergy.id), `Skill synergy "${synergy.id}" is declared twice`);
    synergyIds.add(synergy.id);
    const distinct = new Set(synergy.requires.map((requirement) => requirement.nodeId));
    check(distinct.size >= 2, `Skill synergy "${synergy.id}" must require at least two different nodes`);
    for (const requirement of synergy.requires) requireNode(nodes, synergy.id, requirement);
  }
  check(Number.isInteger(config.points ?? 0) && (config.points ?? 0) >= 0, "Skill tree points must be an integer >= 0");
}

function requireNode<TStat extends string>(
  nodes: Map<string, SkillNodeDef<TStat>>,
  owner: string,
  requirement: SkillRequirement,
): void {
  const target = nodes.get(requirement.nodeId);
  if (target === undefined) throw new RangeError(`"${owner}" requires unknown node "${requirement.nodeId}"`);
  const rank = requirementRank(requirement);
  check(Number.isInteger(rank) && rank >= 1, `"${owner}" requires an integer rank >= 1 of "${requirement.nodeId}"`);
  const maxRank = target.maxRank ?? 1;
  check(rank <= maxRank, `"${owner}" requires rank ${rank} of "${requirement.nodeId}", which holds ${maxRank}`);
}

/**
 * A data-authored skill tree: nodes carry a point cost, prerequisites, passives and unlocked actions,
 * synergies pay off two or more nodes together, and `respec` refunds exactly the points spent. Spend
 * against `canSpend` for a reason a UI can show; read `resolved()` for the stat modifiers and action
 * list to feed `createStats` / `createAbilityKit`.
 *
 * @capability skill-tree spend, refuse and refund points over an authored tree with passives, actives and synergies
 */
export function createSkillTree<TStat extends string = string>(
  config: SkillTreeConfig<TStat>,
  options: { devtoolsName?: string } = {},
): SkillTree<TStat> {
  assertSkillTreeConfig(config);
  const nodes = new Map<string, SkillNodeDef<TStat>>();
  for (const node of config.nodes) nodes.set(node.id, node);
  const blockedBy = new Map<string, string[]>();
  const block = (from: string, target: string): void => {
    const list = blockedBy.get(from);
    if (list === undefined) blockedBy.set(from, [target]);
    else if (!list.includes(target)) list.push(target);
  };
  for (const node of config.nodes) {
    for (const excluded of node.excludes ?? []) {
      block(node.id, excluded);
      block(excluded, node.id);
    }
  }
  const synergies = config.synergies ?? [];
  const branchOf = (node: SkillNodeDef<TStat>): string => node.branch ?? DEFAULT_BRANCH;
  const ranks = new Map<string, number>();
  let points = config.points ?? 0;
  let cache: SkillResolution<TStat> | null = null;

  const rank = (nodeId: string): number => ranks.get(nodeId) ?? 0;

  const pointsSpent = (): number => {
    let total = 0;
    for (const [nodeId, count] of ranks) total += (nodes.get(nodeId)?.cost ?? 1) * count;
    return total;
  };

  const pointsInBranch = (branch: string): number => {
    let total = 0;
    for (const node of nodes.values()) {
      if (branchOf(node) === branch) total += rank(node.id);
    }
    return total;
  };

  const readSnapshot = (): SkillTreeState => {
    const out: Record<string, number> = {};
    for (const [nodeId, count] of ranks) if (count > 0) out[nodeId] = count;
    return { points, ranks: out };
  };

  const canSpend = (nodeId: string): SkillSpendResult => {
    const node = nodes.get(nodeId);
    if (node === undefined) return { ok: false, reason: "unknown-node", detail: `no node "${nodeId}"` };
    const cost = node.cost ?? 1;
    const maxRank = node.maxRank ?? 1;
    if (rank(nodeId) >= maxRank) return { ok: false, reason: "max-rank", detail: `"${nodeId}" is already at rank ${maxRank}` };
    if (points < cost) return { ok: false, reason: "no-points", detail: `"${nodeId}" costs ${cost}, ${points} available` };
    for (const requirement of node.requires ?? []) {
      const needed = requirementRank(requirement);
      if (rank(requirement.nodeId) < needed) {
        return { ok: false, reason: "requires", detail: `"${nodeId}" needs rank ${needed} of "${requirement.nodeId}"` };
      }
    }
    const branchPoints = node.requiresPointsInBranch ?? 0;
    if (branchPoints > 0) {
      const invested = pointsInBranch(branchOf(node)) - rank(nodeId);
      if (invested < branchPoints) {
        return { ok: false, reason: "branch-points", detail: `"${nodeId}" needs ${branchPoints} points in branch "${branchOf(node)}"` };
      }
    }
    for (const excluded of blockedBy.get(nodeId) ?? []) {
      if (rank(excluded) > 0) return { ok: false, reason: "excluded", detail: `"${nodeId}" cannot be ranked beside "${excluded}"` };
    }
    return { ok: true, spent: cost, pointsAvailable: points - cost };
  };

  const resolve = (): SkillResolution<TStat> => {
    const stats: StatModifierSet<TStat> = {};
    const actives: SkillActiveDef[] = [];
    const seenActives = new Set<string>();
    const addActives = (list: readonly SkillActiveDef[] | undefined): void => {
      for (const active of list ?? []) {
        if (seenActives.has(active.id)) continue;
        seenActives.add(active.id);
        actives.push({ ...active });
      }
    };

    for (const node of nodes.values()) {
      const count = rank(node.id);
      if (count <= 0) continue;
      mergePassives(stats, node.passives, count);
      addActives(node.actives);
    }

    const live: string[] = [];
    for (const synergy of synergies) {
      const satisfied = synergy.requires.every((requirement) => rank(requirement.nodeId) >= requirementRank(requirement));
      if (!satisfied) continue;
      live.push(synergy.id);
      mergePassives(stats, synergy.passives, 1);
      addActives(synergy.actives);
    }

    const ranksOut: Record<string, number> = {};
    for (const nodeId of [...ranks.keys()].sort()) ranksOut[nodeId] = rank(nodeId);
    return {
      stats,
      actives,
      activeIds: actives.map((active) => active.id),
      synergies: live,
      ranks: ranksOut,
      pointsSpent: pointsSpent(),
      pointsAvailable: points,
    };
  };

  const probe = options.devtoolsName === undefined
    ? null
    : devtools.probes.register(options.devtoolsName, () => {
      const resolved = resolve();
      return {
        pointsAvailable: resolved.pointsAvailable,
        pointsSpent: resolved.pointsSpent,
        ranks: resolved.ranks,
        synergies: resolved.synergies,
        actives: resolved.activeIds,
      };
    });

  const tree: SkillTree<TStat> = {
    rank,
    pointsAvailable: () => points,
    pointsSpent,
    pointsInBranch,
    grantPoints(amount) {
      if (!Number.isInteger(amount) || amount <= 0) return;
      points += amount;
      cache = null;
    },
    canSpend,
    spend(nodeId) {
      const result = canSpend(nodeId);
      if (!result.ok) return result;
      points -= result.spent;
      ranks.set(nodeId, rank(nodeId) + 1);
      cache = null;
      return { ok: true, spent: result.spent, pointsAvailable: points };
    },
    respec() {
      const refunded = pointsSpent();
      points += refunded;
      ranks.clear();
      cache = null;
      return { refunded, pointsAvailable: points };
    },
    resolved() {
      cache ??= resolve();
      return cache;
    },
    snapshot: readSnapshot,
    restore(next) {
      if (!Number.isInteger(next.points) || next.points < 0) return false;
      if (next.ranks === null || typeof next.ranks !== "object") return false;
      const restored = new Map<string, number>();
      for (const [nodeId, count] of Object.entries(next.ranks)) {
        const node = nodes.get(nodeId);
        if (node === undefined) return false;
        if (!Number.isInteger(count) || count < 0 || count > (node.maxRank ?? 1)) return false;
        if (count > 0) restored.set(nodeId, count);
      }
      points = next.points;
      ranks.clear();
      for (const [nodeId, count] of restored) ranks.set(nodeId, count);
      cache = null;
      return true;
    },
    dispose() {
      probe?.();
    },
  };
  return tree;
}
