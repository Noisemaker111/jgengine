import { evalCurve, type Curve } from "../game/progression";

/**
 * How cycles that came due between two {@link advanceLedger} calls are settled:
 * - `"each"` — replay every missed cycle as its own transaction (bounded by the limits below);
 * - `"sum"` — collapse the missed cycles into one transaction of the combined amount;
 * - `"skip"` — apply only the most recent cycle and discard the rest (idle income that does not bank).
 */
export type CatchUpPolicy = "each" | "sum" | "skip";

/**
 * A serializable recurring resource flow. Every field is plain JSON so the whole
 * {@link ResourceLedger} round-trips through `structuredClone`/`JSON`. Dynamic, context-aware
 * behaviour (providers, tax curves, affordability caps) lives in the runtime
 * {@link ResourcePolicy} pipeline, never in this data.
 */
export interface ScheduledRule {
  /** Stable id, unique within a ledger. */
  id: string;
  /** Resource/currency key that moves. */
  currency: string;
  /** Positive nominal amount moved per cycle before policies run. */
  amount: number;
  /** Cadence in game-seconds; must be `> 0`. */
  everySeconds: number;
  /** First due time in game-seconds; defaults to the ledger clock when the rule is added. */
  startSeconds?: number;
  /** Inclusive end time; omitted means the rule never expires. */
  endSeconds?: number;
  /** Account debited each cycle; omitted mints the amount from an external source (production). */
  source?: string;
  /** Account credited each cycle; omitted burns the amount into an external sink (upkeep/tax). */
  recipient?: string;
  /** Finite reserve consumed by the nominal amount each cycle; the rule depletes when it empties. */
  reserve?: number;
  /** Catch-up settlement policy; defaults to `"each"`. */
  catchUp?: CatchUpPolicy;
  /** Per-rule offline limit: due cycles beyond this in one advance are dropped, not banked. */
  maxCatchUpCycles?: number;
}

/** Mutable per-rule progress, kept separate from the immutable {@link ScheduledRule} definition. */
export interface RuleCursor {
  /** Absolute time of the next cycle that has not yet been settled. */
  nextDueSeconds: number;
  /** Remaining finite reserve, when the rule declared one. */
  reserveRemaining?: number;
  /** Total cycles fired so far — a stable, monotonic cycle index. */
  fired: number;
  /** Paused rules keep their cursor but fire nothing until resumed. */
  paused: boolean;
  /** Set once the rule expired or fully depleted; it never fires again. */
  done: boolean;
}

/** Fully serializable scheduled-transaction state: clock, balances, rule definitions, and cursors. */
export interface ResourceLedger {
  nowSeconds: number;
  accounts: Record<string, Record<string, number>>;
  rules: Record<string, ScheduledRule>;
  cursors: Record<string, RuleCursor>;
}

/** One resource movement produced by a due cycle, before it is applied to balances. */
export interface ResourceTransaction {
  ruleId: string;
  currency: string;
  amount: number;
  source?: string;
  recipient?: string;
  /** Which cycle of the rule produced this (from {@link RuleCursor.fired}). */
  cycleIndex: number;
  atSeconds: number;
  /** Ordered provenance tags appended by the policy pipeline. */
  provenance: readonly string[];
}

/** Read-only context handed to every {@link ResourcePolicy} for a transaction. */
export interface PolicyContext {
  /** The rule that scheduled this flow. */
  rule: ScheduledRule;
  /** Current balance snapshot (reflects transactions already applied this advance). */
  balanceOf(account: string, currency: string): number;
  /** Caller-supplied numeric context bag read by threshold/curve modifiers. */
  vars: Readonly<Record<string, number>>;
  nowSeconds: number;
}

/**
 * A composable transform over one transaction. Return the transactions to keep:
 * `[]` rejects it, `[txn]` passes/transforms it, and multiple entries split it.
 */
export type ResourcePolicy = (
  txn: ResourceTransaction,
  ctx: PolicyContext,
) => readonly ResourceTransaction[];

/** Deterministic rounding applied to every transaction amount before it touches balances. */
export interface Precision {
  /** Quantisation step, e.g. `1` for whole units or `0.01` for cents. */
  quantum: number;
  /** Rounding mode; defaults to `"round"`. */
  mode?: "floor" | "round" | "ceil";
}

