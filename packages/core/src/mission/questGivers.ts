import type { QuestDef, QuestJournal } from "./quest";

export type GiverOffer =
  | { kind: "turnIn"; questId: string }
  /** The next quest this giver hands out. */
  | { kind: "give"; questId: string }
  /** One of this giver's quests is still under way, so the giver offers nothing new. */
  | { kind: "busy"; questId: string }
  | { kind: "none" };

export interface GiverOfferOptions {
  /** A game rule on top of `requires`, such as a minimum level. Default: every quest is eligible. */
  eligible?(def: QuestDef): boolean;
}

/** @internal */
export function questTurnInTo(def: QuestDef): string | undefined {
  return def.turnIn ?? def.giver;
}

/** @capability quest-giver an NPC that hands out its quests one at a time and takes them back when done */
export function giverOffer(
  journal: Pick<QuestJournal, "list" | "canAccept" | "canTurnIn">,
  userId: string,
  giverId: string,
  catalog: readonly QuestDef[],
  options: GiverOfferOptions = {},
): GiverOffer {
  const byId = new Map(catalog.map((def) => [def.id, def]));
  const active = journal.list(userId).filter((entry) => entry.status === "active");
  for (const entry of active) {
    const def = byId.get(entry.questId);
    if (def !== undefined && questTurnInTo(def) === giverId && journal.canTurnIn(userId, def.id) === null) {
      return { kind: "turnIn", questId: def.id };
    }
  }
  const underway = active.find((entry) => byId.get(entry.questId)?.giver === giverId);
  if (underway !== undefined) return { kind: "busy", questId: underway.questId };
  for (const def of catalog) {
    if (def.giver !== giverId) continue;
    if (journal.canAccept(userId, def.id) !== null) continue;
    if (options.eligible !== undefined && !options.eligible(def)) continue;
    return { kind: "give", questId: def.id };
  }
  return { kind: "none" };
}
