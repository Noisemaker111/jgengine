/**
 * Ordered, inspectable damage-resolution interception (#931).
 *
 * A pending damage application flows through an ordered list of interceptors
 * BEFORE lethality is resolved. Each interceptor may pass, transform, clamp,
 * redirect, split, defer, or reject the application, and every decision is
 * recorded as provenance so combat resolution stays auditable — no hidden
 * callbacks. Invulnerability, i-frames, and anti-one-shot clamps are ordinary
 * interceptors installed and removed by state transitions, not a boss branch.
 *
 * All state is serializable (`Record<string, number>` maps), all randomness is
 * absent (pure), and work is bounded by `MAX_INTERCEPT_STEPS` so split/redirect
 * can never recurse without limit.
 */

/** A damage application queued for resolution against a target. `amount` is always non-negative; healing is a separate concern. */
export interface PendingDamage {
  /** Instance receiving the damage. */
  target: string;
  /** Instance dealing the damage. */
  source: string;
  /** Damage magnitude, non-negative. */
  amount: number;
  /** Optional caller tag (weapon id, effect id, channel) carried through for provenance and downstream routing. */
  tag?: string;
}

/**
 * What an interceptor decides to do with the pending application it was handed.
 * `split` parts continue at the NEXT interceptor (never re-entering the splitter),
 * which is what keeps the pipeline bounded and recursion-free.
 */
export type InterceptDecision =
  | { kind: "pass" }
  | { kind: "transform"; amount: number; note?: string }
  | { kind: "clamp"; max: number; note?: string }
  | { kind: "redirect"; target: string; note?: string }
  | { kind: "split"; parts: readonly PendingDamage[]; note?: string }
  | { kind: "defer"; note?: string }
  | { kind: "reject"; note?: string };

/** Read-only context an interceptor may consult — deterministic clock and optional health lookup for HP-relative policies. */
export interface InterceptContext {
  /** Deterministic current time in milliseconds; interceptors never read a wall clock. */
  nowMs: number;
  /** Optional current/max pool lookup for the target, enabling HP-relative clamps like anti-one-shot. */
  healthOf?(target: string): { current: number; max: number } | undefined;
}

/** A named stage in the interception pipeline. The `id` is stable so it can be installed, removed, and cited in provenance. */
export interface DamageInterceptor {
  /** Stable identifier used for install/remove and provenance. */
  id: string;
  /** Decide what happens to `pending`; must be deterministic given `ctx`. */
  intercept(pending: PendingDamage, ctx: InterceptContext): InterceptDecision;
}

/** One row of provenance: which interceptor acted, what it decided, and the amount before/after it acted. */
export interface InterceptRecord {
  interceptor: string;
  kind: InterceptDecision["kind"];
  target: string;
  before: number;
  after: number;
  note?: string;
}

/** The outcome of running a pending application through the pipeline: what to apply, what was deferred, and why each value changed. */
export interface DamageResolution {
  /** Final applications to commit (0..n after splits/rejections). */
  applications: PendingDamage[];
  /** Applications held back by a `defer` decision for the caller to resubmit later. */
  deferred: PendingDamage[];
  /** Ordered record of every interceptor decision. */
  provenance: InterceptRecord[];
}

/** Upper bound on interceptor evaluations for a single resolution; guards against runaway `split`/`redirect` loops. */
export const MAX_INTERCEPT_STEPS = 256;

/**
 * Run one pending damage application through an ordered interceptor list before
 * lethality resolves, returning the final applications, any deferred ones, and
 * full provenance. Pure and deterministic; bounded by `MAX_INTERCEPT_STEPS`.
 *
 * @capability damage-interception intercept a pending damage application before lethal resolution with ordered, inspectable stages
 */
