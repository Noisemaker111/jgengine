import { appendFeed } from "../game/feed";
import type { LootPipeline, LootResolution } from "../game/lootPipeline";
import type { Drop } from "../game/lootTable";
import { hashString, randomSeedFrom, stepRandomSeed, type RandomSeed } from "../random/rng";
import { accrueSince } from "../time/accrueSince";
import { steppedCatchUp } from "../time/idleProgress";

/** Timestamped serializable event. `at` is epoch milliseconds, compatible with `appendFeed`. */
export interface ExpeditionEvent {
  at: number;
  /** Lifecycle kinds are loot/hazard/supply/death/recall/return; encounter notices may use caller kinds. */
  kind: string;
  text: string;
  /** Accepted drops; `loot.drops` records the full roll before the item-unit capacity bound. */
  drops?: readonly Drop[];
  loot?: LootResolution;
  hpDelta?: number;
  exposureDelta?: number;
  supply?: string;
}

/** Plain saveable expedition data. Persist this whole value, including the RNG cursor and tick frontier. */
export interface ExpeditionState {
  readonly id: string;
  readonly status: "exploring" | "returning" | "home" | "dead";
  readonly startedAtMs: number;
  /** Last completed event tick (arrival time after return), never an unprocessed catch-up target. */
  readonly lastSettledMs: number;
  readonly elapsedMs: number;
  readonly returnUntilMs: number | null;
  readonly hp: number;
  /** Caller-interpreted hazard meter; its meaning and effective max-HP policy are injected. */
  readonly exposure: number;
  readonly supplies: Readonly<Record<string, number>>;
  /** Counts are merged by item/currency id; currency does not consume item capacity. */
  readonly carried: readonly Drop[];
  readonly log: readonly ExpeditionEvent[];
  readonly seed: string;
  readonly cursor: RandomSeed;
}

/** Dispatch data, detached from the caller's supply record. All timestamps are epoch milliseconds. */
export interface ExpeditionDispatch {
  id: string;
  startAtMs: number;
  hp: number;
  exposure?: number;
  supplies?: Readonly<Record<string, number>>;
  seed: string;
}

/** One encounter's mechanical effects and optional caller-authored notices. */
export interface ExpeditionHazard {
  damage?: number;
  exposure?: number;
  notices?: readonly { kind: string; text: string }[];
}

/** Ordered auto-consumption rule: spends one finite supply only when its declared effect changes a vital. */
export interface ExpeditionSupplyRule {
  key: string;
  when: (state: ExpeditionState) => boolean;
  restoreHp?: number;
  clearExposure?: number;
}

/** Runtime policy, supplied on each transition and never saved. Callbacks must be pure. */
export interface ExpeditionConfig<TCtx> {
  /** Positive whole milliseconds between events; cadence retuning anchors at the last completed tick. */
  tickMs: number;
  loot: LootPipeline<TCtx>;
  lootCtx: (state: ExpeditionState) => TCtx;
  maxHp: (state: ExpeditionState) => number;
  hazard?: (state: ExpeditionState, rng: () => number) => ExpeditionHazard;
  supplies?: readonly ExpeditionSupplyRule[];
  /** Nonnegative fraction of exploring elapsed time spent returning. */
  returnFraction: number;
  /** Positive whole item units; currency is carried without consuming item slots. */
  carryCap: number;
  /** Bounded work per call, default 10,000; excess ticks remain unsettled for the next call. */
  maxTicksPerSettle?: number;
  /** Newest event count retained by appendFeed, default 200; rewards and RNG are retained separately. */
  logLimit?: number;
  /** Optional alternative persisted RNG recurrence; returns a [0,1) value and its next cursor. */
  randomStep?: (cursor: RandomSeed) => readonly [number, RandomSeed];
  /** All lifecycle prose is caller-authored; omit for headless logs with empty text. */
  describe?: (event: Omit<ExpeditionEvent, "text">, state: ExpeditionState) => string;
}

function nonnegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`);
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`);
  return value;
}

function validate<TCtx>(config: ExpeditionConfig<TCtx>, state: ExpeditionState, nowMs: number): void {
  if (!Number.isFinite(nowMs) || !Number.isFinite(state.startedAtMs) || !Number.isFinite(state.lastSettledMs)) throw new RangeError("Expedition timestamps must be finite");
  if (state.lastSettledMs < state.startedAtMs || (state.returnUntilMs !== null && !Number.isFinite(state.returnUntilMs))) throw new RangeError("Invalid expedition time frontier");
  if (!Number.isSafeInteger(state.cursor)) throw new RangeError("Expedition RNG cursor must be a safe integer");
  positiveInteger(config.tickMs, "tickMs");
  positiveInteger(config.carryCap, "carryCap");
  positiveInteger(config.maxTicksPerSettle ?? 10_000, "maxTicksPerSettle");
  positiveInteger(config.logLimit ?? 200, "logLimit");
  nonnegative(config.returnFraction, "returnFraction");
  nonnegative(state.hp, "hp");
  nonnegative(state.exposure, "exposure");
  nonnegative(state.elapsedMs, "elapsedMs");
  for (const count of Object.values(state.supplies)) if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("Supply counts must be nonnegative safe integers");
}

