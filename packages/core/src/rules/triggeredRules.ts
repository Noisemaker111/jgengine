/**
 * The reusable bridge from typed runtime events to effects. A triggered rule is pure data — which
 * event it listens to, a declarative predicate over the event facts, how the affected target is
 * resolved, an effect *reference* (never a callback), and how the resulting effect is gated, lived,
 * and stacked. Affixes, talents, perks, quests, achievements, environment rules, and reactive AI all
 * subscribe through this one seam instead of owning parallel trigger runtimes.
 *
 * Core stays decoupled from any specific effect system: `dispatch` returns provenance-rich firings
 * and the game applies them to whatever effect/stat system it owns. Gate state (cooldowns, rate
 * windows, remaining charges) and active timed effects serialize cleanly so future triggers survive
 * save/load.
 */

import { evaluatePredicate, readPath, type Predicate, type PredicateFacts, type PredicateValue } from "./predicate";

/** Role slots an event exposes; a target selector resolves one of these to a concrete id. */
export type TargetRole = "subject" | "object" | "source" | "owner";

/**
 * How a rule picks the id its effect lands on: a fixed event role, a dot path into the event facts,
 * or a literal id. Data-only so it saves with the rule.
 */
export type TargetSelector =
  | { readonly role: TargetRole }
  | { readonly path: string }
  | { readonly literal: string };

/** A reference to an effect the game knows how to apply — id plus JSON-safe params, no closures. */
export interface EffectRef {
  readonly id: string;
  readonly params?: Readonly<Record<string, PredicateValue>>;
}

/**
 * How a repeated application of the same rule's effect on the same target combines with a live one:
 * `refresh` re-arms the timer at one stack, `stack` adds a stack up to `maxStacks` and re-arms,
 * `independent` keeps each application as its own instance with its own expiry, `ignore` drops the
 * new application while one is already active.
 */
export type StackPolicy = "refresh" | "stack" | "independent" | "ignore";

/** Bounded firing budget over a sliding time window. */
export interface RateLimit {
  readonly count: number;
  readonly windowMs: number;
}

/**
 * A declarative subscription from an event to an effect. Everything here is serializable content —
 * the runtime reads it, it never embeds behavior. `effect` names an effect the game resolves; core
 * only routes and gates.
 */
export interface TriggeredRule {
  /** Stable id, unique within an engine. */
  readonly id: string;
  /** Event type this rule subscribes to. */
  readonly event: string;
  /** Owner/source identity (item instance, talent node, quest id) for provenance and bulk cleanup. */
  readonly owner?: string;
  /** Declarative gate over the event facts; omitted fires unconditionally. */
  readonly when?: Predicate;
  /** How the affected target id is resolved; defaults to the `subject` role. */
  readonly target?: TargetSelector;
  /** The effect to apply when the rule fires. */
  readonly effect: EffectRef;
  /** Minimum ms between fires of this rule against the same resolved target. */
  readonly cooldownMs?: number;
  /** Sliding-window firing cap across all targets. */
  readonly rateLimit?: RateLimit;
  /** Total fires before the rule is spent; omitted is unlimited. */
  readonly charges?: number;
  /** Lifetime of the applied effect in ms; omitted is instantaneous (no active instance kept). */
  readonly durationMs?: number;
  /** Stacking policy for repeat applications while an instance is live; defaults to `refresh`. */
  readonly stacking?: StackPolicy;
  /** Cap for the `stack` policy; defaults to 1 (i.e. behaves like `refresh` until raised). */
  readonly maxStacks?: number;
}

/** A typed event handed to the engine; roles feed target resolution, facts feed the predicate. */
export interface RuleEvent {
  readonly type: string;
  readonly subject?: string;
  readonly object?: string;
  readonly source?: string;
  /** Fact bag the predicate and `{ path }` target selectors read. */
  readonly facts?: PredicateFacts;
}

/** A live timed effect an engine is tracking until it expires or is cleaned up. */
export interface ActiveEffect {
  readonly instanceId: string;
  readonly ruleId: string;
  readonly effectId: string;
  readonly owner: string | undefined;
  readonly target: string;
  readonly params: Readonly<Record<string, PredicateValue>> | undefined;
  readonly appliedAt: number;
  readonly expiresAt: number;
  readonly stacks: number;
}

/** Reason a firing did not produce an effect — surfaced for debug inspection, never thrown. */
export type FiringBlock = "predicate" | "no-target" | "cooldown" | "rate-limit" | "no-charges" | "stack-ignored";

/**
 * The outcome of matching one rule against one event. `applied` is the effect the caller should now
 * run through its own effect system; a blocked firing reports why. Provenance (rule, owner, event,
 * timestamp) rides along for auditability.
 */
export interface RuleFiring {
  readonly ruleId: string;
  readonly event: string;
  readonly owner: string | undefined;
  readonly target: string;
  readonly effect: EffectRef;
  readonly at: number;
  /** Set when the firing produced/updated a timed instance. */
  readonly instanceId?: string;
  /** Stack count on the target after this firing (>= 1 for timed effects). */
  readonly stacks?: number;
  /** Absent when the effect was applied; set when the firing was gated out. */
  readonly blocked?: FiringBlock;
}

