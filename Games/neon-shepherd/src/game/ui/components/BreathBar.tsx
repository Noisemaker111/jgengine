import { TIERS, type TierId } from "../../difficulty/tiers";
import { forecastGap } from "../../roads/breath";
import { ROADS } from "../../roads/catalog";

export function BreathBar({
  roadIndex,
  tier,
  t,
}: {
  roadIndex: number;
  tier: TierId;
  t: number;
}): React.ReactNode {
  const road = ROADS[roadIndex];
  if (road === undefined) return null;
  const forecast = forecastGap(road, TIERS[tier], t);
  const untilChange = Math.max(0, (forecast.openNow ? forecast.windowEnd : forecast.windowStart) - t);
  const width = Math.min(1, forecast.windowWidth / 4);

  return (
    <div className="flex w-56 flex-col gap-1 rounded-xl bg-[#101318]/70 px-3 py-2 backdrop-blur-sm">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-[#f5c56b]/90">
        <span>{road.label}</span>
        <span>{forecast.openNow ? "breathe" : "hold"}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-[#1c222c]">
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{
            width: `${Math.max(6, width * 100)}%`,
            backgroundColor: forecast.openNow ? "#7ef9c8" : "#f9a8d4",
            boxShadow: forecast.openNow ? "0 0 8px #7ef9c8" : "0 0 8px #f9a8d4",
          }}
        />
      </div>
      <span className="text-[10px] text-[#eef4f0]/70">
        {forecast.openNow ? `window closes in ${untilChange.toFixed(1)}s` : `next window in ${untilChange.toFixed(1)}s`}
      </span>
    </div>
  );
}
