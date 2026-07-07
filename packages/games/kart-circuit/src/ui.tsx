import { useEffect, useState } from "react";

import { circuitStats, type CircuitStats } from "./track";

function usePoll(): CircuitStats {
  const [snapshot, setSnapshot] = useState<CircuitStats>({ ...circuitStats });
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 80) {
        last = now;
        setSnapshot({ ...circuitStats });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return snapshot;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function damageColor(pct: number): string {
  if (pct < 33) return "bg-emerald-400";
  if (pct < 66) return "bg-amber-400";
  return "bg-red-500";
}

export function KartCircuitUI() {
  const s = usePoll();
  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans text-white">
      <div className="absolute left-1/2 top-5 flex -translate-x-1/2 items-stretch gap-3">
        <div className="flex flex-col items-center rounded-2xl border border-white/15 bg-black/70 px-6 py-3 shadow-2xl backdrop-blur">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Lap</span>
          <span className="text-3xl font-bold tabular-nums">
            {Math.min(s.lap, s.totalLaps)}
            <span className="text-lg text-white/40">/{s.totalLaps}</span>
          </span>
        </div>
        <div className="flex flex-col items-center rounded-2xl border border-amber-300/30 bg-black/70 px-6 py-3 shadow-2xl backdrop-blur">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/60">Pos</span>
          <span className="text-3xl font-bold tabular-nums text-amber-300">{ordinal(s.position)}</span>
          <span className="text-[10px] text-white/40">of {s.racers}</span>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2">
        <div className="flex items-end gap-2 rounded-2xl border border-white/15 bg-black/70 px-6 py-3 shadow-2xl backdrop-blur">
          <span className="text-6xl font-bold leading-none tabular-nums">{Math.round(s.speedKmh)}</span>
          <div className="flex flex-col items-start pb-1">
            <span className="text-sm font-semibold text-white/50">km/h</span>
            <span
              className={`rounded px-2 text-lg font-bold ${
                s.gear === "D" ? "text-emerald-300" : s.gear === "R" ? "text-sky-300" : "text-white/40"
              }`}
            >
              {s.gear}
            </span>
          </div>
        </div>
        <div className="w-56 rounded-2xl border border-white/15 bg-black/70 px-4 py-3 shadow-2xl backdrop-blur">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Damage</span>
            <span className="text-xs font-semibold tabular-nums text-white/70">
              {s.disabled ? "DISABLED" : `stage ${s.damageStage}`}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${damageColor(s.damagePct)}`}
              style={{ width: `${Math.max(3, s.damagePct)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="absolute left-5 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border border-white/15 bg-black/70 px-4 py-3 shadow-2xl backdrop-blur">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">CP</span>
        <span className="text-2xl font-bold tabular-nums">
          {s.nextCheckpoint === 0 ? s.totalCheckpoints : s.nextCheckpoint}
          <span className="text-base text-white/40">/{s.totalCheckpoints}</span>
        </span>
        <span className="mt-1 text-[10px] uppercase tracking-wider text-white/35">Last {s.lastSplit.toFixed(1)}s</span>
      </div>

      {s.feed.length > 0 && (
        <div className="absolute bottom-6 left-5 w-56 space-y-1 rounded-2xl border border-white/15 bg-black/60 p-3 text-xs shadow-xl backdrop-blur">
          {s.feed.map((line, i) => (
            <div key={i} className={i === 0 ? "text-white" : "text-white/45"}>
              {line}
            </div>
          ))}
        </div>
      )}

      {s.disabled && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-red-500/40 bg-black/80 px-8 py-4 text-center shadow-2xl backdrop-blur">
          <div className="text-2xl font-bold text-red-400">WRECKED</div>
          <div className="mt-1 text-sm text-white/60">Press R to reset to checkpoint</div>
        </div>
      )}
    </div>
  );
}
