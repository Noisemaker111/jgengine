/** A definition in a game-owned namespace, located in its authored document. */
export interface ContentEntry {
  kind: string;
  id: string;
  path: string;
}

/** A located reference; namespaces can express game-owned roles such as questgiver. */
export interface ContentReference extends ContentEntry {
  contentId: string;
  /** Optional game-declared relationship, such as the quests offered by this particular giver. */
  allowedIds?: readonly string[];
}

/** A repairable authoring issue. Paths are caller document locations, usually JSON Pointers. */
export interface ContentIssue {
  code: string;
  severity: "error" | "warning";
  path: string;
  contentId?: string;
  referenceId?: string;
  message: string;
  repair: string;
}

/**
 * Index definitions once and check references in input order, without mutating the catalog.
 * Namespace strings and roles are game-owned; identical ids in different namespaces are valid.
 * Typed input must be decoded before calling. Work is O(definitions + references + allowed ids).
 *
 * @capability content-reference-validation locate duplicate content ids and broken references across game-owned catalog namespaces with repair guidance
 */
export function validateContentReferences(
  entries: readonly ContentEntry[],
  references: readonly ContentReference[],
): ContentIssue[] {
  const namespaces = new Map<string, Map<string, string>>();
  const issues: ContentIssue[] = [];
  for (const entry of entries) {
    let ids = namespaces.get(entry.kind);
    if (ids === undefined) namespaces.set(entry.kind, ids = new Map());
    const earlier = ids.get(entry.id);
    if (earlier !== undefined) {
      issues.push({ code: "duplicate-content", severity: "error", path: entry.path,
        contentId: entry.id, referenceId: entry.id,
        message: `Duplicate ${entry.kind} "${entry.id}"; first defined at ${earlier}.`,
        repair: "Give the definitions distinct ids and update their references, or remove the duplicate." });
    } else ids.set(entry.id, entry.path);
  }
  for (const reference of references) {
    if (!namespaces.get(reference.kind)?.has(reference.id)) {
      issues.push({ code: "unknown-reference", severity: "error", path: reference.path,
        contentId: reference.contentId, referenceId: reference.id,
        message: `Content "${reference.contentId}" references unknown ${reference.kind} "${reference.id}".`,
        repair: `Correct this reference or declare "${reference.id}" in the ${reference.kind} catalog.` });
    } else if (reference.allowedIds !== undefined && !reference.allowedIds.includes(reference.id)) {
      issues.push({ code: "inconsistent-reference", severity: "error", path: reference.path,
        contentId: reference.contentId, referenceId: reference.id,
        message: `Content "${reference.contentId}" references ${reference.kind} "${reference.id}" outside its declared relationship.`,
        repair: `Use an allowed id (${reference.allowedIds.map((id) => `"${id}"`).join(", ") || "none declared"}) or correct the game-owned relationship declaration.` });
    }
  }
  return issues;
}

/** A possible source or action; all required facts must be reachable to provide its facts. */
export interface ContentProgressionRule {
  id: string;
  path: string;
  requires: readonly string[];
  provides: readonly string[];
}

/** A game-declared availability requirement, located at the content that needs it. */
export interface ContentProgressionRequirement {
  id: string;
  path: string;
  contentId: string;
}

/** Explicit possible sources; opaque fact strings may represent items, unlocks or skill milestones. */
export interface ContentProgressionInput {
  initial: readonly string[];
  rules: readonly ContentProgressionRule[];
  required?: readonly ContentProgressionRequirement[];
  /** True only when the game declares all possible sources; otherwise blocked routes are warnings. */
  closedWorld?: boolean;
}

/** Potential availability and diagnostics in deterministic input/traversal order. */
export interface ContentProgressionResult {
  reachable: string[];
  reachableRules: string[];
  issues: ContentIssue[];
}

/**
 * Check declared potential progression using a dependency queue in O(facts + rules + edges).
 * Alternatives are separate rules; every requirement within one rule is necessary.
 * Seeded cycles are valid. An unseeded cycle is blocked only under the declared sources.
 * Facts describe possible availability, not quantities, consumption, mutually exclusive choices,
 * chronology, station proximity or economic balance. Encode those constraints in game-owned rules
 * or playtests. Skill training caps must be explicitly translated into attainable milestones.
 * This is offline authoring analysis, not a quest engine or a per-frame catalog scan.
 *
 * @capability content-progression-validation diagnose unavailable sources and blocked cross-content progression under explicit game-owned rules without rejecting intentional seeded cycles
 */
export function validateContentProgression(input: ContentProgressionInput): ContentProgressionResult {
  const issues: ContentIssue[] = [];
  const ids = new Set<string>();
  const available = new Set(input.initial);
  const dependents = new Map<string, number[]>();
  const remaining: number[] = [];
  const ready: number[] = [];
  const reached = new Set<number>();
  for (let index = 0; index < input.rules.length; index++) {
    const rule = input.rules[index]!;
    if (ids.has(rule.id)) {
      issues.push({ code: "duplicate-rule", severity: "error", path: rule.path,
        contentId: rule.id, referenceId: rule.id, message: `Progression rule "${rule.id}" repeats.`,
        repair: "Give each source/action a distinct rule id, or remove the duplicate." });
    }
    ids.add(rule.id);
    let count = 0;
    for (const fact of new Set(rule.requires)) {
      if (available.has(fact)) continue;
      count++;
      let waiting = dependents.get(fact);
      if (waiting === undefined) dependents.set(fact, waiting = []);
      waiting.push(index);
    }
    remaining.push(count);
    if (count === 0) ready.push(index);
  }
  const reachableRules: string[] = [];
  for (let head = 0; head < ready.length; head++) {
    const index = ready[head]!;
    reached.add(index);
    const rule = input.rules[index]!;
    reachableRules.push(rule.id);
    for (const fact of rule.provides) {
      if (available.has(fact)) continue;
      available.add(fact);
      for (const dependent of dependents.get(fact) ?? []) {
        remaining[dependent]!--;
        if (remaining[dependent] === 0) ready.push(dependent);
      }
    }
  }
  const severity = input.closedWorld === true ? "error" : "warning";
  for (let index = 0; index < input.rules.length; index++) {
    if (reached.has(index)) continue;
    const rule = input.rules[index]!;
    const missing = [...new Set(rule.requires)].filter((fact) => !available.has(fact));
    issues.push({ code: "blocked-rule", severity, path: rule.path, contentId: rule.id,
      message: `Content rule "${rule.id}" is blocked by ${missing.map((fact) => `"${fact}"`).join(", ")}.`,
      repair: "Correct the prerequisites or add a reachable source. Declare legitimate external sources as initial facts; review intentional unavailable content." });
  }
  for (const requirement of input.required ?? []) {
    if (available.has(requirement.id)) continue;
    issues.push({ code: "unreachable-content", severity, path: requirement.path,
      contentId: requirement.contentId, referenceId: requirement.id,
      message: `Content "${requirement.contentId}" needs unavailable fact "${requirement.id}".`,
      repair: "Correct this requirement or connect a source to the declared entry facts. If sources are incomplete, use open-world warnings until the game declares them." });
  }
  return { reachable: [...available], reachableRules, issues };
}
