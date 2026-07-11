import type { FreeCellSnapshot } from "../../freecell/store";
import { chromePanel, formatTime, statLabel, statValue } from "../theme";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className={statLabel}>{label}</span>
      <span className={statValue}>{value}</span>
    </div>
  );
}

export function StatsPanel({ snapshot }: { snapshot: FreeCellSnapshot }) {
  const { stats } = snapshot;
  const best = stats.fastestWinMs === null ? "—" : formatTime(stats.fastestWinMs);
  return (
    <div className={`${chromePanel} w-[10.5rem]`}>
      <div className="mb-2 flex items-center justify-between border-b border-slate-300/15 pb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Deal</span>
        <span className="font-mono text-sm font-bold text-sky-200">#{snapshot.dealNumber}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Stat label="Time" value={formatTime(snapshot.elapsedMs)} />
        <Stat label="Moves" value={String(snapshot.moves)} />
        <Stat label="Won" value={String(stats.gamesWon)} />
        <Stat label="Streak" value={`${stats.currentStreak}/${stats.bestStreak}`} />
        <Stat label="Best time" value={best} />
        <Stat label="Free" value={String(snapshot.free.filter((c) => c === null).length)} />
      </div>
    </div>
  );
}
