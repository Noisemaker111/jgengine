/**
 * Branching upgrade ladders for placed kinds: a shared trunk every instance climbs, then exclusive
 * branches where taking one closes the others. The ladder compiles to ordinary world actions and
 * facts, so the world model still prices, refuses, queues, refunds and saves every step; this module
 * only writes the declarations and reads back which steps an instance can take next.
 */

import type { WorldActionDecl, WorldChanges, WorldFactsDecl, WorldModel, WorldRefusal } from "./worldModel";

/** One rung: what it is called, what it costs and what it changes on the instance. */
export interface UpgradeStepDecl {
  label: string;
  /** One line a panel shows under the label ("Hits three raiders at once"). */
  detail?: string;
  /** Absolute changes paid (negative numbers spend), as on any world action. */
  cost: WorldChanges;
  /** Changes on the instance, keyed without the subject; numbers add, strings and flags set. */
  effect?: WorldChanges;
  /** Seconds the step takes in the action queue; omitted lands at once. */
  takes?: number;
  queue?: string;
  /** News-log line; `{target}` is the instance's label. */
  note?: string;
  /** What a refusal says when the step is not open on that instance. */
  refuse?: string;
}

/** One exclusive branch: its own ladder, open once the trunk is climbed and no other branch is taken. */
export interface UpgradeBranchDecl {
  id: string;
  label: string;
  detail?: string;
  steps: readonly UpgradeStepDecl[];
}

/** The fact names a ladder writes on each instance. */
export interface UpgradePathFactNames {
  /** Trunk steps taken (default `"tier"`). */
  tier: string;
  /** The branch taken, `""` before one is (default `"branch"`). */
  branch: string;
  /** Steps taken on that branch (default `"branch_tier"`). */
  branchTier: string;
}

/** A kind's whole ladder. */
export interface UpgradePathsDecl {
  /** Kind or tag the ladder belongs to; its actions are `on` it. */
  kind: string;
  /** Steps every instance climbs first, in order. */
  trunk?: readonly UpgradeStepDecl[];
  /** Exclusive branches that open after the trunk; taking one closes the rest. */
  branches?: readonly UpgradeBranchDecl[];
  facts?: Partial<UpgradePathFactNames>;
}

/** One step an instance can take next, priced for it, with the refusal if it can't be taken now. */
export interface UpgradeOption {
  action: string;
  /** The branch this step belongs to, or null for a trunk step. */
  branch: string | null;
  branchLabel: string | null;
  /** 1-based position on its own ladder (trunk or branch). */
  step: number;
  label: string;
  detail: string | null;
  /** What it costs right now (negative numbers spend), as the world prices it. */
  cost: WorldChanges;
  /** Null when it can be taken now; otherwise why not (usually the cost). */
  refusal: WorldRefusal | null;
}

/** Where one instance stands on its ladder. */
export interface UpgradeProgress {
  tier: number;
  branch: string | null;
  branchTier: number;
  /** Every step on the instance's route is taken: trunk done and its branch (or the lone ladder) topped out. */
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

/**
 * The facts a kind declares so its ladder can read them: no trunk steps, no branch. Spread them into
 * the kind's own `facts`.
 */
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

/**
 * Compile a ladder into world actions, one per step. A trunk step opens when the instance has taken
 * the steps before it; a branch's first step opens once the trunk is done and no branch is taken, and
 * writes the branch's id, which closes every other branch.
 *
 * @capability upgrade-paths branching upgrade ladders for placed things: a shared trunk, then exclusive branches priced and refused by the world model
 */
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

/** Where an instance stands on its ladder, read from the facts the ladder writes. */
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
