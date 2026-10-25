/**
 * A game-agnostic RTS opponent planner: what an AI economy should make next, given a catalog of
 * buildings, units and research, an ordered opening build order and a sustain phase (worker
 * target, army composition, supply-block avoidance). It never touches entities or positions; the
 * game reports a {@link BuildPlannerView} each decision and turns the returned
 * {@link BuildDecision} into its own commands (place a structure, queue a unit, start research).
 *
 * Live requirements here are "own one completed" or "researched", checked against the view every
 * decision; that differs from `economy/techTree`, whose unlocks are permanent grants. Decision
 * quality comes from the shared {@link DifficultyProfile}: `reactionSeconds` sets how often the AI
 * acts, `decisionNoise` sometimes picks a worse composition option, and `abilityDiscipline`
 * decides whether it saves for what it wants or floats money on something cheaper.
 *
 * Deterministic under an injected rng; work per decision is bounded by catalog size; planner and
 * attack-clock state are small JSON objects with `snapshot()`/`restore()`.
 */

import { pickScored, type DifficultyProfile, type ScoredOption } from "./difficulty";
import { restoreRng, rngStateOf, seededRng } from "../random/rng";
import type { ResourceCost } from "../work/unitTraining";

/** What a catalog entry is: a structure, a trained unit, or a one-time research. */
export type BuildKind = "building" | "unit" | "research";

/** One thing the AI can make. */
export interface BuildCatalogEntry {
  kind: BuildKind;
  /** Price per currency id. */
  cost: ResourceCost;
  /** Ids that must be owned complete (or researched) before this can be made. */
  requires?: readonly string[];
  /** Supply a unit consumes. */
  supply?: number;
  /** Supply cap a building adds once complete. */
  supplyProvided?: number;
  /** The id that trains or researches this; owning one complete is an implicit requirement. */
  producer?: string;
  /** Never hold more than this many (owned + pending). */
  maxCount?: number;
}

/** Everything the AI can make, keyed by id. */
export type BuildCatalog = Readonly<Record<string, BuildCatalogEntry>>;

/** What the game reports to the planner each decision. */
export interface BuildPlannerView {
  /** Game time in seconds. */
  time: number;
  balances: Readonly<Record<string, number>>;
  /** Completed buildings and units; researched ids count as 1. */
  owned: Readonly<Record<string, number>>;
  /** Queued or in-progress counts. */
  pending: Readonly<Record<string, number>>;
  /**
   * `used` is supply held by units; `queued` is supply already reserved by queued units. Omit
   * `queued` and it is derived from `pending` × catalog `supply`; pass `0` when your game's `used`
   * already includes queued units (as a `work/unitTraining` queue that reserves at enqueue does).
   */
  supply: { used: number; cap: number; queued?: number };
  /** Idle producers by id. Omitted means producers are never busy. */
  idleProducers?: Readonly<Record<string, number>>;
}

/** One build-order line: hold `count` (default 1) of `make`, owned plus pending. */
export interface BuildStep {
  make: string;
  count?: number;
}

/** The plan: catalog, opening order and sustain policy. Change it mid-game with `retune`. */
export interface BuildPlanConfig {
  catalog: BuildCatalog;
  /** Opening build order, followed in order. */
  steps?: readonly BuildStep[];
  /** Keep this many workers (owned + pending) once the order is done or blocked. */
  workers?: { id: string; target: number };
  /** Army share by unit id; the unit furthest below its share is made next. */
  composition?: Readonly<Record<string, number>>;
  /** Make the cheapest supply provider when free supply (counting pending) drops below this. */
  supplyBuffer?: number;
  /** Supply cap beyond which no more providers are made. */
  supplyLimit?: number;
  /**
   * `true` waits for the wanted thing when it is unaffordable; `false` spends on something
   * cheaper. Default: saves when the profile's `abilityDiscipline` is at least 0.5 (standard and
   * expert), floats otherwise; saves with no profile.
   */
  saveFor?: boolean;
}

/** Why the planner chose to make something. */
export type BuildMakeReason = "order" | "requirement" | "supply" | "workers" | "composition";

/** Why the planner is not making anything this decision. */
export type BuildWaitReason = "afford" | "supply" | "producer" | "requirement" | "think" | "done";

