import { actionLabel } from "@jgengine/core/input/actionBindings";
import { KeyHint } from "@jgengine/react";
import { useGame } from "@jgengine/react/hooks";
import { keybinds } from "../../keybinds";
import { formatDistance } from "../format";
import type { MatchSnapshot } from "../../match/snapshot";

export function EndScreen({ snapshot }: { snapshot: MatchSnapshot }) {
  const { commands } = useGame();
  const cyanWon = snapshot.scoreCyan > snapshot.scoreMagenta;

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#0c0806]/88 px-4">
      <div
        className={`flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border-2 p-6 text-center shadow-2xl shadow-black/60 sm:p-8 ${
          cyanWon ? "border-[#3bc7c4]/50 bg-[#0e1c1b]/95" : "border-[#d94a8c]/50 bg-[#1c0e17]/95"
        }`}
      >
        <div className="flex flex-col gap-1">
          <span
            className="text-4xl font-black uppercase tracking-wide drop-shadow-[0_0_16px_rgba(0,0,0,0.6)] sm:text-5xl"
            style={{ color: cyanWon ? "#3bc7c4" : "#d94a8c" }}
          >
            {cyanWon ? "Victory" : "Defeat"}
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-[#cdb891]/60">
            {cyanWon ? "Cyan holds the arena" : "Magenta holds the arena"}
          </span>
        </div>

        <div className="flex items-center gap-4 text-3xl font-black">
          <span className="text-[#3bc7c4]">{snapshot.scoreCyan}</span>
          <span className="text-[#cdb891]/40">—</span>
          <span className="text-[#d94a8c]">{snapshot.scoreMagenta}</span>
        </div>

        <div className="grid w-full grid-cols-2 gap-3 rounded-lg border border-[#cdb891]/15 bg-black/25 p-3 text-left">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#cdb891]/60">Scars Left</span>
            <span className="text-lg font-black text-[#ff6b35]">{snapshot.craterCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#cdb891]/60">Total Scars</span>
            <span className="text-lg font-black text-[#ff6b35]">{snapshot.craterScars}</span>
          </div>
          <div className="col-span-2 flex flex-col border-t border-[#cdb891]/10 pt-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#cdb891]/60">
              MVP — Longest Goal Blast
            </span>
            <span className="text-lg font-black text-[#ffd7ba]">{formatDistance(snapshot.longestGoalBlastDistance)}</span>
          </div>
        </div>

        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={() => commands.run("restart", {})}
            className="flex-1 rounded-lg bg-[#ff6b35] px-4 py-3 text-sm font-black uppercase tracking-widest text-[#160f0c] shadow-lg shadow-[#ff6b35]/30 transition-transform hover:scale-[1.02] active:scale-95"
          >
            Rematch
            <KeyHint> — {actionLabel(keybinds, "restart") ?? "R"}</KeyHint>
          </button>
        </div>
      </div>
    </div>
  );
}
