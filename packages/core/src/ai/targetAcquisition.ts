/**
 * Composable target acquisition: the "which enemy do I lock onto?" decision split into the
 * independent concerns every aggro system tangles together — a bounded candidate provider, an
 * eligibility filter, a per-pair acquisition envelope (dynamic range), a perception/LOS gate,
 * scoring, deterministic tie-break, and retention hysteresis. This owns *policy*; threat, brains,
 * and movement stay separate. Feed `candidates` a spatial-index query, never a full-world scan.
 */

/** A per-pair acquisition range: a static radius, or a function that varies range by pair. */
export type AcquisitionEnvelope = number | ((selfId: string, candidateId: string) => number);

/** Retention hysteresis that keeps an already-held target from flickering under churn. */
export interface AcquisitionRetention {
  /**
   * A challenger's score must beat the held target's by at least this additive margin to steal
   * acquisition. Keeps the lock stable when scores are near-tied. Default `0` (any win switches).
   */
  readonly switchMargin?: number;
  /**
   * The held target keeps acquisition out to `range * dropRangeScale` before it is dropped, so a
   * target does not un-acquire the instant it steps past the acquisition edge. Default `1`.
   */
  readonly dropRangeScale?: number;
}

/**
 * A fully composed acquisition policy. Every concern is an independent, injectable seam; the only
 * required pieces are the bounded `candidates` provider and the `distance` metric. Omit the rest to
 * fall back to the thin default — a static/unbounded range, everything eligible and perceptible,
 * nearest-wins scoring, id tie-break, no hysteresis — which matches a plain proximity aggro radius.
 */
export interface AcquisitionPolicy {
  /** Bounded candidate ids for `selfId` — wire a spatial-index query here, not a whole-world list. */
  readonly candidates: (selfId: string) => Iterable<string>;
  /** Distance self→candidate; `null` rejects the candidate (despawned / unmeasurable). */
  readonly distance: (selfId: string, candidateId: string) => number | null;
  /** Per-pair acquisition range (the dynamic envelope). Default `Infinity` (range-unbounded). */
  readonly range?: AcquisitionEnvelope;
  /** Eligibility filter run first — faction, alive, targetable, stealth, ownership. Default: all pass. */
  readonly eligible?: (selfId: string, candidateId: string) => boolean;
  /** Perception / line-of-sight gate run last (after range) because it is the costly check. */
  readonly perceptible?: (selfId: string, candidateId: string, distance: number) => boolean;
  /** Score of an in-range candidate; the highest wins. Default: nearest (`-distance`). */
  readonly score?: (selfId: string, candidateId: string, distance: number) => number;
  /** Deterministic tie-break when scores are equal (return <0 to prefer `a`). Default: id order. */
  readonly tieBreak?: (a: string, b: string) => number;
  /** Retention/hysteresis for an already-held target. Omit for no stickiness. */
  readonly retention?: AcquisitionRetention;
}

/** Outcome of one acquisition pass. */
export interface AcquisitionResult {
  /** The chosen target, or `null` when nothing qualifies. */
  readonly targetId: string | null;
  /** True when `targetId` differs from the `held` target passed in (a fresh acquire or a switch). */
  readonly changed: boolean;
  /** Candidates that passed eligibility + range + perception this pass — a cheap tuning/metric signal. */
  readonly considered: number;
}

function resolveRange(range: AcquisitionEnvelope | undefined, selfId: string, candidateId: string): number {
  if (range === undefined) return Number.POSITIVE_INFINITY;
  return typeof range === "number" ? range : range(selfId, candidateId);
}

function defaultTieBreak(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Run one acquisition pass and pick the best target under `policy`. Pass the currently `held` target
 * so retention hysteresis (`switchMargin`, `dropRangeScale`) can keep the lock stable; pass `null`
 * for a cold acquire. Pure and allocation-light — the caller owns the held-target state.
 *
 * @capability target-acquisition composable candidate/eligibility/range/perception/score/tie-break/retention target pick
 */
export function acquireTarget(
  policy: AcquisitionPolicy,
  selfId: string,
  held: string | null = null,
): AcquisitionResult {
  const tieBreak = policy.tieBreak ?? defaultTieBreak;
  const dropScale = Math.max(0, policy.retention?.dropRangeScale ?? 1);
  const switchMargin = policy.retention?.switchMargin ?? 0;

  let considered = 0;
  let bestId: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let heldSeen = false;
  let heldScore = Number.NEGATIVE_INFINITY;

  for (const candidateId of policy.candidates(selfId)) {
    if (candidateId === selfId) continue;
    if (policy.eligible !== undefined && !policy.eligible(selfId, candidateId)) continue;
    const d = policy.distance(selfId, candidateId);
    if (d === null) continue;
    const range = resolveRange(policy.range, selfId, candidateId);
    const effectiveRange = candidateId === held ? range * dropScale : range;
    if (d > effectiveRange) continue;
    if (policy.perceptible !== undefined && !policy.perceptible(selfId, candidateId, d)) continue;

    considered += 1;
    const score = policy.score === undefined ? -d : policy.score(selfId, candidateId, d);
    if (candidateId === held) {
      heldSeen = true;
      heldScore = score;
    }
    if (
      bestId === null ||
      score > bestScore ||
      (score === bestScore && tieBreak(candidateId, bestId) < 0)
    ) {
      bestId = candidateId;
      bestScore = score;
    }
  }

  // Retention: an in-range held target keeps the lock unless a challenger clears the switch margin.
  if (heldSeen && held !== null && bestId !== held && bestScore < heldScore + switchMargin) {
    return { targetId: held, changed: false, considered };
  }
  return { targetId: bestId, changed: bestId !== held, considered };
}

/** A stateful acquirer that holds the current target across passes — sugar over {@link acquireTarget}. */
export interface TargetAcquirer {
  /** Re-run acquisition for `selfId`, update the held target, and return it. */
  acquire(selfId: string): string | null;
  /** The held target without re-running acquisition. */
  target(): string | null;
  /** Candidates considered on the last {@link acquire} pass. */
  considered(): number;
  /** Force the held target — external override for taunt, script, or ownership handoff. */
  hold(targetId: string | null): void;
  /** Drop back to unacquired. */
  clear(): void;
}

/**
 * Wrap an {@link AcquisitionPolicy} in a small object that remembers the held target between passes,
 * so callers get retention hysteresis for free without threading the previous target by hand. The
 * only state is the held id (a string) — trivially serializable; round-trip it with {@link TargetAcquirer.hold}.
 *
 * @capability target-acquirer stateful held-target wrapper over an acquisition policy with retention
 */
export function createTargetAcquirer(policy: AcquisitionPolicy): TargetAcquirer {
  let held: string | null = null;
  let considered = 0;
  return {
    acquire(selfId) {
      const result = acquireTarget(policy, selfId, held);
      held = result.targetId;
      considered = result.considered;
      return held;
    },
    target: () => held,
    considered: () => considered,
    hold(targetId) {
      held = targetId;
    },
    clear() {
      held = null;
      considered = 0;
    },
  };
}
