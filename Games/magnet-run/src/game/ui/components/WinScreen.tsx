import { useGame } from "@jgengine/react/hooks";
import { keyLabel } from "../keyLabel";
import { useRunState } from "../useRunState";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2);
  return `${String(m).padStart(2, "0")}:${s.padStart(5, "0")}`;
}

const MEDAL_COLOR: Record<string, string> = { gold: "#ffd23f", silver: "#dfe6ee", bronze: "#c67a3d", none: "#5a616c" };

export function WinScreen() {
  const { commands } = useGame();
  const run = useRunState();
  const medal = run.medal ?? "none";

  return (
    <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border border-[#dfe6ee]/15 bg-[#20242a]/95 px-8 py-7 text-center shadow-2xl">
      <span className="text-xs font-bold tracking-widest text-[#ffd23f]">SECTOR 3 CLEAR — RUN COMPLETE</span>
      <h2 className="text-3xl font-black text-[#dfe6ee]">TUNNEL CLEARED</h2>
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full border-4 text-xs font-black uppercase text-[#20242a]"
        style={{ backgroundColor: MEDAL_COLOR[medal], borderColor: `${MEDAL_COLOR[medal]}aa` }}
      >
        {medal}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold tracking-widest text-[#dfe6ee]/50">TOTAL TIME</span>
        <span className="text-3xl font-black tabular-nums text-[#dfe6ee]">{formatTime(run.totalElapsed)}</span>
      </div>
      <div className="flex gap-6 text-xs text-[#dfe6ee]/70">
        {run.sectorTimes.map((time, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] font-semibold text-[#dfe6ee]/50">SECTOR {i + 1}</span>
            <span className="tabular-nums">{formatTime(time)}</span>
          </div>
        ))}
      </div>
      <span className="text-[11px] text-[#dfe6ee]/60">crashes: {run.totalCrashes}</span>
      <button
        type="button"
        onClick={() => commands.run("startRun", {})}
        className="w-full rounded bg-[#ff4b3e] py-2.5 text-sm font-black tracking-widest text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
      >
        RESTART — {keyLabel("startRun")}
      </button>
    </div>
  );
}
