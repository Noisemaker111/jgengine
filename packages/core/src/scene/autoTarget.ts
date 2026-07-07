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
  const candidates = deps.candidates(fromId).filter((id) => id !== fromId);
  if (candidates.length === 0) return null;

  if (policy === "random") {
    const rng = deps.rng ?? Math.random;
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
