import type { QuestDef, QuestObjective, QuestRewards } from "./quest";

/** Readonly authoring input; mutable QuestDef catalogs also satisfy this shape. */
export type QuestCatalogDefinition = Omit<Readonly<QuestDef>, "requires" | "objectives" | "rewards"> & {
  requires?: readonly string[];
  objectives: readonly Readonly<QuestObjective>[];
  rewards?: Omit<Readonly<QuestRewards>, "items" | "unlocks" | "quests"> & {
    items?: readonly Readonly<NonNullable<QuestRewards["items"]>[number]>[];
    unlocks?: readonly string[];
    quests?: readonly string[];
  };
};

/** Caller-owned reference namespaces; objective kinds remain unconstrained. */
export type QuestCatalogReferenceKind = "item" | "target" | "inventory" | "currency";

/** A located structural issue; path is a JSON Pointer into the supplied catalog. */
export interface QuestCatalogIssue {
  code: "duplicate-quest" | "duplicate-objective" | "missing-requirement" | "missing-follow-up"
    | "missing-external-start" | "unknown-reference" | "invalid-count" | "invalid-amount"
    | "invalid-radius" | "blocked-prerequisites" | "dependency-cycle";
  severity: "error" | "warning";
  message: string;
  path: string;
  questId?: string;
  objectiveId?: string;
  referenceId?: string;
  relatedQuestIds?: string[];
  requirementIds?: string[];
}

/** Declarations and optional lookups for a game's own authoring rules. */
export interface QuestCatalogValidationOptions {
  /** Unlock ids that non-quest systems may grant, including ids shared with quests. */
  externalUnlocks?: Iterable<string>;
  /** Quests game systems may grant active, bypassing their acceptance prerequisites. */
  externallyStartedQuests?: Iterable<string>;
  /** Check present references against caller catalogs; omitted means unchecked. */
  hasReference?(kind: QuestCatalogReferenceKind, id: string, context: {
    quest: QuestCatalogDefinition;
    objective?: Readonly<QuestObjective>;
  }): boolean;
}

interface CatalogEntry {
  quest: QuestCatalogDefinition;
  path: string;
}

