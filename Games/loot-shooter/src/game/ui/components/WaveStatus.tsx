import { useRun } from "./useRun";

export function WaveStatus() {
  const run = useRun();
  if (run.status === "ready") return null;
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Wave</span>
        <span className="text-2xl font-black tabular-nums text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          {run.wave}
        </span>
        {run.endless ? (
          <span className="text-sm font-black uppercase tracking-widest text-rose-400">Endless</span>
        ) : (
          <span className="text-sm font-bold text-slate-500">/ {run.waveTotal}</span>
        )}
      </div>
      {run.status === "wave" && run.alive > 0 ? (
        <span className="text-xs font-semibold uppercase tracking-wider text-rose-300">
          {run.alive} hostile{run.alive === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  );
}

export function IntermissionBanner() {
  const run = useRun();
  if (run.status !== "intermission") return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[22%] z-30 flex flex-col items-center">
      <span className="text-3xl font-black uppercase tracking-[0.25em] text-cyan-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
        Wave {run.wave} incoming
      </span>
      <span className="mt-1 text-5xl font-black tabular-nums text-amber-300 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
        {Math.ceil(run.intermissionLeft)}
      </span>
      <span className="mt-2 text-sm font-semibold uppercase tracking-widest text-slate-300">
        Grab salvage · restock
      </span>
    </div>
  );
}
