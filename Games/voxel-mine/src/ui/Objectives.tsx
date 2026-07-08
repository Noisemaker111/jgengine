import { useQuestJournal } from "@jgengine/react/hooks";
import { labelForResource } from "../blocks";
import { quests } from "../quests";

export function Objectives() {
  const journal = useQuestJournal();
  const active = journal.find((entry) => entry.status === "active");

  if (active === undefined) {
    const hasCompleted = journal.some((entry) => entry.status === "completed");
    if (!hasCompleted) return null;
    return (
      <div className="text-sm font-semibold text-emerald-300 drop-shadow">
        All mining objectives complete
      </div>
    );
  }

  const def = quests[active.questId];
  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm font-semibold tracking-wide text-amber-200 drop-shadow">
        {def?.title ?? active.questId}
      </div>
      <div className="flex flex-col gap-0.5">
        {active.objectives.map((objective) => (
          <div
            key={objective.id}
            className={`text-xs drop-shadow ${objective.complete ? "text-emerald-300" : "text-white/80"}`}
          >
            {objective.complete ? "✓" : "●"} {labelForResource(objective.id)} {objective.progress}/
            {objective.count}
          </div>
        ))}
      </div>
    </div>
  );
}