export function resolveDamage(
  interceptors: readonly DamageInterceptor[],
  pending: PendingDamage,
  ctx: InterceptContext,
): DamageResolution {
  const applications: PendingDamage[] = [];
  const deferred: PendingDamage[] = [];
  const provenance: InterceptRecord[] = [];
  const queue: { pending: PendingDamage; next: number }[] = [{ pending: normalize(pending), next: 0 }];
  let steps = 0;

  while (queue.length > 0) {
    if (++steps > MAX_INTERCEPT_STEPS) break;
    const item = queue.shift();
    if (item === undefined) break;
    if (item.next >= interceptors.length) {
      applications.push(item.pending);
      continue;
    }
    const interceptor = interceptors[item.next];
    if (interceptor === undefined) {
      applications.push(item.pending);
      continue;
    }
    const current = item.pending;
    const interceptorId = interceptor.id;
    const decision = interceptor.intercept(current, ctx);
    const before = current.amount;

    function record(after: number, note?: string): void {
      const row: InterceptRecord = {
        interceptor: interceptorId,
        kind: decision.kind,
        target: current.target,
        before,
        after,
      };
      if (note !== undefined) row.note = note;
      provenance.push(row);
    }

    const nextIndex = item.next + 1;
    switch (decision.kind) {
      case "pass":
        record(before);
        queue.push({ pending: current, next: nextIndex });
        break;
      case "transform": {
        const amount = Math.max(0, decision.amount);
        record(amount, decision.note);
        queue.push({ pending: { ...current, amount }, next: nextIndex });
        break;
      }
      case "clamp": {
        const amount = Math.min(current.amount, Math.max(0, decision.max));
        record(amount, decision.note);
        queue.push({ pending: { ...current, amount }, next: nextIndex });
        break;
      }
      case "redirect":
        record(before, decision.note);
        queue.push({ pending: { ...current, target: decision.target }, next: nextIndex });
        break;
      case "split":
        record(before, decision.note);
        for (const part of decision.parts) queue.push({ pending: normalize(part), next: nextIndex });
        break;
      case "defer":
        record(before, decision.note);
        deferred.push(current);
        break;
      case "reject":
        record(0, decision.note);
        break;
    }
  }

  return { applications, deferred, provenance };
}

function normalize(pending: PendingDamage): PendingDamage {
  return pending.amount >= 0 ? pending : { ...pending, amount: 0 };
}

/** A mutable ordered interceptor chain that transitions can install into and remove from at runtime. */
export interface DamagePipeline {
  /** Append an interceptor, or replace an existing one with the same `id` in place. */
  install(interceptor: DamageInterceptor): void;
  /** Remove the interceptor with `id`; returns whether one was removed. */
  remove(id: string): boolean;
  /** Whether an interceptor with `id` is currently installed. */
  has(id: string): boolean;
  /** Installed interceptor ids in evaluation order (serializable install record). */
  interceptorIds(): string[];
  /** Resolve one pending application through the current chain. */
  resolve(pending: PendingDamage, ctx: InterceptContext): DamageResolution;
}

/**
 * Create a mutable damage interception chain that state transitions install into
 * and remove from — e.g. add an invulnerability interceptor on phase enter and
 * drop it on phase exit. Evaluation order is install order.
 *
 * @capability damage-pipeline install and remove ordered damage interceptors that transitions toggle at runtime
 */
export function createDamagePipeline(initial?: readonly DamageInterceptor[]): DamagePipeline {
  const interceptors: DamageInterceptor[] = initial === undefined ? [] : [...initial];

  function indexOf(id: string): number {
    return interceptors.findIndex((entry) => entry.id === id);
  }

  return {
    install(interceptor) {
      const idx = indexOf(interceptor.id);
      if (idx >= 0) interceptors[idx] = interceptor;
      else interceptors.push(interceptor);
    },
    remove(id) {
      const idx = indexOf(id);
      if (idx < 0) return false;
      interceptors.splice(idx, 1);
      return true;
    },
    has(id) {
      return indexOf(id) >= 0;
    },
    interceptorIds() {
      return interceptors.map((entry) => entry.id);
    },
    resolve(pending, ctx) {
      return resolveDamage(interceptors, pending, ctx);
    },
  };
}

/** Caller data for a flat per-hit damage cap. */
export interface DamageClampConfig {
  /** Interceptor id; defaults to `"damage-clamp"`. */
  id?: string;
  /** Maximum damage a single application may carry. */
  maxPerHit: number;
}

/**
 * A stateless interceptor that caps any single application at `maxPerHit`.
 *
 * @capability damage-clamp cap incoming damage per hit at a configured maximum
 */
export function createDamageClamp(config: DamageClampConfig): DamageInterceptor {
  const id = config.id ?? "damage-clamp";
  return {
    id,
    intercept(pending) {
      if (pending.amount <= config.maxPerHit) return { kind: "pass" };
      return { kind: "clamp", max: config.maxPerHit, note: `capped at ${config.maxPerHit}` };
    },
  };
}

/** A per-target timed immunity policy: an interceptor plus grant/query/serialize controls, toggled by transitions. */
export interface ImmunityWindow {
  /** The interceptor to install; rejects damage to any target whose immunity has not expired. */
  interceptor: DamageInterceptor;
  /** Make `target` immune until `untilMs` (extends, never shortens, an existing window). */
  grant(target: string, untilMs: number): void;
  /** Make `target` immune for `durationMs` starting at `nowMs`. */
  grantFor(target: string, nowMs: number, durationMs: number): void;
  /** Whether `target` is immune at `nowMs`. */
  active(target: string, nowMs: number): boolean;
  /** Drop `target`'s immunity immediately. */
  clear(target: string): void;
  /** Drop every window that has expired at `nowMs` (bounded housekeeping for save size). */
  clearExpired(nowMs: number): void;
  /** Serializable snapshot: target → expiry ms. */
  snapshot(): Record<string, number>;
  /** Restore from a snapshot. */
  restore(snap: Record<string, number>): void;
}

