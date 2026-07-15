import { useGameClock } from "@jgengine/react/hooks";

export function TimeControls() {
  const clock = useGameClock();
  const speed = clock.paused ? 0 : clock.speed;
  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/85 p-1 shadow-lg backdrop-blur">
      <button
        className={`pointer-events-auto h-7 w-7 rounded text-sm font-bold ${
          clock.paused ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-slate-100 hover:bg-slate-600"
        }`}
        onClick={() => clock.controls.pause()}
        aria-label="Pause"
      >
        ⏸
      </button>
      {clock.speeds.map((s) => (
        <button
          key={s}
          className={`pointer-events-auto h-7 min-w-8 rounded px-1 font-mono text-xs font-bold ${
            !clock.paused && speed === s
              ? "bg-emerald-400 text-slate-900"
              : "bg-slate-700 text-slate-100 hover:bg-slate-600"
          }`}
          onClick={() => clock.controls.setSpeed(s)}
        >
          {s}×
        </button>
      ))}
    </div>
  );
}
