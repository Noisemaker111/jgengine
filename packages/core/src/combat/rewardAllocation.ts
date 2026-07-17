import { hashString, seededStreams } from "../random/rng";

/**
 * One indivisible reward to distribute among participants — an opaque result id (a rolled drop, a
 * currency bundle, a quest token) with an optional stack `count` and free-form `tags` for eligibility
 * and provenance. Allocation never interprets the id; generation (loot tables, roll formulas) owns
 * what it means, keeping the seam genre-agnostic.
 */
export interface RewardResult {
  id: string;
  count?: number;
  tags?: readonly string[];
}

/**
 * A participant that may receive rewards — an opaque recipient id (player, team, party slot) with an
 * optional split `weight` (shared policy), eligibility `tags`, and an `eligible` gate. Ineligible
 * recipients are excluded before any allocation decision so they never perturb others' streams.
 */
export interface RewardRecipient {
  id: string;
  weight?: number;
  tags?: readonly string[];
  eligible?: boolean;
}

/** The distribution policies allocation ships — each a distinct answer to "who gets this result". */
export type RewardPolicyKind = "instanced" | "shared" | "copy" | "roundRobin" | "assigned" | "claimed";

/** A `{ result, count }` slice of a reward — the unit shared pools and grants are expressed in. */
export interface RewardShare {
  result: string;
  count: number;
}

/**
 * An authoritative, serializable award of one result stack to one recipient — carries `via` (the
 * policy that produced it) and `private` (replication scope) so provenance and visibility survive
 * save/load and viewer projection. Applying a grant twice with the same identity is the caller's
 * idempotency contract; this seam only decides who is owed what.
 */
export interface RewardGrant {
  recipient: string;
  result: string;
  count: number;
  via: RewardPolicyKind;
  private: boolean;
}

/**
 * A serializable pool of results left open for later claiming — first-come contested drops or a
 * `reservedFor` personal reward. Tracks `eligible` claimants, optional `expiresAtMs`, and the
 * authoritative `claimedBy` winner so reconnect and duplicate-claim attempts resolve idempotently.
 */
export interface ClaimablePool {
  id: string;
  via: RewardPolicyKind;
  results: RewardShare[];
  eligible: string[];
  reservedFor: string | null;
  expiresAtMs: number | null;
  claimedBy: string | null;
}

/** How a `claimed` allocation exposes its pool: open first-come (`first`) or `reserved` to one recipient. */
export interface RewardClaimSpec {
  mode: "first" | "reserved";
  reservedFor?: string;
  expiresAtMs?: number;
}

/**
 * The inputs one allocation pass consumes. `allocationSeed` governs distribution decisions
 * (ordering, round-robin rotation, remainder splits, reservation) while the separate optional
 * `generationSeed` seeds per-recipient `instanced` generation — keeping join order from perturbing
 * other players' rolls. Provide `results` for pre-rolled policies, `generate` for `instanced`,
 * `assignment` for `assigned`, and `claim` for `claimed`.
 */
export interface AllocationRequest {
  recipients: readonly RewardRecipient[];
  allocationSeed: string | number;
  generationSeed?: string | number;
  results?: readonly RewardResult[];
  generate?: (rng: () => number, recipient: RewardRecipient) => readonly RewardResult[];
  assignment?: Record<string, readonly string[]>;
  claim?: RewardClaimSpec;
  nowMs?: number;
  private?: boolean;
}

/** The serializable result of an allocation pass — immediate `grants` plus any deferred `pools`. */
export interface AllocationOutcome {
  grants: RewardGrant[];
  pools: ClaimablePool[];
}

/** The outcome of a claim attempt — the updated pool and the grants owed (empty when the claim is refused). */
export interface ClaimOutcome {
  pool: ClaimablePool;
  grants: RewardGrant[];
}

