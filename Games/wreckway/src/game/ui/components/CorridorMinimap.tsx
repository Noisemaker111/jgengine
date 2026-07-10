import { ROUTE_GATES } from "../../route/gates";
import { EXIT_Z } from "../../run/constants";
import type { SessionSnapshot } from "../../run/session";
import { ZONES } from "../../zones/catalog";

function pct(z: number): number {
  return Math.max(0, Math.min(100, (z / EXIT_Z) * 100));
}

export function CorridorMinimap({ snapshot }: { snapshot: SessionSnapshot }) {
  const kartPct = pct(snapshot.pose.position[2]);
  const compactorPct = pct(snapshot.compactorZ);

  return (
    <div className="w-56 rounded border border-[#8d99a6]/40 bg-[#1c1a17]/85 p-2.5 sm:w-64">
      <p className="text-[10px] font-black tracking-[0.2em] text-[#f0c419]">ESCAPE ROUTE</p>
      <div className="relative mt-2 h-3 w-full overflow-visible rounded-full bg-[#241f19]">
        {ZONES.map((zone) => (
          <div
            key={zone.id}
            className="absolute top-0 h-full opacity-40"
            style={{ left: `${pct(zone.start)}%`, width: `${pct(zone.end) - pct(zone.start)}%`, backgroundColor: zone.wallColor }}
          />
        ))}
        {ROUTE_GATES.map((gate) => (
          <div
            key={gate.id}
            title={gate.label}
            className={`absolute -top-1 h-5 w-1.5 rounded-full ${gate.requirement === "plow" ? "bg-[#b7410e]" : "bg-[#f0c419]"}`}
            style={{ left: `${pct(gate.atZ)}%` }}
          />
        ))}
        <div
          className="absolute -top-1 h-5 w-1 rounded-full bg-[#fef3e0]"
          style={{ left: `${pct(EXIT_Z)}%` }}
          title="Exit"
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[#1c1a17] bg-[#ff3b30] shadow-[0_0_6px_rgba(255,59,48,0.9)]"
          style={{ left: `calc(${compactorPct}% - 6px)` }}
          title="Compactor"
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-[#1c1a17] bg-[#fef3e0]"
          style={{ left: `calc(${kartPct}% - 7px)` }}
          title="You"
        />
      </div>
      <div className="mt-2 flex justify-between text-[9px] font-semibold tracking-wide text-[#8d99a6]">
        <span>■ Plow gate</span>
        <span>■ Jump ramp</span>
      </div>
    </div>
  );
}
