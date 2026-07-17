import type { DamageChannelId } from "./damageMatchup";

/**
 * The facts a received-damage modifier predicates over: the incoming `channel`, who dealt it,
 * the statuses the target currently carries, and any caller tags. All caller-owned strings; the
 * engine never assigns meaning to a channel, source, status, or tag.
 */
export interface DamageContext {
  channel: DamageChannelId;
  /** Attacker/source id, when known. */
  source?: string;
  /** The receiving target's id. */
  target: string;
  /** Status ids currently on the target — lets a modifier fire only `whileStatus`. */
  targetStatuses?: readonly string[];
  /** Arbitrary caller tags on the hit (`"crit"`, `"melee"`, `"aoe"`). */
  tags?: readonly string[];
}

/**
 * A typed predicate over a {@link DamageContext}. Every listed facet must match (AND); a facet
 * matches when the context value is in the list (channels/sources) or shares any member
 * (targetStatuses/tags). An empty predicate matches every hit.
 */
export interface DamagePredicate {
  /** Fire only for these channels. */
  channels?: readonly DamageChannelId[];
  /** Fire only for these attacker sources. */
  sources?: readonly string[];
  /** Fire only while the target carries one of these statuses. */
  whileStatus?: readonly string[];
  /** Fire only when the hit carries one of these tags. */
  tags?: readonly string[];
}

/**
 * What a matched modifier does to the incoming amount. Amplification is one policy beside
 * reduction — both are `scale` (factor `> 1` amplifies, `< 1` reduces). `cap`/`floor` clamp,
 * `flat` adds/subtracts, `convert` moves a portion to another channel on the same target,
 * `redirect` moves a portion to another target, and `immune` zeroes the hit outright.
 */
export type ReceivedPolicy =
  | { kind: "scale"; factor: number }
  | { kind: "flat"; delta: number }
  | { kind: "cap"; max: number }
  | { kind: "floor"; min: number }
  | { kind: "convert"; toChannel: DamageChannelId; portion?: number }
  | { kind: "redirect"; toTarget: string; portion?: number }
  | { kind: "immune" };

/** One serializable receiver-side rule: an optional predicate, a policy, and an ordering key. */
export interface ReceivedModifier {
  /** Stable id echoed in provenance; helps UI/debug attribute a change. */
  id?: string;
  /** When the modifier fires; omitted means always. */
  when?: DamagePredicate;
  policy: ReceivedPolicy;
  /** Lower runs first; ties keep declaration order. Defaults to 0. */
  order?: number;
}

/** One recorded transformation — the provenance a UI or debugger reads to explain a final number. */
export interface ReceivedStep {
  modifierId: string | null;
  kind: ReceivedPolicy["kind"];
  before: number;
  after: number;
  /** Portion diverted to a redirect target or converted channel, when the policy did so. */
  diverted?: number;
}

/** A portion of the hit sent elsewhere by a `redirect`/`convert` policy. */
export interface DamageDivert {
  /** For a redirect: the receiving target. For a convert: unset. */
  target?: string;
  /** For a convert: the channel the portion becomes. For a redirect: unset. */
  channel?: DamageChannelId;
  amount: number;
}

/** The full, provenance-rich outcome of running received modifiers over one hit. */
export interface ReceivedDamageResult {
  /** Final amount landing on the primary target/channel; never negative. */
  amount: number;
  /** True when an `immune` policy zeroed the hit. */
  immune: boolean;
  /** Portions redirected to other targets. */
  redirects: DamageDivert[];
  /** Portions converted to other channels on the same target. */
  conversions: DamageDivert[];
  /** Ordered record of every modifier that ran and what it changed. */
  steps: ReceivedStep[];
}

/** The incoming amount, its {@link DamageContext}, and the receiver's modifier list to run over it. */
export interface ReceivedDamageInput {
  amount: number;
  context: DamageContext;
  modifiers: readonly ReceivedModifier[];
}

function sharesAny(a: readonly string[] | undefined, b: readonly string[]): boolean {
  if (a === undefined) return false;
  for (const value of a) if (b.includes(value)) return true;
  return false;
}

function matches(predicate: DamagePredicate | undefined, ctx: DamageContext): boolean {
  if (predicate === undefined) return true;
  if (predicate.channels !== undefined && !predicate.channels.includes(ctx.channel)) return false;
  if (predicate.sources !== undefined && (ctx.source === undefined || !predicate.sources.includes(ctx.source))) {
    return false;
  }
  if (predicate.whileStatus !== undefined && !sharesAny(ctx.targetStatuses, predicate.whileStatus)) return false;
  if (predicate.tags !== undefined && !sharesAny(ctx.tags, predicate.tags)) return false;
  return true;
}

/**
 * Run receiver-side modifiers over an incoming hit, in ascending `order`, recording every step.
 * Amplification, reduction, caps, conversion, redirection, and immunity are all data — the engine
 * applies whichever policies the target's modifiers declare and never branches on channel names.
 * Pure over serializable data with bounded work (one pass over the modifier list); an `immune`
 * policy short-circuits the remaining modifiers.
 *
 * @capability received-damage apply data-defined receiver-side damage modifiers (amplify, reduce, cap, convert, redirect, immunity) with typed predicates
 */
export function resolveReceivedDamage(input: ReceivedDamageInput): ReceivedDamageResult {
  const ctx = input.context;
  const ordered = input.modifiers
    .map((modifier, index) => ({ modifier, index }))
    .filter((entry) => matches(entry.modifier.when, ctx))
    .sort((a, b) => (a.modifier.order ?? 0) - (b.modifier.order ?? 0) || a.index - b.index);

  let amount = Math.max(0, input.amount);
  let immune = false;
  const redirects: DamageDivert[] = [];
  const conversions: DamageDivert[] = [];
  const steps: ReceivedStep[] = [];

  for (const { modifier } of ordered) {
    const policy = modifier.policy;
    const before = amount;
    const id = modifier.id ?? null;
    switch (policy.kind) {
      case "scale":
        amount = Math.max(0, amount * policy.factor);
        steps.push({ modifierId: id, kind: "scale", before, after: amount });
        break;
      case "flat":
        amount = Math.max(0, amount + policy.delta);
        steps.push({ modifierId: id, kind: "flat", before, after: amount });
        break;
      case "cap":
        amount = Math.min(amount, policy.max);
        steps.push({ modifierId: id, kind: "cap", before, after: amount });
        break;
      case "floor":
        amount = Math.max(amount, policy.min);
        steps.push({ modifierId: id, kind: "floor", before, after: amount });
        break;
      case "convert": {
        const portion = policy.portion ?? 1;
        const moved = amount * Math.max(0, Math.min(1, portion));
        amount -= moved;
        if (moved > 0) conversions.push({ channel: policy.toChannel, amount: moved });
        steps.push({ modifierId: id, kind: "convert", before, after: amount, diverted: moved });
        break;
      }
      case "redirect": {
        const portion = policy.portion ?? 1;
        const moved = amount * Math.max(0, Math.min(1, portion));
        amount -= moved;
        if (moved > 0) redirects.push({ target: policy.toTarget, amount: moved });
        steps.push({ modifierId: id, kind: "redirect", before, after: amount, diverted: moved });
        break;
      }
      case "immune":
        amount = 0;
        immune = true;
        steps.push({ modifierId: id, kind: "immune", before, after: 0 });
        break;
    }
    if (immune) break;
  }

  return { amount, immune, redirects, conversions, steps };
}
