import { useQuestJournal } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { challenges } from "../../quests/catalog";
import { runStore } from "../../run/stores";

const titleById = new Map(challenges.map((challenge) => [challenge.id, challenge.title]));

export function ChallengeTracker() {
  const run = useStore(runStore);
  const journal = useQuestJournal();
  if (run.status === "ready") return null;
  const active = journal.filter((quest) => quest.status === "active").slice(0, 4);
  if (active.length === 0) return null;

  return (
    <div className="w-52 space-y-1.5">
      <div className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">Challenges</div>
      {active.map((quest) => {
        const total = quest.objectives.reduce((sum, objective) => sum + objective.count, 0);
        const done = quest.objectives.reduce(
          (sum, objective) => sum + Math.min(objective.progress, objective.count),
          0,
        );
        return (
          <div key={quest.questId}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {titleById.get(quest.questId) ?? quest.questId}
              </span>
              <span className="text-xs font-bold tabular-nums text-cyan-300">
                {done}/{total}
              </span>
            </div>
            <div className="mt-0.5 h-1 overflow-hidden rounded-sm bg-black/60">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300"
                style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
