import { panelClass } from "../theme";

export function StreakBadge({ streak, bestStreak }: { streak: number; bestStreak: number }) {
  if (streak === 0 && bestStreak === 0) return null;
  return (
    <div className={`${panelClass} flex items-center gap-2 px-3 py-1.5`}>
      <span className="text-[10px] font-bold uppercase tracking-wide text-[#f4efe6]/60">True swing</span>
      <span className="text-base font-black text-[#ffd699]">x{streak}</span>
      {bestStreak > streak ? <span className="text-[10px] text-[#f4efe6]/50">best x{bestStreak}</span> : null}
    </div>
  );
}
