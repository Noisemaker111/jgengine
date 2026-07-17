import type { InstalledPart, PartDef } from "./modularItem";

/**
 * The declarative identity of a built modular item: a caller-named family, its
 * provenance tags, and the parts occupying its slots. This is the "what an item
 * is" layer above the raw stat rollup in ./modularItem — a plain, serializable
 * value with no game noun baked in ("gun", "manufacturer", "potion" are all
 * caller data in `family`/`tags`).
 */
export interface ItemIdentity {
  family: string;
  tags: readonly string[];
  parts: readonly InstalledPart[];
}

/**
 * A predicate over an {@link ItemIdentity}, expressed as data so a whole rule
 * set round-trips through JSON. An empty query matches every identity; each
 * present field narrows the match and all present fields must hold (AND).
 */
export interface IdentityQuery {
  /** Match only this family id; omit to match any family. */
  family?: string;
  /** Every listed tag must be present on the identity. */
  allTags?: readonly string[];
  /** At least one listed tag must be present on the identity. */
  anyTags?: readonly string[];
  /** A part of this category must occupy some slot. */
  hasCategory?: string;
  /** A part with this id must occupy some slot. */
  hasPart?: string;
}

/**
 * A rule that requires a second condition to hold whenever the first matches —
 * e.g. "a scoped rifle requires a stock". Checked at completeness time, not
 * during incremental placement, because the `then` side may be satisfied by a
 * part chosen later in a generation pass.
 */
export interface RequireRule {
  id: string;
  kind: "require";
  when: IdentityQuery;
  then: IdentityQuery;
  message?: string;
}

/**
 * A rule that forbids a combination — e.g. "an incendiary barrel cannot pair
 * with a cryo core". A forbid rule can never become satisfiable by adding more
 * parts, so it is the check a backtracking generator runs on each candidate.
 */
export interface ForbidRule {
  id: string;
  kind: "forbid";
  when: IdentityQuery;
  forbid: IdentityQuery;
  message?: string;
}

/**
 * A cross-slot compatibility rule constraining which part/tag/family
 * combinations a modular item may hold.
 */
export type CompatibilityRule = RequireRule | ForbidRule;

/**
 * A match/set bonus: extra stats granted when enough parts (or a tag) of a
 * given kind are present — e.g. "3 Blackwood parts grant +recoil control".
 * Counting is declarative (`countBy`/`value`) so the whole catalog is data.
 */
export interface SetBonus {
  id: string;
  /** Dimension counted for membership: a part category, a part id, or an identity tag. */
  countBy: "category" | "partId" | "tag";
  /** The value counted; membership is the number of matching parts (or 0/1 for a tag). */
  value: string;
  /** Minimum matching count for the bonus to activate. */
  min: number;
  /** Additive stat deltas applied when the bonus is active. */
  stats: Record<string, number>;
  /** Optional name fragment recorded in provenance/UI when active. */
  namePart?: string;
}

/**
 * One failed {@link CompatibilityRule}, carrying the rule id, its kind, and a
 * human-readable message for UI or generator diagnostics.
 */
export interface ConstraintViolation {
  ruleId: string;
  kind: "require" | "forbid";
  message: string;
}

/**
 * A part proposed for a slot during generation, before it is committed to an
 * identity. Used by the backtracking contract to test a placement in isolation.
 */
export interface CandidatePlacement {
  slotId: string;
  part: PartDef;
}

/**
 * The serializable record of how an item was generated: its family, tags,
 * per-slot part selection, applied set-bonus ids, and the deterministic seed.
 * Enough for UI provenance display and byte-exact regeneration.
 */
export interface ItemProvenance {
  family: string;
  tags: readonly string[];
  /** slotId -> partId of the selected parts. */
  parts: Readonly<Record<string, string>>;
  /** Ids of the set bonuses that were active, for display and re-derivation. */
  bonuses: readonly string[];
  /** Seed of the roll that produced this item; omit for hand-authored items. */
  seed?: number;
}

/**
 * Assemble an {@link ItemIdentity} from a family, tags, and installed parts.
 *
 * @capability item-identity assemble a serializable modular-item identity from family, tags, and installed parts
 */
export function identityOf(
  family: string,
  tags: readonly string[],
  parts: readonly InstalledPart[],
): ItemIdentity {
  return { family, tags, parts };
}

function hasCategory(identity: ItemIdentity, category: string): boolean {
  return identity.parts.some((installed) => installed.part.category === category);
}

function hasPart(identity: ItemIdentity, partId: string): boolean {
  return identity.parts.some((installed) => installed.part.id === partId);
}

/**
 * Test whether an identity satisfies a declarative {@link IdentityQuery}.
 *
 * @capability item-identity evaluate a data-defined compatibility query against a modular-item identity
 */