/** One decision: make `id`, or wait (naming what it waits on when there is one). */
export type BuildDecision =
  | { kind: "make"; id: string; reason: BuildMakeReason }
  | { kind: "wait"; reason: BuildWaitReason; id?: string };

/** The planner's derived pacing, for a HUD or debug readout. */
export interface BuildPlannerTuning {
  /** Seconds between decisions. */
  decisionInterval: number;
  /** Chance a composition pick ignores the best option. */
  decisionNoise: number;
  /** Whether it saves for unaffordable wants instead of floating. */
  saveFor: boolean;
}

/** Serializable planner state. */
export interface BuildPlannerState {
  /** Index of the current build-order step. */
  stepIndex: number;
  /** Seconds accumulated toward the next decision. */
  thinkTimer: number;
  /** Cursor of a seeded rng, or `null` for one that carries no state. */
  rng: number | null;
}

/** Options for {@link createBuildPlanner}. */
export interface BuildPlannerOptions {
  /** Decision quality; omitted decides every call with no noise. */
  profile?: DifficultyProfile;
  /** Injected randomness for composition noise. Default `seededRng("buildOrder")`. */
  rng?: () => number;
  /** Decision interval = `reactionSeconds` × this. Default 2 (easy 1.8 s, standard 0.7 s, expert 0.16 s). */
  intervalPerReaction?: number;
}

/** A running build planner. */
export interface BuildPlanner {
  /** Advance the think timer by `dt` and, when due, decide the next thing to make. */
  decide(view: BuildPlannerView, dt: number): BuildDecision;
  tuning(): BuildPlannerTuning;
  snapshot(): BuildPlannerState;
  restore(next: BuildPlannerState): void;
  /** Swap the plan or difficulty mid-game; the step index is kept (clamped to the new order). */
  retune(config: BuildPlanConfig, profile?: DifficultyProfile): void;
}

/** Where a tech path leads: something makeable now, a prerequisite already in progress, or nothing. */
export type TechPathStep =
  | { status: "ready"; id: string }
  | { status: "pending"; id: string }
  | { status: "blocked"; id: string };

const countOf = (record: Readonly<Record<string, number>> | undefined, id: string): number => record?.[id] ?? 0;

/**
 * Requirement ids of `id` (its `requires` plus its `producer`) that the view does not own complete.
 * Unknown ids return an empty list.
 *
 * @capability build-requirements list the unmet prerequisites of an RTS building, unit or research
 */
export function missingRequirements(
  catalog: BuildCatalog,
  id: string,
  view: Pick<BuildPlannerView, "owned">,
): string[] {
  const entry = catalog[id];
  if (!entry) return [];
  const missing: string[] = [];
  for (const req of entry.requires ?? []) if (countOf(view.owned, req) < 1) missing.push(req);
  if (entry.producer && countOf(view.owned, entry.producer) < 1 && !missing.includes(entry.producer)) {
    missing.push(entry.producer);
  }
  return missing;
}

/**
 * Walk the tech path toward `id`: `ready` names the first thing makeable now (the id itself when
 * nothing is missing, else the deepest unmet prerequisite), `pending` names a prerequisite already
 * queued that the path waits on, `blocked` means an unknown id or a requirement cycle. A
 * prerequisite in progress is skipped in favour of another missing one, so "make 4 knights" builds
 * the stables and the smithy side by side. Cycle-safe.
 *
 * @capability build-tech-path resolve an RTS want into the first missing prerequisite to make instead
 */
export function resolveTechPath(
  catalog: BuildCatalog,
  id: string,
  view: Pick<BuildPlannerView, "owned" | "pending">,
): TechPathStep {
  const visiting = new Set<string>();
  const walk = (target: string): TechPathStep => {
    if (!catalog[target] || visiting.has(target)) return { status: "blocked", id: target };
    const missing = missingRequirements(catalog, target, view);
    if (missing.length === 0) return { status: "ready", id: target };
    visiting.add(target);
    let waitingOn: string | null = null;
    for (const req of missing) {
      if (countOf(view.pending, req) > 0) {
        waitingOn ??= req;
        continue;
      }
      const step = walk(req);
      if (step.status === "ready") {
        visiting.delete(target);
        return step;
      }
      if (step.status === "pending") waitingOn ??= step.id;
    }
    visiting.delete(target);
    return waitingOn ? { status: "pending", id: waitingOn } : { status: "blocked", id: target };
  };
  return walk(id);
}

