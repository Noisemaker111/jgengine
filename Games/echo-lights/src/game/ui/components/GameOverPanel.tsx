import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";
import { BEST_LENGTH_FIELD } from "../../echo/records";
import type { RunState } from "../../echo/run";

function KeyBadge({ action }: { action: string }) {
  const label = actionLabel(keybinds, action);
  if (label === null) return null;
  return (
    <span className="ml-1.5 rounded border border-black/30 bg-black/25 px-1 text-[10px] font-bold leading-tight">
      {label}
    </span>
  );
}

export function GameOverPanel({
  run,
  best,
  onPlayAgain,
  onSameSequence,
  onPractice,
  onDaily,
}: {
  run: RunState;
  best: number | null;
  onPlayAgain: () => void;
  onSameSequence: () => void;
  onPractice: () => void;
  onDaily: () => void;
}) {
  const newBest = run.bests?.improved.includes(BEST_LENGTH_FIELD) === true;
  return (
    <div className="el-pop flex w-72 flex-col items-center gap-3 rounded-2xl border border-[#d9a441]/35 bg-[#17100a]/95 p-5 text-center shadow-2xl">
      <span className="text-xs font-black uppercase tracking-[0.3em] text-[#ff6b74]">Game over</span>
      <div className="flex flex-col items-center">
        <span className="text-5xl font-black tabular-nums text-[#f3dfae]">{run.completed}</span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8a6f4d]">
          {run.completed === 1 ? "light echoed" : "lights echoed"}
          {run.daily ? " · Daily" : ""}
        </span>
      </div>
      {newBest ? (
        <span className="rounded-full bg-[#d9a441] px-3 py-0.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#17100a]">
          New best!
        </span>
      ) : (
        <span className="text-[11px] font-semibold text-[#8a6f4d]">
          Best {best === null ? "—" : best}
        </span>
      )}
      <div className="mt-1 flex w-full flex-col gap-1.5">
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex cursor-pointer items-center justify-center rounded-md bg-[#d9a441] px-3 py-2 text-sm font-black uppercase tracking-wider text-[#17100a] transition hover:bg-[#f2c96a]"
        >
          Play again
          <KeyBadge action="newGame" />
        </button>
        <button
          type="button"
          onClick={onSameSequence}
          className="cursor-pointer rounded-md border border-[#d9a441]/40 px-3 py-1.5 text-xs font-bold text-[#e8cf9a] transition hover:bg-[#d9a441]/15"
        >
          Same sequence
        </button>
        <button
          type="button"
          onClick={onPractice}
          className="cursor-pointer rounded-md border border-[#d9a441]/40 px-3 py-1.5 text-xs font-bold text-[#e8cf9a] transition hover:bg-[#d9a441]/15"
        >
          Practice this sequence
        </button>
        <button
          type="button"
          onClick={onDaily}
          className="flex cursor-pointer items-center justify-center rounded-md border border-[#5fe38a]/35 px-3 py-1.5 text-xs font-bold text-[#8fe9ab] transition hover:bg-[#5fe38a]/10"
        >
          Daily challenge
          <KeyBadge action="daily" />
        </button>
      </div>
    </div>
  );
}
