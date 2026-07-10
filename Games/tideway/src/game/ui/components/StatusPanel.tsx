import type { HudSnapshot } from "../../race/tick";

function formatClock(sec: number): string {
  const minutes = Math.floor(sec / 60);
  const seconds = sec - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function ordinal(position: number): string {
  if (position === 1) return "1st";
  if (position === 2) return "2nd";
  if (position === 3) return "3rd";
  return `${position}th`;
}

export function StatusPanel({ hud }: { hud: HudSnapshot }) {
  return (
    <div className="flex flex-col gap-1 text-[#e6f2ef]">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black text-[#f2c14e] tabular-nums">{ordinal(hud.position)}</span>
        <span className="text-xs uppercase tracking-widest text-[#e6f2ef]/70">of {hud.totalRacers}</span>
      </div>
      <div className="text-sm text-[#e6f2ef]/85">
        Lap <span className="font-bold text-[#e6f2ef]">{hud.lap}</span> / {hud.totalLaps}
      </div>
      <div className="text-2xl font-bold tabular-nums text-[#e6f2ef]">{formatClock(hud.elapsedSec)}</div>
      <div className="text-xs uppercase tracking-wide text-[#e6f2ef]/60">Next &middot; {hud.nextGateLabel}</div>
    </div>
  );
}