/** Serializable runtime state — everything that changes future triggers. Rules travel with it. */
export interface TriggeredRuleState {
  seq: number;
  rules: TriggeredRule[];
  charges: Record<string, number>;
  cooldowns: Record<string, number>;
  windows: Record<string, number[]>;
  active: ActiveEffect[];
}

/** A running set of triggered rules with gating, timed lifetimes, stacking, cleanup, and save/load. */
export interface TriggeredRuleEngine {
  /** Register or replace a rule by id. */
  add(rule: TriggeredRule): void;
  /** Drop a rule and any active effects it produced. */
  remove(ruleId: string): void;
  /** Drop every rule and active effect belonging to an owner (unequip, respec, entity removal). */
  removeByOwner(owner: string): void;
  /** Snapshot of registered rules in insertion order. */
  rules(): readonly TriggeredRule[];
  /** Match an event against all rules, gate, spawn/refresh timed effects, and return firings. */
  dispatch(event: RuleEvent, now: number): readonly RuleFiring[];
  /** Advance time and return the active effects that expired (and were removed) this tick. */
  tick(now: number): readonly ActiveEffect[];
  /** All live timed effects. */
  active(): readonly ActiveEffect[];
  /** Live timed effects landed on a given target. */
  activeFor(target: string): readonly ActiveEffect[];
  /** Drop all active timed effects but keep rules and gate state. */
  clearActive(): void;
  /** Reset gate state and active effects (respec/encounter reset) while keeping rules. */
  reset(): void;
  /** Serialize all future-affecting state. */
  snapshot(): TriggeredRuleState;
  /** Replace all state from a snapshot. */
  hydrate(state: TriggeredRuleState): void;
}

function roleId(event: RuleEvent, role: TargetRole, owner: string | undefined): string | undefined {
  switch (role) {
    case "subject":
      return event.subject;
    case "object":
      return event.object;
    case "source":
      return event.source;
    case "owner":
      return owner;
  }
}

function resolveTarget(rule: TriggeredRule, event: RuleEvent): string | undefined {
  const selector = rule.target ?? { role: "subject" };
  if ("literal" in selector) return selector.literal;
  if ("path" in selector) {
    const value = readPath(event.facts ?? {}, selector.path);
    return typeof value === "string" ? value : undefined;
  }
  return roleId(event, selector.role, rule.owner);
}

function cooldownKey(ruleId: string, target: string): string {
  return `${ruleId}\u0000${target}`;
}

/**
 * Create an empty triggered-rule engine. Rules are added as data; dispatching an event returns the
 * firings the caller applies to its own effect system. Time is caller-supplied (`now` in ms), so the
 * engine is deterministic and drives equally from a fixed-step loop or a save-restored timeline.
 *
 * @capability triggered-rules event-conditioned effects with declarative predicates, lifetimes, and stacking
 */
