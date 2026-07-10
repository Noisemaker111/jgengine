import { useGame } from "@jgengine/react/hooks";
import { sectors } from "../../course/sectors";
import { keyLabel } from "../keyLabel";
import { useRunState } from "../useRunState";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2);
  return `${String(m).padStart(2, "0")}:${s.padStart(5, "0")}`;
}

export function SectorClearScreen() {
  const { commands } = useGame();
  const run = useRunState();
  const clearedSector = sectors[run.sectorIndex]!;
  const splitTime = run.sectorTimes[run.sectorTimes.length - 1] ?? run.totalElapsed;
  const nextSector = sectors[run.sectorIndex + 1];

  return (
    <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border border-[#dfe6ee]/15 bg-[#20242a]/95 px-8 py-7 text-center shadow-2xl">
      <span className="text-xs font-bold tracking-widest text-[#ffd23f]">SECTOR CLEAR</span>
      <h2 className="text-2xl font-black text-[#dfe6ee]">{clearedSector.label}</h2>
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold tracking-widest text-[#dfe6ee]/50">SPLIT TIME</span>
        <span className="text-3xl font-black tabular-nums text-[#dfe6ee]">{formatTime(splitTime)}</span>
      </div>
      <p className="text-xs text-[#dfe6ee]/70">{nextSector ? `NEXT: ${nextSector.label}` : "FINAL SECTOR CLEARED — TALLYING RESULTS"}</p>
      <button
        type="button"
        onClick={() => commands.run("startRun", {})}
        className="w-full rounded bg-[#3e7bff] py-2.5 text-sm font-black tracking-widest text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
      >
        CONTINUE — {keyLabel("startRun")}
      </button>
    </div>
  );
}