/** A `{ min, factor }` band for {@link thresholdScale}; the highest band whose `min` is met wins. */
export interface ThresholdBand {
  min: number;
  factor: number;
}

/** Per-advance settings: the policy pipeline, caller context, rounding, and safety bounds. */
export interface AdvanceOptions {
  /** Policy pipeline applied to every transaction, in order. */
  policies?: readonly ResourcePolicy[];
  /** Numeric context exposed to policies via {@link PolicyContext.vars}. */
  vars?: Readonly<Record<string, number>>;
  /** Rounding applied to each transaction amount before it hits balances. */
  precision?: Precision;
  /** Global safety bound on individual cycles settled per rule per advance; defaults to `10000`. */
  maxCyclesPerRule?: number;
}

/** The kinds of lifecycle signal {@link advanceLedger} can emit for a rule. */
export type LedgerEventKind = "started" | "fired" | "skipped" | "depleted" | "ended";

/** Lifecycle signal emitted by {@link advanceLedger}. */
export interface LedgerEvent {
  kind: LedgerEventKind;
  ruleId: string;
  atSeconds: number;
  /** Cycle count for `fired`/`skipped`, or the consumed reserve for `depleted`. */
  detail: number;
}

/** A {@link ResourceTransaction} after policies and rounding, as actually applied to balances. */
export type AppliedTransaction = ResourceTransaction;

/** The outcome of {@link advanceLedger}: the new ledger plus applied transactions and events. */
export interface AdvanceResult {
  ledger: ResourceLedger;
  applied: AppliedTransaction[];
  events: LedgerEvent[];
}

const EPSILON = 1e-9;

/**
 * Create an empty scheduled-transaction ledger, or hydrate one from a saved snapshot.
 * State is plain data: production, depletion, tax, and upkeep are all expressed as
 * {@link ScheduledRule}s settled deterministically by {@link advanceLedger}.
 *
 * @capability resource-ledger schedule recurring resource transactions with policy transforms
 */
export function createResourceLedger(init?: Partial<ResourceLedger>): ResourceLedger {
  return {
    nowSeconds: init?.nowSeconds ?? 0,
    accounts: cloneAccounts(init?.accounts ?? {}),
    rules: { ...(init?.rules ?? {}) },
    cursors: { ...(init?.cursors ?? {}) },
  };
}

/** Read a single balance; unknown account/currency pairs read as `0`. */
export function balanceOf(ledger: ResourceLedger, account: string, currency: string): number {
  return ledger.accounts[account]?.[currency] ?? 0;
}

/**
 * Register a recurring rule and seed its cursor. Returns a new ledger; the rule's first cycle
 * is due at `rule.startSeconds` (defaulting to the current clock).
 */
export function addScheduledRule(ledger: ResourceLedger, rule: ScheduledRule): ResourceLedger {
  if (!(rule.everySeconds > 0)) {
    throw new RangeError(`rule ${rule.id} everySeconds must be positive, got ${rule.everySeconds}`);
  }
  if (!Number.isFinite(rule.amount) || rule.amount < 0) {
    throw new RangeError(`rule ${rule.id} amount must be a non-negative finite number, got ${rule.amount}`);
  }
  const cursor: RuleCursor = {
    nextDueSeconds: rule.startSeconds ?? ledger.nowSeconds,
    reserveRemaining: rule.reserve,
    fired: 0,
    paused: false,
    done: false,
  };
  return {
    ...ledger,
    rules: { ...ledger.rules, [rule.id]: { ...rule } },
    cursors: { ...ledger.cursors, [rule.id]: cursor },
  };
}

/** Remove a rule and its cursor entirely (hard cancellation). */
export function cancelRule(ledger: ResourceLedger, ruleId: string): ResourceLedger {
  if (ledger.rules[ruleId] === undefined) return ledger;
  const rules = { ...ledger.rules };
  const cursors = { ...ledger.cursors };
  delete rules[ruleId];
  delete cursors[ruleId];
  return { ...ledger, rules, cursors };
}

/** Pause a rule: its cursor is retained but it fires nothing until {@link resumeRule}. */
export function pauseRule(ledger: ResourceLedger, ruleId: string): ResourceLedger {
  return setPaused(ledger, ruleId, true);
}

/**
 * Resume a paused rule. Its `nextDueSeconds` is unchanged, so the paused span counts as missed
 * cycles that the rule's {@link CatchUpPolicy} decides how to settle on the next advance.
 */