function validatePlan(config: BuildPlanConfig): void {
  const { catalog } = config;
  const known = (id: string, where: string): void => {
    if (!catalog[id]) throw new Error(`buildOrder: unknown id "${id}" in ${where}`);
  };
  for (const [id, entry] of Object.entries(catalog)) {
    for (const req of entry.requires ?? []) known(req, `${id}.requires`);
    if (entry.producer) known(entry.producer, `${id}.producer`);
  }
  for (const step of config.steps ?? []) known(step.make, "steps");
  if (config.workers) known(config.workers.id, "workers");
  for (const id of Object.keys(config.composition ?? {})) known(id, "composition");

  const done = new Set<string>();
  const onPath = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id)) return;
    if (onPath.has(id)) throw new Error(`buildOrder: requirement cycle through "${id}"`);
    onPath.add(id);
    const entry = catalog[id]!;
    for (const req of entry.requires ?? []) visit(req);
    if (entry.producer) visit(entry.producer);
    onPath.delete(id);
    done.add(id);
  };
  for (const id of Object.keys(catalog)) visit(id);
}

const totalCost = (cost: ResourceCost): number => {
  let sum = 0;
  for (const value of Object.values(cost)) sum += value;
  return sum;
};

const affordable = (cost: ResourceCost, balances: Readonly<Record<string, number>>): boolean => {
  for (const [currency, amount] of Object.entries(cost)) if (countOf(balances, currency) < amount) return false;
  return true;
};

const NO_NOISE: DifficultyProfile = {
  reactionSeconds: 0,
  decisionNoise: 0,
  executionJitter: 0,
  abilityDiscipline: 1,
  perceptionScale: 1,
  planDepth: 1,
  planWidth: 1,
};

type Attempt = Extract<BuildDecision, { kind: "make" }> | { kind: "wait"; reason: BuildWaitReason; id?: string };

/**
 * An RTS economy planner: follows `config.steps` in order, inserting the tech path for any unmet
 * requirement, then sustains workers and an army `composition`, building supply ahead of a block.
 * The {@link DifficultyProfile} sets how often it decides (`reactionSeconds` × `intervalPerReaction`),
 * how often a composition pick is worse than the best (`decisionNoise`), and whether it saves for
 * unaffordable wants. Returns a decision per call; the game executes it.
 *
 * @capability rts-build-planner AI build order, tech path, supply and army composition for an RTS opponent economy
 */