export function createTriggeredRuleEngine(rules: readonly TriggeredRule[] = []): TriggeredRuleEngine {
  const ruleList: TriggeredRule[] = [];
  const ruleIndex = new Map<string, number>();
  const remainingCharges = new Map<string, number>();
  const lastFire = new Map<string, number>();
  const fireWindows = new Map<string, number[]>();
  let active: ActiveEffect[] = [];
  let seq = 0;

  function indexRules(): void {
    ruleIndex.clear();
    for (let i = 0; i < ruleList.length; i++) ruleIndex.set(ruleList[i]!.id, i);
  }

  function add(rule: TriggeredRule): void {
    const existing = ruleIndex.get(rule.id);
    if (existing !== undefined) ruleList[existing] = rule;
    else ruleList.push(rule);
    indexRules();
    if (rule.charges !== undefined) remainingCharges.set(rule.id, rule.charges);
    else remainingCharges.delete(rule.id);
  }

  for (const rule of rules) add(rule);

  function dropRuleState(ruleId: string): void {
    remainingCharges.delete(ruleId);
    fireWindows.delete(ruleId);
    for (const key of [...lastFire.keys()]) {
      if (key.startsWith(`${ruleId}\u0000`)) lastFire.delete(key);
    }
    active = active.filter((instance) => instance.ruleId !== ruleId);
  }

  function passesRate(rule: TriggeredRule, now: number): boolean {
    if (rule.rateLimit === undefined) return true;
    const window = fireWindows.get(rule.id) ?? [];
    const cutoff = now - rule.rateLimit.windowMs;
    const kept = window.filter((stamp) => stamp > cutoff);
    fireWindows.set(rule.id, kept);
    return kept.length < rule.rateLimit.count;
  }

  function recordFire(rule: TriggeredRule, target: string, now: number): void {
    lastFire.set(cooldownKey(rule.id, target), now);
    if (rule.rateLimit !== undefined) {
      const window = fireWindows.get(rule.id) ?? [];
      window.push(now);
      fireWindows.set(rule.id, window);
    }
    if (rule.charges !== undefined) {
      remainingCharges.set(rule.id, (remainingCharges.get(rule.id) ?? 0) - 1);
    }
  }

  function applyTimed(
    rule: TriggeredRule,
    target: string,
    now: number,
  ): { instanceId: string; stacks: number } | { blocked: "stack-ignored" } {
    const duration = rule.durationMs!;
    const policy = rule.stacking ?? "refresh";
    const expiresAt = now + duration;
    if (policy !== "independent") {
      const current = active.find(
        (instance) => instance.ruleId === rule.id && instance.target === target,
      );
      if (current !== undefined) {
        if (policy === "ignore") return { blocked: "stack-ignored" };
        const stacks =
          policy === "stack" ? Math.min(current.stacks + 1, Math.max(1, rule.maxStacks ?? 1)) : 1;
        const updated: ActiveEffect = { ...current, expiresAt, stacks, appliedAt: now };
        active = active.map((instance) => (instance === current ? updated : instance));
        return { instanceId: updated.instanceId, stacks };
      }
    }
    const instanceId = `${rule.id}#${seq++}`;
    active.push({
      instanceId,
      ruleId: rule.id,
      effectId: rule.effect.id,
      owner: rule.owner,
      target,
      params: rule.effect.params,
      appliedAt: now,
      expiresAt,
      stacks: 1,
    });
    return { instanceId, stacks: 1 };
  }

  function evaluate(rule: TriggeredRule, event: RuleEvent, now: number): RuleFiring {
    const base = { ruleId: rule.id, event: event.type, owner: rule.owner, effect: rule.effect, at: now };
    if (!evaluatePredicate(rule.when, event.facts ?? {})) return { ...base, target: "", blocked: "predicate" };
    const target = resolveTarget(rule, event);
    if (target === undefined || target === "") return { ...base, target: "", blocked: "no-target" };
    if (rule.charges !== undefined && (remainingCharges.get(rule.id) ?? 0) <= 0)
      return { ...base, target, blocked: "no-charges" };
    if (rule.cooldownMs !== undefined) {
      const last = lastFire.get(cooldownKey(rule.id, target));
      if (last !== undefined && now - last < rule.cooldownMs) return { ...base, target, blocked: "cooldown" };
    }
    if (!passesRate(rule, now)) return { ...base, target, blocked: "rate-limit" };

    if (rule.durationMs !== undefined) {
      const outcome = applyTimed(rule, target, now);
      if ("blocked" in outcome) return { ...base, target, blocked: outcome.blocked };
      recordFire(rule, target, now);
      return { ...base, target, instanceId: outcome.instanceId, stacks: outcome.stacks };
    }
    recordFire(rule, target, now);
    return { ...base, target };
  }

  return {
    add,
    remove(ruleId) {
      const index = ruleIndex.get(ruleId);
      if (index === undefined) return;
      ruleList.splice(index, 1);
      indexRules();
      dropRuleState(ruleId);
    },
    removeByOwner(owner) {
      const removed = ruleList.filter((rule) => rule.owner === owner).map((rule) => rule.id);
      if (removed.length === 0) {
        active = active.filter((instance) => instance.owner !== owner);
        return;
      }
      for (let i = ruleList.length - 1; i >= 0; i--) {
        if (ruleList[i]!.owner === owner) ruleList.splice(i, 1);
      }
      indexRules();
      for (const ruleId of removed) dropRuleState(ruleId);
      active = active.filter((instance) => instance.owner !== owner);
    },
    rules: () => ruleList.slice(),
    dispatch(event, now) {
      const firings: RuleFiring[] = [];
      for (const rule of ruleList) {
        if (rule.event !== event.type) continue;
        firings.push(evaluate(rule, event, now));
      }
      return firings;
    },
    tick(now) {
      const expired = active.filter((instance) => instance.expiresAt <= now);
      if (expired.length > 0) active = active.filter((instance) => instance.expiresAt > now);
      return expired;
    },
    active: () => active.slice(),
    activeFor: (target) => active.filter((instance) => instance.target === target),
    clearActive() {
      active = [];
    },
    reset() {
      remainingCharges.clear();
      lastFire.clear();
      fireWindows.clear();
      active = [];
      for (const rule of ruleList) {
        if (rule.charges !== undefined) remainingCharges.set(rule.id, rule.charges);
      }
    },
    snapshot() {
      return {
        seq,
        rules: ruleList.map((rule) => ({ ...rule })),
        charges: Object.fromEntries(remainingCharges),
        cooldowns: Object.fromEntries(lastFire),
        windows: Object.fromEntries([...fireWindows].map(([id, stamps]) => [id, stamps.slice()])),
        active: active.map((instance) => ({ ...instance })),
      };
    },
    hydrate(state) {
      ruleList.length = 0;
      for (const rule of state.rules) ruleList.push({ ...rule });
      indexRules();
      remainingCharges.clear();
      for (const [id, value] of Object.entries(state.charges)) remainingCharges.set(id, value);
      lastFire.clear();
      for (const [key, value] of Object.entries(state.cooldowns)) lastFire.set(key, value);
      fireWindows.clear();
      for (const [id, stamps] of Object.entries(state.windows)) fireWindows.set(id, stamps.slice());
      active = state.active.map((instance) => ({ ...instance }));
      seq = state.seq;
    },
  };
}
