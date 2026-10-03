import type { QuestDef } from "@jgengine/core/game/quest";
import {
  validateQuestCatalog,
  type QuestCatalogReferenceKind,
  type QuestCatalogValidationOptions,
} from "@jgengine/core/game/questCatalog";

export interface QuestAuthoringFacts {
  revision: string;
  statements: Readonly<Record<string, readonly string[]>>;
  catalogs: Readonly<Record<QuestCatalogReferenceKind, readonly string[]>>;
  externalUnlocks: readonly string[];
  externallyStartedQuests: readonly string[];
}

export interface QuestBatchLimits {
  maxNewQuests: number;
  maxTotalQuests: number;
  maxObjectivesPerQuest: number;
  maxReferencesPerQuest: number;
}

function authoringSnapshot<T>(value: T): T {
  const detached = structuredClone(value);
  function freeze(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  freeze(detached);
  return detached;
}

export async function authorQuestBatch(
  canonicalFacts: QuestAuthoringFacts,
  establishedQuests: readonly QuestDef[],
  limits: QuestBatchLimits,
  generate: (request: {
    canonicalFacts: QuestAuthoringFacts;
    establishedQuests: readonly QuestDef[];
    limits: QuestBatchLimits;
  }) => Promise<readonly QuestDef[]>,
) {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid authoring limit: ${name}`);
  }
  if (establishedQuests.length > limits.maxTotalQuests) throw new Error("Established catalog exceeds maxTotalQuests");
  const request = authoringSnapshot({ canonicalFacts, establishedQuests, limits });
  const reviewedFacts = request.canonicalFacts;
  const reviewedQuests = request.establishedQuests;
  const reviewedLimits = request.limits;
  const generated = authoringSnapshot(await generate(request));
  if (generated.length > reviewedLimits.maxNewQuests || generated.length + reviewedQuests.length > reviewedLimits.maxTotalQuests) {
    throw new Error("Generated quest batch exceeds quest limits");
  }
  for (const quest of generated) {
    const references = (quest.requires?.length ?? 0) + (quest.rewards?.quests?.length ?? 0)
      + (quest.rewards?.unlocks?.length ?? 0) + (quest.rewards?.items?.length ?? 0) * 2
      + Object.keys(quest.rewards?.economy ?? {}).length + quest.objectives.length * 2;
    if (quest.objectives.length > reviewedLimits.maxObjectivesPerQuest || references > reviewedLimits.maxReferencesPerQuest) {
      throw new Error(`Generated quest exceeds objective/reference limits: ${quest.id}`);
    }
  }
  const lookups = new Map<QuestCatalogReferenceKind, Set<string>>(
    Object.entries(reviewedFacts.catalogs).map(([kind, ids]) => [kind as QuestCatalogReferenceKind, new Set(ids)]),
  );
  const options: QuestCatalogValidationOptions = {
    externalUnlocks: reviewedFacts.externalUnlocks,
    externallyStartedQuests: reviewedFacts.externallyStartedQuests,
    hasReference: (kind, id) => lookups.get(kind)?.has(id) ?? false,
  };
  const candidate = [...reviewedQuests, ...generated];
  const diagnostics = validateQuestCatalog(candidate, options);
  const repair = diagnostics.filter((issue) => issue.severity === "error");
  return {
    factsRevision: reviewedFacts.revision,
    candidate: repair.length === 0 ? candidate : null,
    diagnostics,
    repair,
  };
}