export function createBuildPlanner(config: BuildPlanConfig, options: BuildPlannerOptions = {}): BuildPlanner {
  validatePlan(config);
  const rng = options.rng ?? seededRng("buildOrder");
  const perReaction = options.intervalPerReaction ?? 2;
  let plan = config;
  let profile = options.profile;
  let providers: string[] = [];
  let tuning: BuildPlannerTuning = { decisionInterval: 0, decisionNoise: 0, saveFor: true };

  const derive = (): void => {
    providers = Object.keys(plan.catalog)
      .filter((id) => (plan.catalog[id]!.supplyProvided ?? 0) > 0)
      .sort((a, b) => totalCost(plan.catalog[a]!.cost) - totalCost(plan.catalog[b]!.cost));
    tuning = {
      decisionInterval: profile ? Math.max(0, profile.reactionSeconds * perReaction) : 0,
      decisionNoise: profile?.decisionNoise ?? 0,
      saveFor: plan.saveFor ?? (profile ? profile.abilityDiscipline >= 0.5 : true),
    };
  };
  derive();

  let state: BuildPlannerState = { stepIndex: 0, thinkTimer: tuning.decisionInterval, rng: rngStateOf(rng) };

  const have = (view: BuildPlannerView, id: string): number => countOf(view.owned, id) + countOf(view.pending, id);

  const atMax = (view: BuildPlannerView, id: string): boolean => {
    const entry = plan.catalog[id]!;
    if (entry.kind === "research" && have(view, id) >= 1) return true;
    return entry.maxCount !== undefined && have(view, id) >= entry.maxCount;
  };

  const supplyState = (view: BuildPlannerView): { headroom: number; capWithPending: number } => {
    let queued = view.supply.queued;
    let pendingProvided = 0;
    const deriveQueued = queued === undefined;
    if (deriveQueued) queued = 0;
    for (const [id, count] of Object.entries(view.pending)) {
      const entry = plan.catalog[id];
      if (!entry || count <= 0) continue;
      if (deriveQueued && entry.kind === "unit") queued! += (entry.supply ?? 0) * count;
      pendingProvided += (entry.supplyProvided ?? 0) * count;
    }
    const capWithPending = view.supply.cap + pendingProvided;
    return { headroom: capWithPending - view.supply.used - queued!, capWithPending };
  };

  const capped = (capWithPending: number): boolean =>
    plan.supplyLimit !== undefined && capWithPending >= plan.supplyLimit;

  const attemptSupply = (view: BuildPlannerView, depth: number): Attempt => {
    const provider = providers.find((id) => !atMax(view, id));
    const { capWithPending } = supplyState(view);
    if (!provider || capped(capWithPending) || depth > 0) {
      return provider ? { kind: "wait", reason: "supply", id: provider } : { kind: "wait", reason: "supply" };
    }
    return attempt(view, provider, "supply", depth + 1);
  };

  const attempt = (view: BuildPlannerView, target: string, reason: BuildMakeReason, depth = 0): Attempt => {
    const path = resolveTechPath(plan.catalog, target, view);
    if (path.status !== "ready") return { kind: "wait", reason: "requirement", id: path.id };
    const id = path.id;
    const entry = plan.catalog[id]!;
    const why: BuildMakeReason = id === target ? reason : "requirement";
    if (id !== target && atMax(view, id)) return { kind: "wait", reason: "requirement", id };
    const need = entry.kind === "unit" ? (entry.supply ?? 0) : 0;
    if (need > 0 && need > supplyState(view).headroom) return attemptSupply(view, depth);
    if (view.idleProducers && entry.producer && countOf(view.idleProducers, entry.producer) <= 0) {
      return { kind: "wait", reason: "producer", id: entry.producer };
    }
    if (!affordable(entry.cost, view.balances)) return { kind: "wait", reason: "afford", id };
    return { kind: "make", id, reason: why };
  };

  const stepDone = (view: BuildPlannerView, step: BuildStep): boolean =>
    atMax(view, step.make) || have(view, step.make) >= (step.count ?? 1);

  const think = (view: BuildPlannerView): BuildDecision => {
    let fallback: Attempt | null = null;
    const settle = (result: Attempt): BuildDecision | null => {
      if (result.kind === "make") return result;
      if (result.reason === "afford" && tuning.saveFor) return result;
      fallback ??= result;
      return null;
    };

    if (plan.supplyBuffer !== undefined && plan.supplyBuffer > 0) {
      const { headroom, capWithPending } = supplyState(view);
      if (headroom < plan.supplyBuffer && !capped(capWithPending)) {
        const decided = settle(attemptSupply(view, 0));
        if (decided) return decided;
      }
    }

    const steps = plan.steps ?? [];
    while (state.stepIndex < steps.length && stepDone(view, steps[state.stepIndex]!)) state.stepIndex++;
    const step = steps[state.stepIndex];
    if (step) {
      const decided = settle(attempt(view, step.make, "order"));
      if (decided) return decided;
    }

    const workers = plan.workers;
    if (workers && have(view, workers.id) < workers.target && !atMax(view, workers.id)) {
      const decided = settle(attempt(view, workers.id, "workers"));
      if (decided) return decided;
    }

    const composition = plan.composition;
    if (composition) {
      let weightSum = 0;
      let armySum = 0;
      for (const [id, weight] of Object.entries(composition)) {
        if (weight <= 0) continue;
        weightSum += weight;
        armySum += have(view, id);
      }
      const options: ScoredOption<Attempt>[] = [];
      for (const [id, weight] of Object.entries(composition)) {
        if (weight <= 0 || atMax(view, id)) continue;
        const result = attempt(view, id, "composition");
        const usable = result.kind === "make" || (result.reason === "afford" && tuning.saveFor);
        if (!usable) {
          fallback ??= result;
          continue;
        }
        options.push({ option: result, score: (weight / weightSum) * (armySum + 1) - have(view, id) });
      }
      const picked = pickScored(options, profile ?? NO_NOISE, rng);
      if (picked) return picked;
    }

    return fallback ?? { kind: "wait", reason: "done" };
  };

  return {
    decide(view, dt) {
      state.thinkTimer += Math.max(0, dt);
      if (state.thinkTimer < tuning.decisionInterval) {
        state.rng = rngStateOf(rng);
        return { kind: "wait", reason: "think" };
      }
      state.thinkTimer = 0;
      const decision = think(view);
      state.rng = rngStateOf(rng);
      return decision;
    },
    tuning() {
      return { ...tuning };
    },
    snapshot() {
      return { ...state, rng: rngStateOf(rng) };
    },
    restore(next) {
      state = { ...next };
      if (next.rng !== null) restoreRng(rng, next.rng);
    },
    retune(nextConfig, nextProfile) {
      validatePlan(nextConfig);
      plan = nextConfig;
      if (nextProfile) profile = nextProfile;
      derive();
      state.stepIndex = Math.min(state.stepIndex, (plan.steps ?? []).length);
    },
  };
}