function record<TCtx>(config: ExpeditionConfig<TCtx>, state: ExpeditionState, event: Omit<ExpeditionEvent, "text">, text?: string): ExpeditionState {
  return { ...state, log: appendFeed(state.log, { ...event, text: text ?? config.describe?.(event, state) ?? "" }, { limit: config.logLimit ?? 200 }) };
}

function itemUnits(drops: readonly Drop[]): number {
  let units = 0;
  for (const drop of drops) if (drop.item !== undefined) units += nonnegative(drop.count, "Item count");
  return nonnegative(units, "Carried item units");
}

function acceptLoot(cap: number, carried: readonly Drop[], drops: readonly Drop[]): { carried: Drop[]; accepted: Drop[] } {
  let remaining = Math.max(0, cap - itemUnits(carried));
  const next = carried.map(drop => ({ ...drop }));
  const accepted: Drop[] = [];
  for (const drop of drops) {
    const count = nonnegative(drop.count, "Drop count");
    if ((drop.item === undefined) === (drop.currency === undefined)) throw new RangeError("Expedition drops need exactly one item or currency id");
    if (drop.item !== undefined && !Number.isSafeInteger(count)) throw new RangeError("Item counts must be nonnegative safe integers");
    const admitted = drop.item === undefined ? count : Math.min(count, remaining);
    if (drop.item !== undefined) remaining -= admitted;
    if (admitted === 0) continue;
    const incoming = { ...drop, count: admitted };
    accepted.push(incoming);
    const existing = next.find(entry => drop.item !== undefined ? entry.item === drop.item : entry.currency === drop.currency && entry.item === undefined);
    if (existing === undefined) next.push({ ...incoming });
    else existing.count = nonnegative(existing.count + admitted, "Carried count");
  }
  return { carried: next, accepted };
}

function arrive<TCtx>(config: ExpeditionConfig<TCtx>, state: ExpeditionState, nowMs: number): ExpeditionState {
  if (state.status !== "returning" || state.returnUntilMs === null || nowMs < state.returnUntilMs) return state;
  const at = state.returnUntilMs;
  return record(config, { ...state, status: "home", lastSettledMs: at }, { at, kind: "return" });
}

function beginReturn<TCtx>(config: ExpeditionConfig<TCtx>, state: ExpeditionState, at: number): ExpeditionState {
  const elapsedMs = Math.max(state.elapsedMs, at - state.startedAtMs);
  const returnUntilMs = at + elapsedMs * config.returnFraction;
  if (!Number.isFinite(returnUntilMs)) throw new RangeError("Expedition return deadline overflowed");
  return arrive(config, record(config, { ...state, status: "returning", elapsedMs, returnUntilMs, lastSettledMs: at }, { at, kind: "recall" }), at);
}

/**
 * Dispatch plain expedition state with a persisted seeded cursor; no clock, scheduler or storage is owned.
 *
 * @capability expedition-dispatch dispatch a saveable timed away mission with finite supplies and a seeded RNG cursor
 */
export function dispatchExpedition(input: ExpeditionDispatch): ExpeditionState {
  if (!Number.isFinite(input.startAtMs)) throw new RangeError("startAtMs must be finite");
  nonnegative(input.hp, "hp");
  nonnegative(input.exposure ?? 0, "exposure");
  const supplies = { ...input.supplies };
  for (const count of Object.values(supplies)) if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("Supply counts must be nonnegative safe integers");
  return { id: input.id, status: input.hp === 0 ? "dead" : "exploring", startedAtMs: input.startAtMs, lastSettledMs: input.startAtMs,
    elapsedMs: 0, returnUntilMs: null, hp: input.hp, exposure: input.exposure ?? 0, supplies, carried: [], log: [], seed: input.seed, cursor: randomSeedFrom(hashString(input.seed)) };
}

/**
 * Replay due event ticks using the existing stepped catch-up primitive. Order is loot → hazard → ordered
 * supplies → death → capacity recall. Unprocessed ticks retain their frontier; returning never rolls or
 * takes damage. Auto-recall uses the triggering tick's time, including offline arrival in the same call.
 *
 * @capability expedition-settle settle bounded offline expedition ticks without losing supplies rewards or RNG continuity
 */