export function resumeRule(ledger: ResourceLedger, ruleId: string): ResourceLedger {
  return setPaused(ledger, ruleId, false);
}

function setPaused(ledger: ResourceLedger, ruleId: string, paused: boolean): ResourceLedger {
  const cursor = ledger.cursors[ruleId];
  if (cursor === undefined || cursor.paused === paused) return ledger;
  return { ...ledger, cursors: { ...ledger.cursors, [ruleId]: { ...cursor, paused } } };
}

/**
 * Advance the ledger clock to `toSeconds`, settling every due cycle deterministically.
 * Rules are processed in sorted-id order; cycle counts are integer math; large deltas are
 * bounded by `catchUp`, `maxCatchUpCycles`, and `maxCyclesPerRule`. Every produced transaction
 * flows through the policy pipeline (transform, cap, reject, split, redirect, annotate) before it
 * is quantised and applied to balances.
 *
 * @capability advance-ledger settle due scheduled transactions through a policy pipeline
 */
export function advanceLedger(
  ledger: ResourceLedger,
  toSeconds: number,
  options: AdvanceOptions = {},
): AdvanceResult {
  if (toSeconds < ledger.nowSeconds) {
    throw new RangeError(`advanceLedger cannot rewind: ${toSeconds} < ${ledger.nowSeconds}`);
  }
  const accounts = cloneAccounts(ledger.accounts);
  const cursors: Record<string, RuleCursor> = { ...ledger.cursors };
  const applied: AppliedTransaction[] = [];
  const events: LedgerEvent[] = [];
  const policies = options.policies ?? [];
  const vars = options.vars ?? {};
  const maxCycles = options.maxCyclesPerRule ?? 10_000;

  const ctxBalance = (account: string, currency: string): number => accounts[account]?.[currency] ?? 0;

  for (const id of Object.keys(ledger.rules).sort()) {
    const rule = ledger.rules[id]!;
    const cursor = { ...cursors[id]! };
    if (cursor.done || cursor.paused) continue;

    const end = rule.endSeconds ?? Number.POSITIVE_INFINITY;
    const windowEnd = Math.min(toSeconds, end);

    if (cursor.nextDueSeconds <= windowEnd) {
      const wasFirstFire = cursor.fired === 0;
      const dueCount = Math.floor((windowEnd - cursor.nextDueSeconds) / rule.everySeconds + EPSILON) + 1;
      const firstDue = cursor.nextDueSeconds;

      const perRuleLimit = rule.maxCatchUpCycles ?? Number.POSITIVE_INFINITY;
      const catchUp = rule.catchUp ?? "each";

      // Reserve-capped nominal amount per candidate cycle, in chronological order.
      const nominal = reserveCappedAmounts(dueCount, rule.amount, cursor.reserveRemaining);
      const depleted = cursor.reserveRemaining !== undefined && nominal.remaining <= EPSILON;

      const cycles = buildCycles(catchUp, nominal.amounts, firstDue, rule.everySeconds, perRuleLimit, maxCycles);

      if (wasFirstFire && cycles.settled.length > 0) {
        events.push({ kind: "started", ruleId: id, atSeconds: cycles.settled[0]!.atSeconds, detail: 0 });
      }

      for (const cycle of cycles.settled) {
        const seed: ResourceTransaction = {
          ruleId: id,
          currency: rule.currency,
          amount: cycle.amount,
          source: rule.source,
          recipient: rule.recipient,
          cycleIndex: cursor.fired,
          atSeconds: cycle.atSeconds,
          provenance: [],
        };
        cursor.fired += 1;
        const context: PolicyContext = { rule, balanceOf: ctxBalance, vars, nowSeconds: cycle.atSeconds };
        for (const txn of runPolicies(seed, policies, context)) {
          const amount = quantize(txn.amount, options.precision);
          if (amount === 0) continue;
          const finalTxn: AppliedTransaction = { ...txn, amount };
          applyTransaction(accounts, finalTxn);
          applied.push(finalTxn);
          events.push({ kind: "fired", ruleId: id, atSeconds: finalTxn.atSeconds, detail: amount });
        }
      }

      if (cycles.skipped > 0) {
        events.push({ kind: "skipped", ruleId: id, atSeconds: windowEnd, detail: cycles.skipped });
      }

      if (cursor.reserveRemaining !== undefined) cursor.reserveRemaining = nominal.remaining;
      // Time always moves past every due cycle in the window, whether settled or skipped.
      cursor.nextDueSeconds = firstDue + dueCount * rule.everySeconds;

      if (depleted) {
        cursor.done = true;
        events.push({ kind: "depleted", ruleId: id, atSeconds: windowEnd, detail: nominal.consumed });
      }
    }

    if (!cursor.done && Number.isFinite(end) && cursor.nextDueSeconds > end) {
      cursor.done = true;
      events.push({ kind: "ended", ruleId: id, atSeconds: end, detail: cursor.fired });
    }

    cursors[id] = cursor;
  }

  return {
    ledger: { nowSeconds: toSeconds, accounts, rules: { ...ledger.rules }, cursors },
    applied,
    events,
  };
}

