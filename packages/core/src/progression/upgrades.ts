import { evalCurve, type Curve } from "../game/progression";
import type { Standing, StandingRequirement } from "./standing";

/**
 * One upgrade node. Its price is the shared progression {@link Curve} evaluated at the rank being
 * bought, so a game authors one curve and every rank of every node follows it.
 */
export interface UpgradeNodeDef {
  id: string;
  label?: string;
  /** Cost of rank `n`, priced by this curve at `n` (1-based). */
  cost: Curve;
  /** Ranks purchasable (default `1`). */
  maxRank?: number;
  /** Node ids that must be owned before this one can be bought. */
  requires?: readonly string[];
  standing?: StandingRequirement;
}

/** Plain JSON state: node id → ranks owned. Nodes at rank `0` are absent. */
export interface UpgradeState {
  ranks: Readonly<Record<string, number>>;
}

/** Why a purchase was refused; the tree is left untouched on any rejection. */
export type UpgradeRejection = "unknown-node" | "max-rank" | "missing-prerequisites" | "standing" | "insufficient-funds";

/** Result of {@link UpgradeTree.buy}: the rank reached and what it cost, or why it was refused. */
export type UpgradeBuy = { ok: true; nodeId: string; rank: number; cost: number } | { ok: false; reason: UpgradeRejection };

/** Authored upgrade nodes with a per-node cost curve, prerequisites, a standing gate and one snapshot. */
export interface UpgradeTree {
  nodes(): readonly UpgradeNodeDef[];
  node(nodeId: string): UpgradeNodeDef | null;
  /** Ranks owned for `nodeId`; `0` when unknown or unowned. */
  rank(nodeId: string): number;
  maxRank(nodeId: string): number;
  /** Price of `rank` (default: the next rank), or `null` when unknown or past the cap. */
  costOf(nodeId: string, rank?: number): number | null;
  /** What buying the next rank needs, without changing anything. */
  canBuy(nodeId: string, actorId: string): UpgradeBuy;
  /** Buy the next rank, charging `pay` only after every gate passes. */
  buy(nodeId: string, actorId: string, pay: (cost: number) => boolean): UpgradeBuy;
  owned(): readonly string[];
  spendTotal(): number;
  snapshot(): UpgradeState;
  restore(next: UpgradeState): void;
}

export interface UpgradeTreeConfig {
  nodes: readonly UpgradeNodeDef[];
  /** The standing a node's requirement reads, for both validation and purchase. */
  standing?: Pick<Standing, "hasTrack" | "standing">;
  /** Rehydrate from a prior {@link UpgradeTree.snapshot}. */
  state?: UpgradeState;
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new RangeError(message);
}

/** Check authored upgrade nodes; throws `RangeError` naming the offending node or field. */
export function assertUpgrades(config: UpgradeTreeConfig): void {
  const nodes = new Set<string>();
  for (const node of config.nodes) {
    const id = node.id.trim();
    check(id !== "", "Upgrade node id must not be empty");
    check(!nodes.has(id), `Upgrade node "${id}" is declared twice`);
    nodes.add(id);
    const maxRank = node.maxRank ?? 1;
    check(Number.isInteger(maxRank) && maxRank >= 1, `Upgrade node "${id}" maxRank must be an integer >= 1`);
    for (let rank = 1; rank <= maxRank; rank += 1) {
      const cost = evalCurve(node.cost, rank);
      check(Number.isFinite(cost) && cost >= 0, `Upgrade node "${id}" cost at rank ${rank} must be finite and >= 0`);
    }
    const standing = node.standing;
    if (standing !== undefined) {
      check(standing.trackId.trim() !== "", `Upgrade node "${id}" names an empty standing track`);
      check(
        config.standing === undefined || config.standing.hasTrack(standing.trackId),
        `Upgrade node "${id}" reads unknown standing track "${standing.trackId}"`,
      );
      check(
        standing.min === undefined || standing.max === undefined || standing.min <= standing.max,
        `Upgrade node "${id}" needs standing min <= max`,
      );
    }
  }
  for (const node of config.nodes) {
    check(!(node.requires ?? []).includes(node.id), `Upgrade node "${node.id}" requires itself`);
    for (const required of node.requires ?? []) {
      check(nodes.has(required), `Upgrade node "${node.id}" requires unknown node "${required}"`);
    }
  }
}

