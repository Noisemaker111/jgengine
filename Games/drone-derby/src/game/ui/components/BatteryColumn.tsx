import { ChargeMeter } from "@/components/ui/charge-meter";
import { HudLabel } from "@/components/ui/hud-label";

import { batteryStatus, LOW_CELL_THRESHOLD } from "../../battery/battery";

function statusColor(status: ReturnType<typeof batteryStatus>): string {
  if (status === "critical" || status === "empty") return "var(--jg-danger)";
  if (status === "low") return "var(--jg-warning)";
  return "var(--jg-accent)";
}

export function BatteryColumn({
  cells,
  drawRate,
  rangeMeters,
  nearestPadDistance,
}: {
  cells: number;
  drawRate: number;
  rangeMeters: number;
  nearestPadDistance: number | null;
}) {
  const status = batteryStatus(cells);
  const color = statusColor(status);
  const showLowAlert = status !== "ok" && status !== "empty" && nearestPadDistance !== null;

  return (
    <div className="flex flex-col items-end gap-2.5">
      <HudLabel>Battery</HudLabel>
      <div style={{ color }} className="font-mono text-3xl font-extrabold" data-jg="cell-readout">
        {Math.max(0, Math.round(cells))}%
      </div>
      <ChargeMeter fraction={cells / 100} tiers={[LOW_CELL_THRESHOLD / 100]} width={150} />
      <div className="flex flex-col items-end gap-0.5 text-right">
        <span className="font-mono text-[11px]" style={{ color: "var(--jg-text-dim)" }}>
          DRAW {drawRate >= 0 ? `${drawRate.toFixed(1)}/s` : `+${Math.abs(drawRate).toFixed(1)}/s`}
        </span>
        <span className="font-mono text-[11px]" style={{ color: "var(--jg-text-dim)" }}>
          RANGE {Number.isFinite(rangeMeters) ? `${Math.round(rangeMeters)}m` : "∞"}
        </span>
      </div>
      {showLowAlert && (
        <span
          className="text-right text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--jg-warning)", textShadow: "0 1px 2px rgba(0,0,0,0.9)", animation: "jg-pulse 1s infinite" }}
        >
          CELL LOW — PAD AHEAD {Math.round(nearestPadDistance ?? 0)}m
        </span>
      )}
    </div>
  );
}