function pointerKey(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

/**
 * Validate catalog ids, references, quantities, and potential prerequisite progression without mutation.
 * Requirements are completed quest ids OR unlock ids; all requirements of a quest must be met.
 * Any eligible quest may be accepted directly. External unlocks and granted quest starts are possible
 * entry points, not claims about their timing. Blocked progression/cycles are warnings: game systems
 * can bypass prerequisites. Topology uses the last duplicate, matching journal registration.
 * Traversal is iterative and linear in definitions, requirements, and their producer edges.
 * Objective and item counts may be fractional or zero; negative/nonfinite counts are invalid.
 * This assumes objectives can be completed and does not evaluate narrative, chronology, or balance.
 *
 * @capability quest-catalog-validation diagnose authored quest ids, prerequisite and reward references, quantities, and blocked dependencies with caller-declared external unlocks
 */
export function validateQuestCatalog(
  catalog: readonly QuestCatalogDefinition[] | Readonly<Record<string, QuestCatalogDefinition>>,
  options: QuestCatalogValidationOptions = {},
): QuestCatalogIssue[] {
  const entries: CatalogEntry[] = Array.isArray(catalog)
    ? catalog.map((quest, index) => ({ quest, path: `/${index}` }))
    : Object.entries(catalog).map(([key, quest]) => ({ quest, path: `/${pointerKey(key)}` }));
  const issues: QuestCatalogIssue[] = [];
  const quests = new Map<string, CatalogEntry>();
  const producers = new Map<string, Set<string>>();
  const externalUnlocks = new Set(options.externalUnlocks);
  const externalStarts = new Set(options.externallyStartedQuests);

  for (const entry of entries) {
    const { quest, path } = entry;
    if (quests.has(quest.id)) {
      issues.push({ code: "duplicate-quest", severity: "error", questId: quest.id, path: `${path}/id`,
        message: `Duplicate quest "${quest.id}"; journal registration replaces the earlier definition.` });
    }
    quests.set(quest.id, entry);
  }
  for (const { quest } of quests.values()) {
    for (const token of new Set([quest.id, ...(quest.rewards?.unlocks ?? [])])) {
      let sources = producers.get(token);
      if (sources === undefined) producers.set(token, sources = new Set());
      sources.add(quest.id);
    }
  }

  for (const { quest, path } of entries) {
    function issue(code: QuestCatalogIssue["code"], field: string, message: string,
      detail: Partial<QuestCatalogIssue> = {}): void {
      issues.push({ code, severity: "error", path: `${path}/${field}`, questId: quest.id, message, ...detail });
    }
    function reference(kind: QuestCatalogReferenceKind, id: string | undefined, field: string,
      objective?: Readonly<QuestObjective>): void {
      if (id !== undefined && options.hasReference?.(kind, id, { quest, objective }) === false) {
        issue("unknown-reference", field, `Unknown ${kind} reference "${id}".`,
          { referenceId: id, objectiveId: objective?.id });
      }
    }
    for (const [index, id] of (quest.requires ?? []).entries()) {
      if (!producers.has(id) && !externalUnlocks.has(id)) {
        issue("missing-requirement", `requires/${index}`,
          `Requirement "${id}" is neither a catalog quest nor a declared unlock.`, { referenceId: id });
      }
    }
    const objectiveIds = new Set<string>();
    for (const [index, objective] of quest.objectives.entries()) {
      const field = `objectives/${index}`;
      if (objectiveIds.has(objective.id)) {
        issue("duplicate-objective", `${field}/id`, `Duplicate objective "${objective.id}" in quest "${quest.id}".`,
          { objectiveId: objective.id });
      }
      objectiveIds.add(objective.id);
      if (!Number.isFinite(objective.count) || objective.count < 0) {
        issue("invalid-count", `${field}/count`, "Objective count must be finite and nonnegative.",
          { objectiveId: objective.id });
      }
      if (objective.partyShare && (!Number.isFinite(objective.partyShare.radius) || objective.partyShare.radius < 0)) {
        issue("invalid-radius", `${field}/partyShare/radius`, "Party share radius must be finite and nonnegative.",
          { objectiveId: objective.id });
      }
      reference("item", objective.item, `${field}/item`, objective);
      reference("target", objective.target, `${field}/target`, objective);
    }
    for (const [index, id] of (quest.rewards?.quests ?? []).entries()) {
      if (!quests.has(id)) {
        issue("missing-follow-up", `rewards/quests/${index}`, `Reward starts unknown quest "${id}".`, { referenceId: id });
      }
    }
    for (const [index, reward] of (quest.rewards?.items ?? []).entries()) {
      const field = `rewards/items/${index}`;
      if (!Number.isFinite(reward.count) || reward.count < 0) {
        issue("invalid-count", `${field}/count`, "Item reward count must be finite and nonnegative.");
      }
      reference("item", reward.item, `${field}/item`);
      reference("inventory", reward.inventory, `${field}/inventory`);
    }
    if (quest.rewards?.xp && !Number.isFinite(quest.rewards.xp.amount)) {
      issue("invalid-amount", "rewards/xp/amount", "XP reward amount must be finite.");
    }
    for (const [id, amount] of Object.entries(quest.rewards?.economy ?? {})) {
      const field = `rewards/economy/${pointerKey(id)}`;
      if (!Number.isFinite(amount)) issue("invalid-amount", field, "Currency reward amount must be finite.");
      reference("currency", id, field);
    }
  }
  for (const id of externalStarts) {
    if (!quests.has(id)) issues.push({ code: "missing-external-start", severity: "error", path: "",
      referenceId: id, message: `Externally started quest "${id}" does not exist in the catalog.` });
  }

  const available = new Set(externalUnlocks);
  const pending = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  const ready: string[] = [];
  for (const { quest } of quests.values()) {
    let count = 0;
    for (const token of new Set(quest.requires ?? [])) {
      if (available.has(token)) continue;
      count++;
      let waiting = dependents.get(token);
      if (waiting === undefined) dependents.set(token, waiting = []);
      waiting.push(quest.id);
    }
    pending.set(quest.id, count);
    if (count === 0 || externalStarts.has(quest.id)) ready.push(quest.id);
  }
  const completed = new Set<string>();
  for (let head = 0; head < ready.length; head++) {
    const id = ready[head]!;
    if (completed.has(id)) continue;
    completed.add(id);
    const quest = quests.get(id)!.quest;
    for (const token of [id, ...(quest.rewards?.unlocks ?? [])]) {
      if (available.has(token)) continue;
      available.add(token);
      for (const next of dependents.get(token) ?? []) {
        const remaining = pending.get(next)! - 1;
        pending.set(next, remaining);
        if (remaining === 0) ready.push(next);
      }
    }
  }

  const graph = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  for (const { quest, path } of quests.values()) {
    if (completed.has(quest.id)) continue;
    const unmet = [...new Set(quest.requires ?? [])].filter((id) => !available.has(id));
    issues.push({ code: "blocked-prerequisites", severity: "warning", questId: quest.id,
      path: `${path}/requires`, requirementIds: unmet,
      message: `Quest "${quest.id}" has no prerequisite route from declared entry points; external grants may bypass it.` });
    const dependencies = new Set<string>();
    for (const token of unmet) {
      for (const producer of producers.get(token) ?? []) {
        if (!completed.has(producer)) dependencies.add(producer);
      }
    }
    graph.set(quest.id, [...dependencies]);
    for (const id of dependencies) {
      let incoming = reverse.get(id);
      if (incoming === undefined) reverse.set(id, incoming = []);
      incoming.push(quest.id);
    }
  }

  const visited = new Set<string>();
  const order: string[] = [];
  for (const root of graph.keys()) {
    if (visited.has(root)) continue;
    visited.add(root);
    const stack = [{ id: root, index: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const neighbors = graph.get(frame.id)!;
      if (frame.index === neighbors.length) {
        order.push(frame.id);
        stack.pop();
        continue;
      }
      const next = neighbors[frame.index++]!;
      if (visited.has(next)) continue;
      visited.add(next);
      stack.push({ id: next, index: 0 });
    }
  }
  visited.clear();
  for (let index = order.length - 1; index >= 0; index--) {
    const root = order[index]!;
    if (visited.has(root)) continue;
    const component = [root];
    visited.add(root);
    for (let head = 0; head < component.length; head++) {
      for (const next of reverse.get(component[head]!) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        component.push(next);
      }
    }
    if (component.length > 1 || graph.get(root)!.includes(root)) {
      issues.push({ code: "dependency-cycle", severity: "warning", questId: root,
        path: `${quests.get(root)!.path}/requires`, relatedQuestIds: component,
        message: "Blocked prerequisite producers form a cycle; review external grants or dependency references." });
    }
  }
  return issues;
}