/**
 * An upgrade tree whose prices come from the shared curve primitive: each node authors one cost
 * curve, each rank is that curve at the rank, and a purchase passes prerequisites, a standing gate
 * and the caller's own payment step. State is one rank map that JSON round-trips, so a career save
 * stores what a player paid for rather than the arithmetic behind it.
 *
 * @capability upgrade-tree ranked upgrades priced by a cost curve, gated by prerequisites and standing
 */
export function createUpgradeTree(config: UpgradeTreeConfig): UpgradeTree {
  assertUpgrades(config);
  const definitions = config.nodes.slice();
  const byId = new Map<string, UpgradeNodeDef>();
  for (const node of definitions) byId.set(node.id, node);

  const ranks = new Map<string, number>();
  let spent = 0;

  function load(state: UpgradeState): void {
    ranks.clear();
    spent = 0;
    for (const [nodeId, rank] of Object.entries(state.ranks ?? {})) {
      const node = byId.get(nodeId);
      if (node === undefined || !Number.isInteger(rank) || rank <= 0) continue;
      const capped = Math.min(rank, node.maxRank ?? 1);
      ranks.set(nodeId, capped);
      for (let index = 1; index <= capped; index += 1) spent += evalCurve(node.cost, index);
    }
  }

  if (config.state !== undefined) load(config.state);

  const rankOf = (nodeId: string): number => ranks.get(nodeId) ?? 0;

  function costAt(node: UpgradeNodeDef, rank: number): number | null {
    if (!Number.isInteger(rank) || rank < 1 || rank > (node.maxRank ?? 1)) return null;
    return evalCurve(node.cost, rank);
  }

  function checkBuy(node: UpgradeNodeDef, actorId: string): UpgradeBuy {
    const current = rankOf(node.id);
    if (current >= (node.maxRank ?? 1)) return { ok: false, reason: "max-rank" };
    const missing = (node.requires ?? []).filter((required) => rankOf(required) < 1);
    if (missing.length > 0) return { ok: false, reason: "missing-prerequisites" };
    const standing = node.standing;
    if (standing !== undefined) {
      const reader = config.standing;
      if (reader === undefined) return { ok: false, reason: "standing" };
      const value = reader.standing(actorId, standing.trackId);
      if ((standing.min !== undefined && value < standing.min) || (standing.max !== undefined && value > standing.max)) {
        return { ok: false, reason: "standing" };
      }
    }
    const cost = costAt(node, current + 1);
    if (cost === null) return { ok: false, reason: "max-rank" };
    return { ok: true, nodeId: node.id, rank: current + 1, cost };
  }

  return {
    nodes: () => definitions.slice(),
    node: (nodeId) => byId.get(nodeId) ?? null,
    rank: rankOf,
    maxRank: (nodeId) => byId.get(nodeId)?.maxRank ?? 0,
    costOf(nodeId, rank) {
      const node = byId.get(nodeId);
      if (node === undefined) return null;
      return costAt(node, rank ?? rankOf(nodeId) + 1);
    },
    canBuy: (nodeId, actorId) => {
      const node = byId.get(nodeId);
      if (node === undefined) return { ok: false, reason: "unknown-node" };
      return checkBuy(node, actorId);
    },
    buy(nodeId, actorId, pay) {
      const node = byId.get(nodeId);
      if (node === undefined) return { ok: false, reason: "unknown-node" };
      const checkResult = checkBuy(node, actorId);
      if (!checkResult.ok) return checkResult;
      if (!pay(checkResult.cost)) return { ok: false, reason: "insufficient-funds" };
      ranks.set(nodeId, checkResult.rank);
      spent += checkResult.cost;
      return checkResult;
    },
    owned: () => Array.from(ranks.keys()),
    spendTotal: () => spent,
    snapshot: () => ({ ranks: Object.fromEntries(ranks) }),
    restore: load,
  };
}