function countOf(result: RewardResult): number {
  const n = result.count ?? 1;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Eligible recipients in a deterministic, seed-shuffled order independent of input array order. */
function orderedEligible(request: AllocationRequest): RewardRecipient[] {
  const eligible = request.recipients.filter((r) => r.eligible !== false);
  const seed = String(request.allocationSeed);
  return [...eligible].sort((a, b) => {
    const ka = hashString(`${seed}:order:${a.id}`);
    const kb = hashString(`${seed}:order:${b.id}`);
    if (ka !== kb) return ka - kb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function requireResults(request: AllocationRequest, kind: RewardPolicyKind): readonly RewardResult[] {
  if (request.results === undefined) {
    throw new Error(`reward policy "${kind}" requires results`);
  }
  return request.results;
}

function grant(
  recipient: string,
  result: string,
  count: number,
  via: RewardPolicyKind,
  isPrivate: boolean,
): RewardGrant {
  return { recipient, result, count, via, private: isPrivate };
}

/** Per-recipient independent generation: each eligible recipient rolls its own results from a stable stream. */
function allocateInstanced(request: AllocationRequest): AllocationOutcome {
  if (request.generate === undefined) {
    throw new Error('reward policy "instanced" requires a generate function');
  }
  const streams = seededStreams(request.generationSeed ?? request.allocationSeed);
  const isPrivate = request.private ?? true;
  const grants: RewardGrant[] = [];
  for (const recipient of orderedEligible(request)) {
    const rng = streams(`gen:${recipient.id}`);
    for (const result of request.generate(rng, recipient)) {
      const count = countOf(result);
      if (count > 0) grants.push(grant(recipient.id, result.id, count, "instanced", isPrivate));
    }
  }
  return { grants, pools: [] };
}

/** Copy-to-all: every eligible recipient receives a full copy of every result. */
function allocateCopy(request: AllocationRequest): AllocationOutcome {
  const results = requireResults(request, "copy");
  const isPrivate = request.private ?? false;
  const grants: RewardGrant[] = [];
  for (const recipient of orderedEligible(request)) {
    for (const result of results) {
      const count = countOf(result);
      if (count > 0) grants.push(grant(recipient.id, result.id, count, "copy", isPrivate));
    }
  }
  return { grants, pools: [] };
}

/**
 * Shared pool: each result's count is split across eligible recipients by `weight` using the
 * largest-remainder method, so the units always sum back to the original count with a deterministic,
 * fair remainder distribution.
 */
function allocateShared(request: AllocationRequest): AllocationOutcome {
  const results = requireResults(request, "shared");
  const recipients = orderedEligible(request);
  const isPrivate = request.private ?? false;
  const grants: RewardGrant[] = [];
  if (recipients.length === 0) return { grants, pools: [] };
  const weights = recipients.map((r) => (r.weight !== undefined && r.weight > 0 ? r.weight : 1));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  for (const result of results) {
    const total = countOf(result);
    if (total === 0) continue;
    const exact = weights.map((w) => (total * w) / totalWeight);
    const base = exact.map((x) => Math.floor(x));
    let remaining = total - base.reduce((sum, n) => sum + n, 0);
    const byRemainder = recipients
      .map((_, i) => i)
      .sort((a, b) => {
        const fa = exact[a] - base[a];
        const fb = exact[b] - base[b];
        if (fb !== fa) return fb - fa;
        return a - b; // canonical order tie-break
      });
    for (const i of byRemainder) {
      if (remaining <= 0) break;
      base[i] += 1;
      remaining -= 1;
    }
    recipients.forEach((recipient, i) => {
      if (base[i] > 0) grants.push(grant(recipient.id, result.id, base[i], "shared", isPrivate));
    });
  }
  return { grants, pools: [] };
}

/** Round-robin: results are handed out one at a time across recipients in deterministic rotation order. */
function allocateRoundRobin(request: AllocationRequest): AllocationOutcome {
  const results = requireResults(request, "roundRobin");
  const recipients = orderedEligible(request);
  const isPrivate = request.private ?? false;
  const grants: RewardGrant[] = [];
  if (recipients.length === 0) return { grants, pools: [] };
  results.forEach((result, index) => {
    const count = countOf(result);
    if (count === 0) return;
    const recipient = recipients[index % recipients.length];
    grants.push(grant(recipient.id, result.id, count, "roundRobin", isPrivate));
  });
  return { grants, pools: [] };
}

/** Caller-defined assignment: each recipient receives exactly the result ids the `assignment` map names. */
function allocateAssigned(request: AllocationRequest): AllocationOutcome {
  const results = requireResults(request, "assigned");
  if (request.assignment === undefined) {
    throw new Error('reward policy "assigned" requires an assignment map');
  }
  const byId = new Map(results.map((r) => [r.id, r]));
  const eligibleIds = new Set(orderedEligible(request).map((r) => r.id));
  const isPrivate = request.private ?? false;
  const grants: RewardGrant[] = [];
  for (const recipient of orderedEligible(request)) {
    const assigned = request.assignment[recipient.id] ?? [];
    for (const resultId of assigned) {
      const result = byId.get(resultId);
      if (result === undefined) throw new Error(`assignment references unknown result "${resultId}"`);
      if (!eligibleIds.has(recipient.id)) continue;
      const count = countOf(result);
      if (count > 0) grants.push(grant(recipient.id, result.id, count, "assigned", isPrivate));
    }
  }
  return { grants, pools: [] };
}

/**
 * Claimed: results are pooled for later claiming rather than granted now. `first` mode leaves an open
 * contested pool; `reserved` mode ties the pool to one recipient — the caller-named `reservedFor` or,
 * absent that, a deterministically seed-picked eligible recipient.
 */
function allocateClaimed(request: AllocationRequest): AllocationOutcome {
  const results = requireResults(request, "claimed");
  const spec = request.claim ?? { mode: "first" };
  const recipients = orderedEligible(request);
  const shares: RewardShare[] = [];
  for (const result of results) {
    const count = countOf(result);
    if (count > 0) shares.push({ result: result.id, count });
  }
  let reservedFor: string | null = null;
  if (spec.mode === "reserved") {
    if (spec.reservedFor !== undefined) {
      reservedFor = spec.reservedFor;
    } else if (recipients.length > 0) {
      const pick = seededStreams(request.allocationSeed)("claim:reserve")();
      reservedFor = recipients[Math.min(recipients.length - 1, Math.floor(pick * recipients.length))].id;
    }
  }
  const pool: ClaimablePool = {
    id: `pool:${hashString(`${request.allocationSeed}:claim`).toString(36)}`,
    via: "claimed",
    results: shares,
    eligible: recipients.map((r) => r.id),
    reservedFor,
    expiresAtMs: spec.expiresAtMs ?? null,
    claimedBy: null,
  };
  return { grants: [], pools: [pool] };
}

/**
 * Allocate reward results among participants under a named policy, returning immediate grants and/or
 * claimable pools. Distribution is deterministic and serializable: the same seeds, recipients, and
 * results yield an identical outcome on host and every peer regardless of join order, so allocation
 * replicates as data without re-rolling. Reward *generation* stays upstream (loot tables, roll
 * formulas); this seam only decides who is owed what.
 *
 * @capability reward-allocation distribute reward results among multiplayer participants deterministically
 */
export function allocateRewards(kind: RewardPolicyKind, request: AllocationRequest): AllocationOutcome {
  switch (kind) {
    case "instanced":
      return allocateInstanced(request);
    case "copy":
      return allocateCopy(request);
    case "shared":
      return allocateShared(request);
    case "roundRobin":
      return allocateRoundRobin(request);
    case "assigned":
      return allocateAssigned(request);
    case "claimed":
      return allocateClaimed(request);
    default: {
      const exhaustive: never = kind;
      throw new Error(`unknown reward policy: ${String(exhaustive)}`);
    }
  }
}

function poolClaimable(pool: ClaimablePool, claimantId: string, nowMs: number | undefined): boolean {
  if (!pool.eligible.includes(claimantId)) return false;
  if (pool.reservedFor !== null && pool.reservedFor !== claimantId) return false;
  if (pool.expiresAtMs !== null && nowMs !== undefined && nowMs > pool.expiresAtMs) return false;
  return true;
}

/**
 * Resolve an authoritative claim against a pool. Idempotent: re-claiming an already-owned pool returns
 * the same grants without re-awarding, a losing claimant gets no grants, and eligibility, reservation,
 * and expiry are all enforced here — the authority, not UI hiding, decides ownership. Returns the
 * updated (serializable) pool plus the grants owed.
 *
 * @capability reward-allocation resolve idempotent authoritative claims against a reward pool
 */
export function resolveClaim(
  pool: ClaimablePool,
  claimantId: string,
  options?: { nowMs?: number; private?: boolean },
): ClaimOutcome {
  const nowMs = options?.nowMs;
  const grantsFor = (owner: string): RewardGrant[] =>
    pool.results.map((share) => grant(owner, share.result, share.count, "claimed", options?.private ?? false));

  if (pool.claimedBy !== null) {
    return { pool, grants: pool.claimedBy === claimantId ? grantsFor(claimantId) : [] };
  }
  if (!poolClaimable(pool, claimantId, nowMs)) {
    return { pool, grants: [] };
  }
  const claimed: ClaimablePool = { ...pool, claimedBy: claimantId };
  return { pool: claimed, grants: grantsFor(claimantId) };
}

/**
 * Project an allocation outcome for one viewer, enforcing replication authoritatively: private grants
 * belonging to other recipients are dropped, and pools the viewer cannot claim (not eligible, or
 * reserved for someone else) are hidden — so private rewards never leak across the wire while
 * provenance on the viewer's own grants is preserved.
 *
 * @capability reward-allocation filter reward grants and pools to a viewer so private rewards never leak
 */
export function filterOutcomeFor(outcome: AllocationOutcome, viewerId: string): AllocationOutcome {
  return {
    grants: outcome.grants.filter((g) => !g.private || g.recipient === viewerId),
    pools: outcome.pools.filter(
      (p) => p.eligible.includes(viewerId) && (p.reservedFor === null || p.reservedFor === viewerId),
    ),
  };
}
