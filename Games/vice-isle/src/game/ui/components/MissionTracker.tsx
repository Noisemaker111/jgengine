import { useQuestJournal } from "@jgengine/react/hooks";
import { MISSION_HINTS, QUESTS } from "../../quests/catalog";

export function MissionTracker() {
  const journal = useQuestJournal();
  const active = journal.find((q) => q.status === "active");
  if (active === undefined) {
    const allDone = journal.filter((q) => q.status === "completed").length >= QUESTS.length;
    return allDone ? (
      <div className="-skew-x-3 border-2 border-black bg-[#ffb020] px-3 py-2 text-sm font-black uppercase text-black shadow-[4px_4px_0_#000]">
        Vice Isle cleared — free roam
      </div>
    ) : null;
  }
  const def = QUESTS.find((q) => q.id === active.questId);
  return (
    <div className="w-64 border-2 border-black bg-[#12141a]/90 px-3 py-2 text-[#f4e8c8] shadow-[4px_4px_0_#000]">
      <div className="-mx-3 -mt-2 mb-1 border-b-2 border-black bg-[#c23b3b] px-3 py-1 text-xs font-black uppercase tracking-widest text-white">
        {def?.title ?? active.questId}
      </div>
      <div className="text-xs italic text-[#f4e8c8]/80">{MISSION_HINTS[active.questId]}</div>
      <div className="mt-1 flex flex-col gap-0.5">
        {active.objectives.map((objective) => (
          <div key={objective.id} className="flex items-center justify-between text-xs font-bold">
            <span className={objective.complete ? "text-[#3fbf5a] line-through" : ""}>{objective.id.replaceAll("_", " ")}</span>
            <span className="tabular-nums text-[#ffb020]">
              {objective.progress}/{objective.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
