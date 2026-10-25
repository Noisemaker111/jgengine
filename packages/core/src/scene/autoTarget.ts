import { resolveRng } from "../random/resolveRng";
export type AutoTargetPolicy =
  | "nearest"
  | "farthest"
  | "random"
  | "strongest"
  | "weakest"
  | "first"
  | "last";

export interface AutoTargetDeps {
  candidates: (fromId: string) => readonly string[];
  distance: (fromId: string, toId: string) => number | null;
  strength?: (toId: string) => number;
  progress?: (toId: string) => number;
  rng?: () => number;
  /** Candidates this picker may not choose (a cannon that cannot hit flyers); omitted means all. */
  eligible?: (toId: string) => boolean;
}

/** Every policy, in the order a "cycle targeting" button steps through them. */
export const AUTO_TARGET_POLICIES: readonly AutoTargetPolicy[] = ["first", "last", "strongest", "weakest", "nearest", "farthest", "random"];

/**
 * The policy after `current` in `allowed` (default {@link AUTO_TARGET_POLICIES}), wrapping at the end;
 * a policy outside `allowed` steps to its first entry.
 *
 * @capability auto-target-cycle step a player-chosen targeting priority to the next allowed policy
 */
export function nextAutoTargetPolicy(
  current: AutoTargetPolicy,
  allowed: readonly AutoTargetPolicy[] = AUTO_TARGET_POLICIES,
): AutoTargetPolicy {
  if (allowed.length === 0) return current;
  const index = allowed.indexOf(current);
  return allowed[(index + 1) % allowed.length]!;
}

function metric(policy: AutoTargetPolicy, fromId: string, toId: string, deps: AutoTargetDeps): number | null {
  switch (policy) {
    case "nearest":
    case "farthest":
      return deps.distance(fromId, toId);
    case "strongest":
    case "weakest":
      return deps.strength?.(toId) ?? 0;
    case "first":
    case "last":
      return deps.progress?.(toId) ?? 0;
    case "random":
      return 0;
  }
}

function prefersHigher(policy: AutoTargetPolicy): boolean {
  return policy === "farthest" || policy === "strongest" || policy === "first";
}

export function selectAutoTarget(
  policy: AutoTargetPolicy,
  fromId: string,
  deps: AutoTargetDeps,
): string | null {
  const eligible = deps.eligible;
  const candidates = deps.candidates(fromId).filter((id) => id !== fromId && (eligible === undefined || eligible(id)));
  if (candidates.length === 0) return null;

  if (policy === "random") {
    const rng = resolveRng(deps.rng, "autoTarget");
    return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]!;
  }

  const higher = prefersHigher(policy);
  let best: string | null = null;
  let bestScore = higher ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const id of candidates) {
    const score = metric(policy, fromId, id, deps);
    if (score === null) continue;
    if (best === null || (higher ? score > bestScore : score < bestScore)) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

export interface AutoTargeter {
  policy(): AutoTargetPolicy;
  setPolicy(policy: AutoTargetPolicy): void;
  pick(fromId: string): string | null;
}

export function createAutoTargeter(policy: AutoTargetPolicy, deps: AutoTargetDeps): AutoTargeter {
  let current = policy;
  return {
    policy() {
      return current;
    },
    setPolicy(next) {
      current = next;
    },
    pick(fromId) {
      return selectAutoTarget(current, fromId, deps);
    },
  };
}
