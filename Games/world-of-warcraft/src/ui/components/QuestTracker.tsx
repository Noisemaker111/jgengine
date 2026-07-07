import { useQuestJournal } from "@jgengine/react/hooks";
import { questById } from "../../quests/catalog";

export function QuestTracker() {
  const journal = useQuestJournal();
  if (journal.length === 0) return null;

  return (
    <div className="max-w-xs drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
      <div className="mb-1 text-xs font-bold uppercase tracking-widest text-amber-300/80">Quests</div>
      <div className="space-y-2 text-sm">
        {journal.map((quest) => (
          <div key={quest.questId}>
            <div className={quest.status === "completed" ? "text-stone-500 line-through" : "font-semibold text-amber-50"}>
              {questById(quest.questId)?.title ?? quest.questId}
            </div>
            {quest.status === "active"
              ? quest.objectives.map((objective) => (
                  <div
                    key={objective.id}
                    className={objective.complete ? "text-emerald-400" : "text-stone-300"}
                  >
                    {objective.id.replaceAll("_", " ")}: {objective.progress}/{objective.count}
                  </div>
                ))
              : null}
          </div>
        ))}
      </div>
    </div>
  );
}