/**
 * A per-target immunity/invulnerability window as an ordinary damage policy —
 * granted and cleared by state transitions (i-frames, phase invuln), rejecting
 * damage while active. Deterministic (time is passed in) and serializable.
 *
 * @capability immunity-window reject damage during a per-target invulnerability window installed by transitions
 */
export function createImmunityWindow(id = "immunity"): ImmunityWindow {
  const until = new Map<string, number>();
  const window: ImmunityWindow = {
    interceptor: {
      id,
      intercept(pending, ctx) {
        const expiry = until.get(pending.target);
        if (expiry !== undefined && ctx.nowMs < expiry) return { kind: "reject", note: `immune until ${expiry}` };
        return { kind: "pass" };
      },
    },
    grant(target, untilMs) {
      const prev = until.get(target);
      until.set(target, prev === undefined ? untilMs : Math.max(prev, untilMs));
    },
    grantFor(target, nowMs, durationMs) {
      window.grant(target, nowMs + durationMs);
    },
    active(target, nowMs) {
      const expiry = until.get(target);
      return expiry !== undefined && nowMs < expiry;
    },
    clear(target) {
      until.delete(target);
    },
    clearExpired(nowMs) {
      for (const [target, expiry] of [...until]) if (nowMs >= expiry) until.delete(target);
    },
    snapshot() {
      return Object.fromEntries(until);
    },
    restore(snap) {
      until.clear();
      for (const [target, expiry] of Object.entries(snap)) until.set(target, expiry);
    },
  };
  return window;
}

/** Caller data for the anti-one-shot composition: "cannot cross lethal while above X, leave Y, then recover for Z". */
export interface AntiOneShotConfig {
  /** Interceptor id; defaults to `"anti-one-shot"`. */
  id?: string;
  /** Only intervene when the target's HP fraction is strictly above this (X). Below it, lethal hits pass. */
  guardAboveFraction: number;
  /** HP fraction to leave the target at after an intercepted near-lethal hit (Y). */
  leaveFraction: number;
  /** Immunity granted after an intercepted hit, in milliseconds (Z). */
  recoverMs: number;
}

/** The anti-one-shot policy: an interceptor plus its serializable recovery-immunity state. */
export interface AntiOneShotPolicy {
  /** The interceptor to install ahead of lethal resolution. */
  interceptor: DamageInterceptor;
  /** Whether `target` is in the post-hit recovery i-frame at `nowMs`. */
  immune(target: string, nowMs: number): boolean;
  /** Serializable snapshot: target → recovery expiry ms. */
  snapshot(): Record<string, number>;
  /** Restore from a snapshot. */
  restore(snap: Record<string, number>): void;
}

/**
 * Compose a reusable anti-one-shot / chip-guard clamp from caller data:
 * while above `guardAboveFraction` a hit cannot drop the target below
 * `leaveFraction`, and after such a save the target gets `recoverMs` of
 * immunity. Below the guard fraction, lethal hits pass unchanged.
 *
 * @capability anti-one-shot clamp a near-lethal hit to leave a health floor then grant recovery immunity
 */
export function createAntiOneShotPolicy(config: AntiOneShotConfig): AntiOneShotPolicy {
  const id = config.id ?? "anti-one-shot";
  const immuneUntil = new Map<string, number>();
  const policy: AntiOneShotPolicy = {
    interceptor: {
      id,
      intercept(pending, ctx) {
        const expiry = immuneUntil.get(pending.target);
        if (expiry !== undefined && ctx.nowMs < expiry) return { kind: "reject", note: "anti-one-shot i-frame" };
        const hp = ctx.healthOf?.(pending.target);
        if (hp === undefined || hp.max <= 0) return { kind: "pass" };
        const fraction = hp.current / hp.max;
        if (fraction <= config.guardAboveFraction) return { kind: "pass" };
        const floor = config.leaveFraction * hp.max;
        if (hp.current - pending.amount >= floor) return { kind: "pass" };
        const clamped = Math.max(0, hp.current - floor);
        immuneUntil.set(pending.target, ctx.nowMs + config.recoverMs);
        return { kind: "clamp", max: clamped, note: `anti-one-shot: leave ${floor}, recover ${config.recoverMs}ms` };
      },
    },
    immune(target, nowMs) {
      const expiry = immuneUntil.get(target);
      return expiry !== undefined && nowMs < expiry;
    },
    snapshot() {
      return Object.fromEntries(immuneUntil);
    },
    restore(snap) {
      immuneUntil.clear();
      for (const [target, expiry] of Object.entries(snap)) immuneUntil.set(target, expiry);
    },
  };
  return policy;
}