export function settleExpedition<TCtx>(config: ExpeditionConfig<TCtx>, state: ExpeditionState, nowMs: number): ExpeditionState {
  validate(config, state, nowMs);
  if (nowMs < state.lastSettledMs || (state.status === "exploring" && nowMs < state.startedAtMs + state.elapsedMs) || state.status === "dead" || state.status === "home") return state;
  if (state.status === "returning") return arrive(config, state, nowMs);
  let next = state;
  const step = config.randomStep ?? stepRandomSeed;
  const window = accrueSince(state.lastSettledMs, nowMs);
  nonnegative(window.elapsedMs, "Catch-up duration");
  // Normalize to whole one-unit ticks so fractional-second division cannot lose a due millisecond.
  const ticks = Math.floor(window.elapsedMs / config.tickMs);
  steppedCatchUp(ticks, 1, () => {
    if (next.status !== "exploring") return;
    const at = next.lastSettledMs + config.tickMs;
    next = { ...next, lastSettledMs: at, elapsedMs: at - next.startedAtMs };
    let cursor = next.cursor;
    const rng = () => { const [value, following] = step(cursor);
      if (!Number.isFinite(value) || value < 0 || value >= 1 || !Number.isSafeInteger(following)) throw new RangeError("Expedition RNG must return a [0,1) value and safe integer cursor");
      cursor = following; return value;
    };
    const resolution = config.loot.resolve({ ctx: config.lootCtx(next), rng, seed: next.seed });
    const accepted = acceptLoot(config.carryCap, next.carried, resolution.drops);
    next = { ...next, carried: accepted.carried };
    if (resolution.drops.length > 0) next = record(config, next, { at, kind: "loot", drops: accepted.accepted, loot: resolution });
    const hazard = config.hazard?.(next, rng) ?? {};
    const exposure = nonnegative(next.exposure + nonnegative(hazard.exposure ?? 0, "Hazard exposure"), "Exposure");
    const hp = Math.min(nonnegative(config.maxHp({ ...next, exposure }), "maxHp"), Math.max(0, next.hp - nonnegative(hazard.damage ?? 0, "Hazard damage")));
    const hpDelta = hp - next.hp, exposureDelta = exposure - next.exposure;
    next = { ...next, hp, exposure };
    if (hpDelta !== 0 || exposureDelta !== 0) next = record(config, next, { at, kind: "hazard", hpDelta, exposureDelta });
    for (const notice of hazard.notices ?? []) next = record(config, next, { at, kind: notice.kind }, notice.text);
    for (const rule of config.supplies ?? []) {
      const count = Object.hasOwn(next.supplies, rule.key) ? next.supplies[rule.key]! : 0;
      const restoreHp = nonnegative(rule.restoreHp ?? 0, "Supply restoration"), clearExposure = nonnegative(rule.clearExposure ?? 0, "Supply cleansing");
      if (count <= 0 || !rule.when(next)) continue;
      const exposure = Math.max(0, next.exposure - clearExposure);
      const hp = Math.min(nonnegative(config.maxHp({ ...next, exposure }), "maxHp"), nonnegative(next.hp + restoreHp, "Restored hp"));
      if (hp === next.hp && exposure === next.exposure) continue;
      const hpDelta = hp - next.hp, exposureDelta = exposure - next.exposure;
      next = { ...next, hp, exposure, supplies: { ...next.supplies, [rule.key]: count - 1 } };
      next = record(config, next, { at, kind: "supply", supply: rule.key, hpDelta, exposureDelta });
    }
    next = { ...next, cursor };
    if (next.hp <= 0) next = record(config, { ...next, status: "dead" }, { at, kind: "death" });
    else if (itemUnits(next.carried) >= config.carryCap) next = beginReturn(config, next, at);
  }, config.maxTicksPerSettle ?? 10_000);
  if (next.status === "exploring" && nowMs - next.lastSettledMs < config.tickMs) {
    const elapsedMs = Math.max(next.elapsedMs, nowMs - next.startedAtMs);
    nonnegative(elapsedMs, "Exploring duration");
    if (elapsedMs !== next.elapsedMs) next = { ...next, elapsedMs };
    if (itemUnits(next.carried) >= config.carryCap) next = beginReturn(config, next, nowMs);
  }
  return arrive(config, next, nowMs);
}

/**
 * Settle first, then recall safely. If the catch-up budget leaves due exploring ticks, return that state
 * without recalling; repeat at the same target until the frontier catches up. Dead state never revives.
 *
 * @capability expedition-recall begin a safe fractional-time return after settling the pending expedition frontier
 */
export function recallExpedition<TCtx>(config: ExpeditionConfig<TCtx>, state: ExpeditionState, nowMs: number): ExpeditionState {
  const next = settleExpedition(config, state, nowMs);
  return next.status === "exploring" && nowMs >= next.startedAtMs + next.elapsedMs && nowMs >= next.lastSettledMs && nowMs - next.lastSettledMs < config.tickMs ? beginReturn(config, next, nowMs) : next;
}

/**
 * Settle first, then complete a live return instantly. Caller owns payment/authorization; pending ticks
 * remain unsettled when the budget is exhausted, and dead/home state is never changed.
 *
 * @capability expedition-return complete an authorized instant return without skipping unsettled ticks or reviving death
 */
export function returnExpeditionNow<TCtx>(config: ExpeditionConfig<TCtx>, state: ExpeditionState, nowMs: number): ExpeditionState {
  const next = settleExpedition(config, state, nowMs);
  if (next.status === "dead" || next.status === "home" || nowMs < next.lastSettledMs || (next.status === "exploring" && nowMs < next.startedAtMs + next.elapsedMs) || (next.status === "exploring" && nowMs - next.lastSettledMs >= config.tickMs)) return next;
  return record(config, { ...next, status: "home", returnUntilMs: nowMs, lastSettledMs: nowMs }, { at: nowMs, kind: "return" });
}