/** When attack waves launch and how they grow. */
export interface AttackClockConfig {
  /** No wave launches before this game time (seconds). */
  firstAt: number;
  /** Army supply the first wave needs. */
  minArmy: number;
  /** Extra army supply each later wave needs. Default 0. */
  growPerWave?: number;
  /** Launch anyway once this many seconds pass since `firstAt` or the last wave, if any army exists. Default never. */
  maxWait?: number;
  /** Minimum seconds between waves. Default 0. */
  minGap?: number;
}

/** Serializable attack-clock state. */
export interface AttackClockState {
  /** Waves launched so far. */
  launched: number;
  /** Game time of the last launch, or `null` before the first. */
  lastLaunchAt: number | null;
}

/** What the game reports to the attack clock. */
export interface AttackClockInput {
  time: number;
  /** Supply (or any army-size measure) of the units free to attack. */
  armySupply: number;
}

/** Whether to launch now, the wave number (1-based) being gathered, and the army it needs. */
export interface AttackDecision {
  launch: boolean;
  wave: number;
  need: number;
  reason: "early" | "gathering" | "army" | "maxWait";
}

/** A running attack clock. */
export interface AttackClock {
  /** Decide whether to launch; a launch is recorded, so call once per decision. */
  decide(input: AttackClockInput): AttackDecision;
  snapshot(): AttackClockState;
  restore(next: AttackClockState): void;
  retune(config: AttackClockConfig): void;
}

/**
 * Attack-wave timing for an RTS opponent: nothing before `firstAt`, then a wave launches when the
 * army reaches `minArmy + growPerWave × waves launched`, or after `maxWait` seconds with whatever
 * army exists. Waves are spaced by `minGap`.
 *
 * @capability rts-attack-clock decide when an RTS AI launches growing attack waves, with a max-wait fallback
 */
export function createAttackClock(config: AttackClockConfig, initial?: AttackClockState): AttackClock {
  let cfg = config;
  let state: AttackClockState = initial ? { ...initial } : { launched: 0, lastLaunchAt: null };

  return {
    decide({ time, armySupply }) {
      const wave = state.launched + 1;
      const need = cfg.minArmy + (cfg.growPerWave ?? 0) * state.launched;
      const since = state.lastLaunchAt ?? cfg.firstAt;
      const earliest = state.lastLaunchAt === null ? cfg.firstAt : state.lastLaunchAt + (cfg.minGap ?? 0);
      if (time < earliest) return { launch: false, wave, need, reason: "early" };
      let reason: AttackDecision["reason"] = "gathering";
      if (armySupply >= need) reason = "army";
      else if (cfg.maxWait !== undefined && armySupply > 0 && time - since >= cfg.maxWait) reason = "maxWait";
      if (reason === "gathering") return { launch: false, wave, need, reason };
      state = { launched: wave, lastLaunchAt: time };
      return { launch: true, wave, need, reason };
    },
    snapshot() {
      return { ...state };
    },
    restore(next) {
      state = { ...next };
    },
    retune(next) {
      cfg = next;
    },
  };
}
