import type { CurrentField } from "../../course/current";
import { ZONE_IDS, ZONE_LABELS } from "../../course/zones";

export function SwingBanner({ current }: { current: CurrentField }) {
  if (!current.announcing) return null;
  const secLeft = Math.max(1, Math.ceil(current.secToSwing));
  return (
    <div className="pointer-events-none flex flex-col items-center gap-1.5 rounded-sm border border-[#f2c14e]/50 bg-[#0e2a30]/85 px-5 py-2.5 text-center">
      <p className="text-lg font-black uppercase tracking-widest text-[#f2c14e]">
        Current swings in {secLeft}
        {secLeft <= 3 ? "…" : ""}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-xs text-[#e6f2ef]/80">
        {ZONE_IDS.map((zoneId) => (
          <span key={zoneId}>
            {ZONE_LABELS[zoneId]} <span className="text-[#e6f2ef]">→</span>{" "}
            <span className="font-bold text-[#e6f2ef]">{current.nextZoneStates[zoneId].compass}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
