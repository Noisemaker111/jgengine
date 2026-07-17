/**
 * A declarative, serializable predicate AST evaluated against a plain fact bag. Predicates carry no
 * closures, so they survive save/load and stay deterministic — the reusable condition seam that
 * event-conditioned rules, quests, perks, and reactive AI gate on instead of hand-rolled callbacks.
 */

/** A leaf value a predicate can compare against — JSON-safe so predicates serialize cleanly. */
export type PredicateValue = string | number | boolean | null;

/** Dot path into a fact bag, e.g. `"hit.crit"` or `"attacker.team"`. */
export type PredicatePath = string;

/**
 * One node of the predicate tree. Combinators (`all`/`any`/`not`) nest; leaf comparators read a
 * dot path from the facts and compare it. `has` passes when the path resolves to a non-nullish value.
 */
export type Predicate =
  | { readonly all: readonly Predicate[] }
  | { readonly any: readonly Predicate[] }
  | { readonly not: Predicate }
  | { readonly eq: readonly [PredicatePath, PredicateValue] }
  | { readonly ne: readonly [PredicatePath, PredicateValue] }
  | { readonly gt: readonly [PredicatePath, number] }
  | { readonly gte: readonly [PredicatePath, number] }
  | { readonly lt: readonly [PredicatePath, number] }
  | { readonly lte: readonly [PredicatePath, number] }
  | { readonly in: readonly [PredicatePath, readonly PredicateValue[]] }
  | { readonly has: PredicatePath };

/** Plain, serializable bag of facts a predicate reads by dot path. */
export type PredicateFacts = Record<string, unknown>;

/**
 * Read a dot path out of a fact bag, descending only through plain objects. Returns `undefined` when
 * any segment is missing or non-traversable. Bounded by the path's segment count.
 *
 * @capability declarative-predicate serializable data-driven conditions with no callbacks in saved content
 */
export function readPath(facts: PredicateFacts, path: PredicatePath): unknown {
  let current: unknown = facts;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Evaluate a predicate against a fact bag. An omitted predicate matches unconditionally, so callers
 * can treat "no condition" and "always" identically. Pure and deterministic — no allocation beyond
 * path splits and no reliance on evaluation order between sibling clauses.
 *
 * @capability declarative-predicate serializable data-driven conditions with no callbacks in saved content
 */
export function evaluatePredicate(predicate: Predicate | undefined, facts: PredicateFacts): boolean {
  if (predicate === undefined) return true;
  if ("all" in predicate) return predicate.all.every((child) => evaluatePredicate(child, facts));
  if ("any" in predicate) return predicate.any.some((child) => evaluatePredicate(child, facts));
  if ("not" in predicate) return !evaluatePredicate(predicate.not, facts);
  if ("has" in predicate) {
    const value = readPath(facts, predicate.has);
    return value !== undefined && value !== null;
  }
  if ("eq" in predicate) return readPath(facts, predicate.eq[0]) === predicate.eq[1];
  if ("ne" in predicate) return readPath(facts, predicate.ne[0]) !== predicate.ne[1];
  if ("in" in predicate) return predicate.in[1].includes(readPath(facts, predicate.in[0]) as PredicateValue);
  if ("gt" in predicate) {
    const value = asNumber(readPath(facts, predicate.gt[0]));
    return value !== undefined && value > predicate.gt[1];
  }
  if ("gte" in predicate) {
    const value = asNumber(readPath(facts, predicate.gte[0]));
    return value !== undefined && value >= predicate.gte[1];
  }
  if ("lt" in predicate) {
    const value = asNumber(readPath(facts, predicate.lt[0]));
    return value !== undefined && value < predicate.lt[1];
  }
  const value = asNumber(readPath(facts, predicate.lte[0]));
  return value !== undefined && value <= predicate.lte[1];
}
