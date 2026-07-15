import { useCurrency, useQuestJournal } from "@jgengine/react/hooks";
import { quests } from "../../quests/catalog";
import { FERRALON } from "../../palette";

export function MissionTracker() {
  const journal = useQuestJournal();
  const active = journal.filter((entry) => entry.status === "active");
  if (active.length === 0) {
    return (
      <div className="max-w-[16rem] border-l-4 border-amber-400 bg-black/60 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-stone-300">
        All missions complete — Ferralon is (briefly) quiet
      </div>
    );
  }
  return (
    <div className="flex max-w-[17rem] flex-col gap-2">
      {active.slice(0, 2).map((entry) => {
        const def = quests.find((quest) => quest.id === entry.questId);
        if (def === undefined) return null;
        return (
          <div key={entry.questId} className="border-l-4 border-amber-400 bg-black/60 px-3 py-2">
            <div className="text-xs font-black uppercase tracking-wider text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {def.title}
            </div>
            {entry.objectives.map((objective) => (
              <div key={objective.id} className="flex justify-between text-[11px] font-semibold text-stone-200">
                <span>{objective.id}</span>
                <span className="tabular-nums">
                  {Math.min(objective.progress, objective.count)} / {objective.count}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function CashPlate() {
  const cash = useCurrency("cash");
  return (
    <div className="flex skew-x-[-8deg] items-baseline gap-1 border-2 border-black/80 bg-black/70 px-3 py-1">
      <span className="text-sm font-black" style={{ color: FERRALON.hudXp }}>
        $
      </span>
      <span className="text-lg font-black tabular-nums text-stone-50">{cash}</span>
    </div>
  );
}

export function CreditBadge() {
  return (
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-sm bg-black/50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.3em] text-stone-400">
      THE ROBOTS
    </div>
  );
}
