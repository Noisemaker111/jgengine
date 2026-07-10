import { TAPE_MAGENTA, LOOP_TEAL } from "../../track/palette";
import type { RunState } from "../../run/types";

export function LapHud({ run }: { run: RunState }) {
  const currentElapsed = run.now - run.lapStartTime;
  return (
    <div className="pointer-events-none flex flex-col items-center gap-0.5 rounded-lg border border-[#6247aa]/50 bg-[#12101f]/80 px-5 py-2 text-center shadow-[0_0_18px_rgba(18,16,31,0.8)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#f5f2fa]/60">Lap</p>
      <p className="text-2xl font-black tabular-nums" style={{ color: TAPE_MAGENTA }}>
        {run.lapIndex}
      </p>
      <p className="text-sm font-mono tabular-nums text-[#f5f2fa]/85">{currentElapsed.toFixed(2)}s</p>
      <p className="text-[10px] uppercase tracking-widest" style={{ color: LOOP_TEAL }}>
        Best {run.best === null ? "—" : `${run.best.toFixed(2)}s`}
      </p>
    </div>
  );
}
