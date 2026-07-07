import { useEffect, useState } from "react";

import { benchStats, type BenchStats } from "./benchState";

function useBenchStatsPoll(): BenchStats {
  const [snapshot, setSnapshot] = useState<BenchStats>({ ...benchStats });
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 100) {
        last = now;
        setSnapshot({ ...benchStats });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return snapshot;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-white/45">{label}</span>
      <span className={`tabular-nums ${accent ?? "text-white"}`}>{value}</span>
    </div>
  );
}

function fpsAccent(fps: number): string {
  if (fps >= 55) return "text-emerald-300";
  if (fps >= 30) return "text-amber-300";
  return "text-red-400";
}

export function StressBenchUI() {
  const s = useBenchStatsPoll();
  const int = (n: number) => Math.round(n).toLocaleString();
  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-[12px] text-white">
      <div className="absolute left-4 top-4 w-64 space-y-1 rounded-lg border border-white/10 bg-black/70 p-3 shadow-xl backdrop-blur">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wider text-white/40">stress bench</span>
          <span className={`text-lg font-semibold tabular-nums ${fpsAccent(s.fps)}`}>{s.fps.toFixed(0)} fps</span>
        </div>
        <Stat label="1% low" value={`${s.fpsLow1.toFixed(0)} fps`} accent={fpsAccent(s.fpsLow1)} />
        <div className="my-1 border-t border-white/10" />
        <Stat label="bodies" value={int(s.total)} />
        <Stat label="awake" value={int(s.awake)} accent="text-orange-300" />
        <Stat label="sleeping" value={int(s.sleeping)} accent="text-sky-300" />
        <div className="my-1 border-t border-white/10" />
        <Stat label="contacts/frame" value={int(s.contacts)} />
        <Stat label="broadphase pairs" value={int(s.pairs)} />
        <Stat label="substeps" value={String(s.substeps)} />
        <div className="my-1 border-t border-white/10" />
        <Stat label="physics ms" value={s.physicsMs.toFixed(2)} accent="text-fuchsia-300" />
        <Stat label="render ms" value={s.renderMs.toFixed(2)} accent="text-cyan-300" />
        <Stat label="frame ms" value={s.frameMs.toFixed(2)} />
        <Stat label="draw calls" value={int(s.drawCalls)} />
      </div>
      <div className="absolute bottom-4 left-4 rounded bg-black/60 px-3 py-1.5 text-[11px] text-white/50">
        drag orbit · scroll zoom · <span className="text-white/70">R</span> reset ·{" "}
        <span className="text-white/70">C</span> re-kick chaos · <span className="text-white/70">T</span> debug tint
      </div>
    </div>
  );
}
