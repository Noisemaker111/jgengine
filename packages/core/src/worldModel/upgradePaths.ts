/**
 * Branching upgrade ladders for placed kinds: a shared trunk every instance climbs, then exclusive
 * branches where taking one closes the others. The ladder compiles to ordinary world actions and
 * facts, so the world model still prices, refuses, queues, refunds and saves every step; this module
 * only writes the declarations and reads back which steps an instance can take next.
 */

import type { WorldActionDecl, WorldChanges, WorldFactsDecl, WorldModel, WorldRefusal } from "./worldModel";

export interface UpgradeStepDecl {
  label: string;
  detail?: string;
  cost: WorldChanges;
  effect?: WorldChanges;
  /** Seconds the step takes in the action queue; omitted lands at once. */
  takes?: number;
  queue?: string;
  note?: string;
  refuse?: string;
}

export interface UpgradeBranchDecl {
  id: string;
  label: string;
  detail?: string;
  steps: readonly UpgradeStepDecl[];
}

export interface UpgradePathFactNames {
  tier: string;
  branch: string;
  branchTier: string;
}

export interface UpgradePathsDecl {
  kind: string;
  trunk?: readonly UpgradeStepDecl[];
  /** Exclusive branches that open after the trunk; taking one closes the rest. */
  branches?: readonly UpgradeBranchDecl[];
  facts?: Partial<UpgradePathFactNames>;
}

/** One step an instance can take next, priced for it, with the refusal if it can't be taken now. */
export interface UpgradeOption {
  action: string;
  branch: string | null;
  branchLabel: string | null;
  /** 1-based position on its own ladder (trunk or branch). */
  step: number;
  label: string;
  detail: string | null;
  cost: WorldChanges;
  /** Null when it can be taken now; otherwise why not (usually the cost). */
  refusal: WorldRefusal | null;
}

export interface UpgradeProgress {
  tier: number;
  branch: string | null;
  branchTier: number;
  complete: boolean;
}

function names(decl: UpgradePathsDecl): UpgradePathFactNames {
  return {
    tier: decl.facts?.tier ?? "tier",
    branch: decl.facts?.branch ?? "branch",
    branchTier: decl.facts?.branchTier ?? "branch_tier",
  };
}

/** The action id of one step: `<kind>:trunk:<n>` or `<kind>:<branch>:<n>`, 1-based. */
export function upgradeStepAction(kind: string, branch: string | null, step: number): string {
  return `${kind}:${branch ?? "trunk"}:${step}`;
}

export function upgradePathFacts(decl: UpgradePathsDecl): WorldFactsDecl {
  const fact = names(decl);
  return { [fact.tier]: 0, [fact.branch]: "", [fact.branchTier]: 0 };
}

function stepAction(
  decl: UpgradePathsDecl,
  step: UpgradeStepDecl,
  whenTarget: WorldActionDecl["whenTarget"],
  advance: WorldChanges,
  fallbackRefuse: string,
): WorldActionDecl {
  return {
    label: step.label,
    on: decl.kind,
    whenTarget,
    refuse: step.refuse ?? fallbackRefuse,
    cost: step.cost,
    effect: { ...step.effect, ...advance },
    ...(step.takes === undefined ? {} : { takes: step.takes }),
    ...(step.queue === undefined ? {} : { queue: step.queue }),
    ...(step.note === undefined ? {} : { note: step.note }),
  };
}

/** @capability upgrade-paths branching upgrade ladders for placed things: a shared trunk, then exclusive branches priced and refused by the world model */
export function upgradePathActions(decl: UpgradePathsDecl): Record<string, WorldActionDecl> {
  const fact = names(decl);
  const trunk = decl.trunk ?? [];
  const branches = decl.branches ?? [];
  const seen = new Set<string>();
  const actions: Record<string, WorldActionDecl> = {};
  trunk.forEach((step, index) => {
    actions[upgradeStepAction(decl.kind, null, index + 1)] = stepAction(
      decl,
      step,
      { [fact.tier]: index },
      { [fact.tier]: 1 },
      index === 0 ? "Already upgraded" : `Needs ${trunk[index - 1]!.label} first`,
    );
  });
  for (const branch of branches) {
    if (branch.id === "" || branch.id === "trunk") throw new Error(`upgrade paths: "${decl.kind}" has a branch with the reserved id "${branch.id}"`);
    if (seen.has(branch.id)) throw new Error(`upgrade paths: "${decl.kind}" declares branch "${branch.id}" twice`);
    seen.add(branch.id);
    branch.steps.forEach((step, index) => {
      const opens = index === 0;
      actions[upgradeStepAction(decl.kind, branch.id, index + 1)] = stepAction(
        decl,
        step,
        {
          [fact.tier]: trunk.length,
          [fact.branch]: opens ? "" : branch.id,
          [fact.branchTier]: index,
        },
        opens ? { [fact.branch]: branch.id, [fact.branchTier]: 1 } : { [fact.branchTier]: 1 },
        opens
          ? trunk.length === 0 ? "Another path is already taken" : `Opens after ${trunk[trunk.length - 1]!.label}, one path only`
          : `Needs ${branch.steps[index - 1]!.label} first`,
      );
    });
  }
  return actions;
}

export function upgradeProgress(world: WorldModel, decl: UpgradePathsDecl, instanceId: string): UpgradeProgress {
  const fact = names(decl);
  const tier = world.num(`${instanceId}.${fact.tier}`);
  const taken = world.fact(`${instanceId}.${fact.branch}`);
  const branch = typeof taken === "string" && taken !== "" ? taken : null;
  const branchTier = world.num(`${instanceId}.${fact.branchTier}`);
  const trunkDone = tier >= (decl.trunk?.length ?? 0);
  const branches = decl.branches ?? [];
  const complete = !trunkDone
    ? false
    : branches.length === 0
      ? true
      : branch !== null && branchTier >= (branches.find((entry) => entry.id === branch)?.steps.length ?? 0);
  return { tier, branch, branchTier, complete };
}

/**
 * The steps an instance can take next: the next trunk step while the trunk is unfinished, then the
 * first step of every branch, then only the next step of the branch it took. Each option is priced and
 * checked by the world, so a panel can show the cost and grey out what the purse can't cover.
 *
 * @capability upgrade-options list the next upgrade steps a placed thing can take, priced and checked by the world
 */
export function upgradeOptions(world: WorldModel, decl: UpgradePathsDecl, instanceId: string): UpgradeOption[] {
  const progress = upgradeProgress(world, decl, instanceId);
  const trunk = decl.trunk ?? [];
  const option = (branch: UpgradeBranchDecl | null, index: number, step: UpgradeStepDecl): UpgradeOption => {
    const action = upgradeStepAction(decl.kind, branch?.id ?? null, index + 1);
    return {
      action,
      branch: branch?.id ?? null,
      branchLabel: branch?.label ?? null,
      step: index + 1,
      label: step.label,
      detail: step.detail ?? null,
      cost: world.costOf(action, instanceId),
      refusal: world.canAct(action, instanceId),
    };
  };
  if (progress.tier < trunk.length) return [option(null, progress.tier, trunk[progress.tier]!)];
  const branches = decl.branches ?? [];
  if (progress.branch === null) return branches.flatMap((branch) => (branch.steps.length === 0 ? [] : [option(branch, 0, branch.steps[0]!)]));
  const taken = branches.find((branch) => branch.id === progress.branch);
  if (taken === undefined || progress.branchTier >= taken.steps.length) return [];
  return [option(taken, progress.branchTier, taken.steps[progress.branchTier]!)];
}