export function matchesQuery(identity: ItemIdentity, query: IdentityQuery): boolean {
  if (query.family !== undefined && query.family !== identity.family) return false;
  if (query.allTags !== undefined && !query.allTags.every((tag) => identity.tags.includes(tag))) return false;
  if (query.anyTags !== undefined && !query.anyTags.some((tag) => identity.tags.includes(tag))) return false;
  if (query.hasCategory !== undefined && !hasCategory(identity, query.hasCategory)) return false;
  if (query.hasPart !== undefined && !hasPart(identity, query.hasPart)) return false;
  return true;
}

function ruleFails(identity: ItemIdentity, rule: CompatibilityRule): boolean {
  if (!matchesQuery(identity, rule.when)) return false;
  return rule.kind === "require" ? !matchesQuery(identity, rule.then) : matchesQuery(identity, rule.forbid);
}

function defaultMessage(rule: CompatibilityRule): string {
  return rule.message ?? (rule.kind === "require" ? `${rule.id}: required combination missing` : `${rule.id}: forbidden combination`);
}

/**
 * Collect every compatibility rule a completed identity violates. An empty
 * result means the identity is legal.
 *
 * @capability item-identity validate a completed modular item against its compatibility rule set
 */
export function validateIdentity(
  identity: ItemIdentity,
  rules: readonly CompatibilityRule[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const rule of rules) {
    if (ruleFails(identity, rule)) violations.push({ ruleId: rule.id, kind: rule.kind, message: defaultMessage(rule) });
  }
  return violations;
}

/**
 * Convenience predicate: true when {@link validateIdentity} finds no violations.
 *
 * @capability item-identity check whether a completed modular item is compatibility-valid
 */
export function isIdentityValid(identity: ItemIdentity, rules: readonly CompatibilityRule[]): boolean {
  return validateIdentity(identity, rules).length === 0;
}

/**
 * The generic backtracking contract for procedural generation (see #908): given
 * a partial identity and a candidate part, return the first forbid rule the
 * placement would violate, or null if it stays viable. Require rules are ignored
 * here because they may still be satisfied by a later placement.
 *
 * @capability item-identity test a candidate part placement against forbid rules for generation backtracking
 */
export function candidateViolatesForbid(
  partial: ItemIdentity,
  candidate: CandidatePlacement,
  rules: readonly CompatibilityRule[],
): ForbidRule | null {
  const projected: ItemIdentity = {
    family: partial.family,
    tags: partial.tags,
    parts: [...partial.parts, { slotId: candidate.slotId, part: candidate.part }],
  };
  for (const rule of rules) {
    if (rule.kind === "forbid" && ruleFails(projected, rule)) return rule;
  }
  return null;
}

/**
 * Count how many parts (or tags) contribute to a set bonus on an identity.
 *
 * @capability item-identity count set-bonus membership across an item's parts and tags
 */
export function countSetMembers(identity: ItemIdentity, bonus: SetBonus): number {
  switch (bonus.countBy) {
    case "category":
      return identity.parts.filter((installed) => installed.part.category === bonus.value).length;
    case "partId":
      return identity.parts.filter((installed) => installed.part.id === bonus.value).length;
    case "tag":
      return identity.tags.includes(bonus.value) ? 1 : 0;
  }
}

/**
 * Select the set bonuses whose membership count meets their threshold, in the
 * order they were declared.
 *
 * @capability item-identity resolve which match/set bonuses an item qualifies for
 */
export function activeSetBonuses(identity: ItemIdentity, bonuses: readonly SetBonus[]): SetBonus[] {
  return bonuses.filter((bonus) => countSetMembers(identity, bonus) >= bonus.min);
}

/**
 * Fold a set of active bonuses' additive stats onto a stat map, returning a new
 * map (the input is not mutated).
 *
 * @capability item-identity apply active set-bonus stats onto an item's resolved stats
 */
export function applySetBonuses(
  stats: Record<string, number>,
  bonuses: readonly SetBonus[],
): Record<string, number> {
  const out: Record<string, number> = { ...stats };
  for (const bonus of bonuses) {
    for (const [key, delta] of Object.entries(bonus.stats)) out[key] = (out[key] ?? 0) + delta;
  }
  return out;
}

/**
 * Capture the provenance of a generated item — family, tags, per-slot parts,
 * active bonus ids, and optional seed — as a JSON-safe record.
 *
 * @capability item-identity capture serializable provenance for UI display and deterministic regeneration
 */
export function captureProvenance(
  identity: ItemIdentity,
  activeBonuses: readonly SetBonus[],
  seed?: number,
): ItemProvenance {
  const parts: Record<string, string> = {};
  for (const installed of identity.parts) parts[installed.slotId] = installed.part.id;
  return {
    family: identity.family,
    tags: [...identity.tags],
    parts,
    bonuses: activeBonuses.map((bonus) => bonus.id),
    ...(seed === undefined ? {} : { seed }),
  };
}
