/**
 * Overlap aggregation for {@link AreaMembership} lists: when several area sources cover the same
 * receiver, a policy decides which memberships actually apply. Genre-agnostic and pure — policies
 * are `(memberships) => memberships` reducers over one receiver's memberships, so the caller stays
 * in control of magnitude and meaning. Pair with `createAreaEffectField().membershipsOf(receiverId)`.
 */

import type { AreaMembership } from "./areaEffectField";

export type AreaStackPolicy<P> = (memberships: readonly AreaMembership<P>[]) => AreaMembership<P>[];

export type MagnitudeOf<P> = (membership: AreaMembership<P>) => number;

function byMagnitudeDesc<P>(magnitudeOf: MagnitudeOf<P>): (a: AreaMembership<P>, b: AreaMembership<P>) => number {
  return (a, b) => {
    const diff = magnitudeOf(b) - magnitudeOf(a);
    if (diff !== 0) return diff;
    return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0;
  };
}

function groupByStackKey<P>(memberships: readonly AreaMembership<P>[]): Map<string, AreaMembership<P>[]> {
  const groups = new Map<string, AreaMembership<P>[]>();
  for (const membership of memberships) {
    const list = groups.get(membership.stackKey);
    if (list === undefined) groups.set(membership.stackKey, [membership]);
    else list.push(membership);
  }
  return groups;
}

/** @capability area-stack-independent apply every overlapping area membership independently */
export function independentStacks<P>(): AreaStackPolicy<P> {
  return (memberships) => [...memberships];
}

/**
 * Keep at most one membership per `stackKey`. With `magnitudeOf` the strongest per key wins (ties
 * broken by `sourceId` for determinism); without it the first-seen per key wins. Use for
 * unique-by-key buffs where reapplying the same aura should not stack.
 *
 * @capability area-stack-unique keep one area membership per stack key, strongest wins
 */
export function uniqueByStackKey<P>(magnitudeOf?: MagnitudeOf<P>): AreaStackPolicy<P> {
  return (memberships) => {
    const out: AreaMembership<P>[] = [];
    for (const group of groupByStackKey(memberships).values()) {
      if (magnitudeOf === undefined) {
        out.push(group[0]!);
      } else {
        out.push([...group].sort(byMagnitudeDesc(magnitudeOf))[0]!);
      }
    }
    return out;
  };
}

/** @capability area-stack-capped cap area memberships per stack key at a maximum count */
export function cappedStacks<P>(limit: number, magnitudeOf?: MagnitudeOf<P>): AreaStackPolicy<P> {
  const cap = Math.max(0, Math.floor(limit));
  return (memberships) => {
    const out: AreaMembership<P>[] = [];
    for (const group of groupByStackKey(memberships).values()) {
      const ordered = magnitudeOf === undefined ? group : [...group].sort(byMagnitudeDesc(magnitudeOf));
      for (const membership of ordered.slice(0, cap)) out.push(membership);
    }
    return out;
  };
}

/** @capability area-stack-extremum keep only the strongest or weakest overlapping area membership */
export function extremumStack<P>(magnitudeOf: MagnitudeOf<P>, weakest = false): AreaStackPolicy<P> {
  return (memberships) => {
    if (memberships.length === 0) return [];
    const ordered = [...memberships].sort(byMagnitudeDesc(magnitudeOf));
    return [weakest ? ordered[ordered.length - 1]! : ordered[0]!];
  };
}

/**
 * Sum a numeric magnitude across memberships — additive aggregation for a total field strength
 * (total damage per tick, total slow). A terminal reducer, not a filter, so it returns the number.
 *
 * @capability area-stack-additive sum a magnitude across overlapping area memberships
 */
export function sumMagnitude<P>(memberships: readonly AreaMembership<P>[], magnitudeOf: MagnitudeOf<P>): number {
  let total = 0;
  for (const membership of memberships) total += magnitudeOf(membership);
  return total;
}