interface CycleSlot {
  atSeconds: number;
  amount: number;
}

function buildCycles(
  catchUp: CatchUpPolicy,
  amounts: readonly number[],
  firstDue: number,
  everySeconds: number,
  perRuleLimit: number,
  maxCycles: number,
): { settled: CycleSlot[]; skipped: number } {
  const available = amounts.length;
  if (available === 0) return { settled: [], skipped: 0 };
  const timeOf = (index: number): number => firstDue + index * everySeconds;

  if (catchUp === "skip") {
    const last = available - 1;
    return { settled: [{ atSeconds: timeOf(last), amount: amounts[last]! }], skipped: last };
  }
  if (catchUp === "sum") {
    const kept = Math.min(available, perRuleLimit);
    let total = 0;
    for (let i = 0; i < kept; i += 1) total += amounts[i]!;
    const skipped = available - kept;
    if (kept === 0) return { settled: [], skipped };
    return { settled: [{ atSeconds: timeOf(kept - 1), amount: total }], skipped };
  }
  // "each"
  const kept = Math.min(available, perRuleLimit, maxCycles);
  const settled: CycleSlot[] = [];
  for (let i = 0; i < kept; i += 1) settled.push({ atSeconds: timeOf(i), amount: amounts[i]! });
  return { settled, skipped: available - kept };
}

function reserveCappedAmounts(
  count: number,
  amount: number,
  reserveRemaining: number | undefined,
): { amounts: number[]; remaining: number; consumed: number } {
  if (reserveRemaining === undefined) {
    return { amounts: new Array(count).fill(amount), remaining: Number.POSITIVE_INFINITY, consumed: count * amount };
  }
  const amounts: number[] = [];
  let remaining = reserveRemaining;
  for (let i = 0; i < count && remaining > EPSILON; i += 1) {
    const take = Math.min(amount, remaining);
    amounts.push(take);
    remaining -= take;
  }
  if (remaining < EPSILON) remaining = 0;
  return { amounts, remaining, consumed: reserveRemaining - remaining };
}

function runPolicies(
  seed: ResourceTransaction,
  policies: readonly ResourcePolicy[],
  ctx: PolicyContext,
): ResourceTransaction[] {
  let current: ResourceTransaction[] = [seed];
  for (const policy of policies) {
    const next: ResourceTransaction[] = [];
    for (const txn of current) {
      for (const out of policy(txn, ctx)) next.push(out);
    }
    current = next;
    if (current.length === 0) break;
  }
  return current;
}

function applyTransaction(accounts: Record<string, Record<string, number>>, txn: AppliedTransaction): void {
  if (txn.source !== undefined) addBalance(accounts, txn.source, txn.currency, -txn.amount);
  if (txn.recipient !== undefined) addBalance(accounts, txn.recipient, txn.currency, txn.amount);
}

function addBalance(
  accounts: Record<string, Record<string, number>>,
  account: string,
  currency: string,
  delta: number,
): void {
  const wallet = accounts[account] ?? (accounts[account] = {});
  wallet[currency] = (wallet[currency] ?? 0) + delta;
}

function quantize(value: number, precision: Precision | undefined): number {
  if (precision === undefined || !(precision.quantum > 0)) return value;
  const steps = value / precision.quantum;
  const rounded = Math.round(steps * 1e9) / 1e9;
  const mode = precision.mode ?? "round";
  const n = mode === "floor" ? Math.floor(rounded) : mode === "ceil" ? Math.ceil(rounded) : Math.round(rounded);
  return n * precision.quantum;
}

function cloneAccounts(
  accounts: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const account of Object.keys(accounts)) out[account] = { ...accounts[account]! };
  return out;
}

