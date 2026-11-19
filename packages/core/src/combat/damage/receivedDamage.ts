import { applyStatOp, boundStatValue, type StatContribution } from "../../progression/statGraph";
import type { DamageChannelId } from "./damageMatchup";

/**
 * The facts a received-damage modifier predicates over: the incoming `channel`, who dealt it,
 * the statuses the target currently carries, and any caller tags. All caller-owned strings; the
 * engine never assigns meaning to a channel, source, status, or tag.
 */
export interface DamageContext {
  channel: DamageChannelId;
  source?: string;
  target: string;
  targetStatuses?: readonly string[];
  tags?: readonly string[];
}

/**
 * A typed predicate over a {@link DamageContext}. Every listed facet must match (AND); a facet
 * matches when the context value is in the list (channels/sources) or shares any member
 * (targetStatuses/tags). An empty predicate matches every hit.
 */
export interface DamagePredicate {
  channels?: readonly DamageChannelId[];
  sources?: readonly string[];
  whileStatus?: readonly string[];
  /** Fire only when the hit carries one of these tags. */
  tags?: readonly string[];
}

export type ReceivedPolicy =
  | { kind: "scale"; factor: number }
  | { kind: "flat"; delta: number }
  | { kind: "cap"; max: number }
  | { kind: "floor"; min: number }
  | { kind: "convert"; toChannel: DamageChannelId; portion?: number }
  | { kind: "redirect"; toTarget: string; portion?: number }
  | { kind: "immune" };

export interface ReceivedModifier {
  id?: string;
  when?: DamagePredicate;
  policy: ReceivedPolicy;
  /** Lower runs first; ties keep declaration order. Defaults to 0. */
  order?: number;
}

export interface ReceivedStep {
  modifierId: string | null;
  kind: ReceivedPolicy["kind"];
  before: number;
  after: number;
  diverted?: number;
}

export interface DamageDivert {
  target?: string;
  channel?: DamageChannelId;
  amount: number;
}

export interface ReceivedDamageResult {
  /** Final amount landing on the primary target/channel; never negative. */
  amount: number;
  immune: boolean;
  redirects: DamageDivert[];
  conversions: DamageDivert[];
  steps: ReceivedStep[];
}

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

function statContribution(policy: ReceivedPolicy, source: string): StatContribution | null {
  switch (policy.kind) {
    case "scale":
      return { source, op: "mul", value: policy.factor };
    case "flat":
      return { source, op: "add", value: policy.delta };
    case "cap":
      return { source, op: "clampMax", value: policy.max };
    case "floor":
      return { source, op: "clampMin", value: policy.min };
    default:
      return null;
  }
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
    const stat = statContribution(policy, id ?? policy.kind);
    if (stat !== null) {
      const folded = applyStatOp(amount, stat.op, stat.value);
      amount = stat.op === "mul" || stat.op === "add" ? boundStatValue(folded, { min: 0 }) : folded;
      steps.push({ modifierId: id, kind: policy.kind, before, after: amount });
      continue;
    }
    switch (policy.kind) {
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
