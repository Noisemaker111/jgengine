import type { HudSnapshot } from "../../race/tick";
import { clamp } from "../../shared/vec2";

const KNOTS_SCALE = 1.35;
const METER_MAX_KNOTS = 30;

const MOOD_COPY: Record<HudSnapshot["assistMood"], { label: string; color: string }> = {
  surf: { label: "Surfing the push", color: "#4ade80" },
  fight: { label: "Fighting the flow", color: "#c74a34" },
  neutral: { label: "Flat water", color: "#e6f2ef" },
};

export function KnotsMeter({ hud }: { hud: HudSnapshot }) {
  const knots = hud.knots * KNOTS_SCALE;
  const fraction = clamp(knots / METER_MAX_KNOTS, 0, 1);
  const mood = MOOD_COPY[hud.assistMood];
  return (
    <div className="flex w-64 flex-col items-center gap-1.5 rounded-sm border border-[#f2c14e]/30 bg-[#0e2a30]/80 px-4 py-2.5">
      <div className="flex w-full items-baseline justify-between">
        <span className="text-2xl font-black tabular-nums text-[#e6f2ef]">{knots.toFixed(1)}</span>
        <span className="text-xs uppercase tracking-widest text-[#e6f2ef]/60">knots</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#14505c]">
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${fraction * 100}%`, backgroundColor: mood.color }}
        />
      </div>
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: mood.color }}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: mood.color }} />
        {mood.label}
      </div>
    </div>
  );
}
