export type TargetRelation = "hostile" | "friendly";

export type TargetFilter = TargetRelation | "any";

export interface TargetingOptions {
  candidates: () => string[];
  classify?: (fromId: string, toId: string) => TargetRelation;
  orderBy?: (a: string, b: string) => number;
  distance?: (fromId: string, toId: string) => number | null;
}

export interface CycleTargetOptions {
  filter?: TargetFilter;
  direction?: "next" | "prev";
  maxDistance?: number;
}

export interface Targeting {
  setTarget(fromId: string, toId: string | null): void;
  getTarget(fromId: string): string | null;
  cycleTarget(fromId: string, options?: CycleTargetOptions): string | null;
  clearAll(instanceId: string): void;
}

export function createTargeting(options: TargetingOptions): Targeting {
  const targets = new Map<string, string>();

  function eligibleCandidates(fromId: string, filter: TargetFilter, maxDistance?: number): string[] {
    const candidates = options.candidates().filter((id) => id !== fromId);
    const filtered =
      filter === "any" || options.classify === undefined
        ? candidates
        : candidates.filter((id) => options.classify!(fromId, id) === filter);
    const inRange =
      maxDistance === undefined || options.distance === undefined
        ? filtered
        : filtered.filter((id) => {
            const distance = options.distance!(fromId, id);
            return distance !== null && distance <= maxDistance;
          });
    if (options.orderBy === undefined) return inRange;
    return inRange.slice().sort(options.orderBy);
  }

  return {
    setTarget(fromId, toId) {
      if (toId === null) targets.delete(fromId);
      else targets.set(fromId, toId);
    },
    getTarget(fromId) {
      return targets.get(fromId) ?? null;
    },
    cycleTarget(fromId, cycleOptions = {}) {
      const candidates = eligibleCandidates(fromId, cycleOptions.filter ?? "any", cycleOptions.maxDistance);
      if (candidates.length === 0) {
        targets.delete(fromId);
        return null;
      }
      const direction = cycleOptions.direction ?? "next";
      const currentIndex = candidates.indexOf(targets.get(fromId) ?? "");
      let nextIndex: number;
      if (currentIndex === -1) {
        nextIndex = direction === "next" ? 0 : candidates.length - 1;
      } else {
        const step = direction === "next" ? 1 : -1;
        nextIndex = (currentIndex + step + candidates.length) % candidates.length;
      }
      const target = candidates[nextIndex]!;
      targets.set(fromId, target);
      return target;
    },
    clearAll(instanceId) {
      targets.delete(instanceId);
      for (const [fromId, toId] of targets) {
        if (toId === instanceId) targets.delete(fromId);
      }
    },
  };
}
