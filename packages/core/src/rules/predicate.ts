// @skill jgengine-gameplay
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
 * dot path from the facts and compare it. `has` passes when the path resolves to a non-nullish value;
 * `in` asks whether a scalar fact is one of a listed set, and `includes` whether a list fact holds a
 * named value.
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
  | { readonly includes: readonly [PredicatePath, PredicateValue] }
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

function asList(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
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
  if ("includes" in predicate) {
    const list = asList(readPath(facts, predicate.includes[0]));
    return list !== undefined && list.includes(predicate.includes[1]);
  }
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

/** One comparison in a predicate: its operator, the fact path it reads and its operand (absent for `has`). */
export interface PredicateLeaf {
  op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "includes" | "has";
  path: PredicatePath;
  operand?: PredicateValue | readonly PredicateValue[];
}

/**
 * Every comparison in a predicate tree, in order — what a loader checks an authored condition
 * against (does each path name a real fact, is each number finite) before play.
 *
 * @capability declarative-predicate serializable data-driven conditions with no callbacks in saved content
 */
export function predicateLeaves(predicate: Predicate | undefined): PredicateLeaf[] {
  const out: PredicateLeaf[] = [];
  const visit = (node: Predicate): void => {
    if ("all" in node) node.all.forEach(visit);
    else if ("any" in node) node.any.forEach(visit);
    else if ("not" in node) visit(node.not);
    else if ("has" in node) out.push({ op: "has", path: node.has });
    else if ("eq" in node) out.push({ op: "eq", path: node.eq[0], operand: node.eq[1] });
    else if ("ne" in node) out.push({ op: "ne", path: node.ne[0], operand: node.ne[1] });
    else if ("in" in node) out.push({ op: "in", path: node.in[0], operand: node.in[1] });
    else if ("includes" in node) out.push({ op: "includes", path: node.includes[0], operand: node.includes[1] });
    else if ("gt" in node) out.push({ op: "gt", path: node.gt[0], operand: node.gt[1] });
    else if ("gte" in node) out.push({ op: "gte", path: node.gte[0], operand: node.gte[1] });
    else if ("lt" in node) out.push({ op: "lt", path: node.lt[0], operand: node.lt[1] });
    else out.push({ op: "lte", path: node.lte[0], operand: node.lte[1] });
  };
  if (predicate !== undefined) visit(predicate);
  return out;
}

/**
 * The `gte` floor a predicate sets on one fact path (the largest, when several), or `null` when it sets none —
 * what a "needs 20 standing" line reads off an authored condition.
 *
 * @capability declarative-predicate serializable data-driven conditions with no callbacks in saved content
 */
export function predicateFloor(predicate: Predicate | undefined, path: PredicatePath): number | null {
  let floor: number | null = null;
  for (const leaf of predicateLeaves(predicate)) {
    if (leaf.op !== "gte" || leaf.path !== path || typeof leaf.operand !== "number") continue;
    floor = floor === null ? leaf.operand : Math.max(floor, leaf.operand);
  }
  return floor;
}
