import { formatClock } from "../format";
import type { MatchSnapshot } from "../../match/snapshot";

export function Scoreboard({ snapshot }: { snapshot: MatchSnapshot }) {
  const isOvertime = snapshot.phase === "overtime";
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-[#ff6b35]/30 bg-[#160f0c]/85 px-6 py-2 shadow-lg shadow-black/40 backdrop-blur-sm">
      <div className="flex items-center gap-3 text-xl font-black tracking-wide sm:text-2xl">
        <span className="text-[#3bc7c4]">CYAN {snapshot.scoreCyan}</span>
        <span className="text-[#cdb891]/60">—</span>
        <span className="text-[#d94a8c]">{snapshot.scoreMagenta} MAGENTA</span>
      </div>
      <div className={`text-sm font-bold tracking-widest ${isOvertime ? "animate-pulse text-[#ff6b35]" : "text-[#cdb891]"}`}>
        {isOvertime ? "SUDDEN DEATH" : formatClock(snapshot.clockSeconds)}
      </div>
    </div>
  );
}