// ---------------------------------------------------------------------------
// Composable policy builders — the transform/cap/reject/split/redirect/annotate
// surface for the pipeline. Each returns a {@link ResourcePolicy}.
// ---------------------------------------------------------------------------

/** Reader over policy context: a `vars` key or a function of the context. */
export type PolicyRead = string | ((ctx: PolicyContext) => number);

function readValue(read: PolicyRead, ctx: PolicyContext): number {
  return typeof read === "function" ? read(ctx) : (ctx.vars[read] ?? 0);
}

function tagged(txn: ResourceTransaction, tag: string): readonly string[] {
  return [...txn.provenance, tag];
}

/**
 * Clamp a transaction's amount to at most `max` (a fixed number or a function of context).
 *
 * @capability policy-cap cap a scheduled transaction amount by context
 */
export function capAmount(max: number | ((ctx: PolicyContext) => number)): ResourcePolicy {
  return (txn, ctx) => {
    const limit = typeof max === "function" ? max(ctx) : max;
    if (txn.amount <= limit) return [txn];
    return [{ ...txn, amount: limit, provenance: tagged(txn, "capped") }];
  };
}

/**
 * Take a fraction of the amount. With `to`, the taxed portion is split off into a second
 * transaction toward that recipient (a transfer/tax); without it, the fraction is simply removed.
 *
 * @capability policy-tax split off a fraction of a transaction as tax or transfer
 */
export function taxFraction(fraction: number, to?: string): ResourcePolicy {
  const rate = Math.max(0, Math.min(1, fraction));
  return (txn) => {
    const taxed = txn.amount * rate;
    const kept = txn.amount - taxed;
    const out: ResourceTransaction[] = [];
    if (kept > 0) out.push({ ...txn, amount: kept, provenance: tagged(txn, "taxed") });
    if (taxed > 0 && to !== undefined) {
      out.push({ ...txn, amount: taxed, recipient: to, provenance: tagged(txn, `tax->${to}`) });
    }
    return out;
  };
}

/**
 * Override the source and/or recipient accounts of a transaction.
 *
 * @capability policy-redirect redirect a scheduled transaction's source or recipient
 */
export function redirect(endpoints: { source?: string; recipient?: string }): ResourcePolicy {
  return (txn) => [
    {
      ...txn,
      source: endpoints.source ?? txn.source,
      recipient: endpoints.recipient ?? txn.recipient,
      provenance: tagged(txn, "redirected"),
    },
  ];
}

/**
 * Drop a transaction when `predicate` holds — the reject arm of the pipeline.
 *
 * @capability policy-reject reject scheduled transactions by predicate
 */
export function rejectWhen(predicate: (txn: ResourceTransaction, ctx: PolicyContext) => boolean): ResourcePolicy {
  return (txn, ctx) => (predicate(txn, ctx) ? [] : [txn]);
}

/** Append a provenance tag to a transaction without changing its value. */
export function annotate(tag: string): ResourcePolicy {
  return (txn) => [{ ...txn, provenance: tagged(txn, tag) }];
}

/**
 * Scale the amount by the highest {@link ThresholdBand} whose `min` the read value meets — a
 * generic bracket modifier (progressive tax, tiered upkeep) over caller data, with no built-in
 * currencies or brackets.
 *
 * @capability policy-threshold scale a transaction by a context threshold band
 */
export function thresholdScale(read: PolicyRead, bands: readonly ThresholdBand[]): ResourcePolicy {
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  return (txn, ctx) => {
    const value = readValue(read, ctx);
    let factor = 1;
    for (const band of sorted) {
      if (value >= band.min) factor = band.factor;
      else break;
    }
    return [{ ...txn, amount: txn.amount * factor, provenance: tagged(txn, `threshold:${factor}`) }];
  };
}

/**
 * Scale the amount by a {@link Curve} evaluated at the read value — a generic curve modifier
 * (population upkeep, depletion falloff, difficulty income) over caller-provided context.
 *
 * @capability policy-curve scale a transaction by a curve over context
 */
export function curveScale(read: PolicyRead, shape: Curve): ResourcePolicy {
  return (txn, ctx) => {
    const factor = evalCurve(shape, readValue(read, ctx));
    return [{ ...txn, amount: txn.amount * factor, provenance: tagged(txn, "curve") }];
  };
}
