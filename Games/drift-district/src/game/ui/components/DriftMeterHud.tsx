import type { SessionSnapshot } from "../../race/session";

const TOP_SPEED_KMH = 30 * 3.6 * 1.45;

export function DriftMeterHud({ snapshot }: { snapshot: SessionSnapshot }) {
  const speedFraction = Math.min(1, snapshot.speedKmh / TOP_SPEED_KMH);
  const meterFraction = Math.min(1, Math.max(0, snapshot.driftCharge));
  const meterColor = snapshot.boosting ? "#ff2d78" : snapshot.drifting ? "#ffb347" : "#29d9e0";

  return (
    <div className="absolute bottom-6 left-1/2 flex w-[min(92vw,420px)] -translate-x-1/2 flex-col items-center gap-2 rounded-lg border border-[#e8e6f0]/15 bg-[#15151d]/85 px-5 py-3 shadow-[0_0_24px_rgba(0,0,0,0.5)]">
      <div className="flex w-full items-center justify-between">
        <span className="font-mono text-2xl font-black text-[#e8e6f0]">
          {Math.round(snapshot.speedKmh)}
          <span className="ml-1 text-xs font-bold text-[#e8e6f0]/50">KM/H</span>
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.3em]"
          style={{ color: meterColor }}
        >
          {snapshot.boosting ? "Boosting" : snapshot.drifting ? "Drifting" : "Drift Meter"}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0d0d13]">
        <div className="h-full rounded-full bg-[#e8e6f0]/70" style={{ width: `${speedFraction * 100}%` }} />
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full border border-[#e8e6f0]/15 bg-[#0d0d13]">
        <div
          className="h-full rounded-full transition-[width] duration-100"
          style={{ width: `${meterFraction * 100}%`, backgroundColor: meterColor, boxShadow: `0 0 10px ${meterColor}` }}
        />
      </div>
    </div>
  );
}
