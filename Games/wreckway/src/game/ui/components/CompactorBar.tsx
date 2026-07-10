import type { SessionSnapshot } from "../../run/session";

const DANGER_GAP = 22;
const CRITICAL_GAP = 10;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CompactorBar({ snapshot }: { snapshot: SessionSnapshot }) {
  const gap = Math.max(0, snapshot.compactorGap);
  const critical = gap < CRITICAL_GAP;
  const danger = gap < DANGER_GAP;
  const fill = Math.max(0.04, Math.min(1, gap / 60));

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-3 text-xs font-black tracking-[0.2em] text-[#f0c419]">
        <span>{snapshot.zone.label}</span>
        <span className="text-[#8d99a6]">•</span>
        <span className="tabular-nums text-[#fef3e0]">{formatTime(snapshot.runTime)}</span>
      </div>
      <div
        className={`relative h-4 w-64 overflow-hidden rounded-full border-2 sm:w-80 ${
          critical ? "animate-pulse border-[#ff3b30]" : danger ? "border-[#f0c419]" : "border-[#8d99a6]"
        } bg-[#1c1a17]/90`}
      >
        <div
          className={`h-full transition-[width] duration-150 ${critical ? "bg-[#ff3b30]" : danger ? "bg-[#f0c419]" : "bg-[#b7410e]"}`}
          style={{ width: `${fill * 100}%` }}
        />
      </div>
      <p className={`text-[11px] font-bold tracking-wide ${critical ? "text-[#ff3b30]" : "text-[#c9b8a4]"}`}>
        COMPACTOR {Math.round(gap)}M BEHIND
        {snapshot.compactorSurge !== null ? " — SURGE" : ""}
      </p>
    </div>
  );
}
