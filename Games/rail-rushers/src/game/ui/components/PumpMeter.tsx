import { MAX_SPEED, PUMP_SPEED_CAP } from "../../rail/movement";
import { PUMP_TIERS } from "../../rail/pump";
import type { RunSession } from "../../rail/session";
import { PALETTE } from "../theme";

const TIER_COLOR: Record<string, string> = {
  perfect: "#8fbf7a",
  good: "#e0c46a",
  early: PALETTE.coalSmoke,
  late: PALETTE.coalSmoke,
};

export interface PumpMeterProps {
  session: RunSession;
}

export function PumpMeter({ session }: PumpMeterProps) {
  const fraction = Math.min(1, session.player.speed / PUMP_SPEED_CAP);
  const maxFraction = MAX_SPEED / PUMP_SPEED_CAP;
  const tier = PUMP_TIERS.find((t) => t.id === session.lastPumpTierId);

  return (
    <div className="pointer-events-none flex w-[min(90vw,340px)] flex-col gap-1 rounded-sm border-2 border-[#a98467] bg-[#211d14]/90 px-3 py-2 shadow-[0_4px_0_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-[#f2e8cf]/75">
        <span>Handcar Speed</span>
        <span style={{ color: tier ? TIER_COLOR[tier.id] : PALETTE.cream }}>{tier?.label ?? "HOLD W TO PUMP"}</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-sm bg-[#1a160f]">
        <div className="absolute inset-y-0 w-[2px] bg-[#f2e8cf]/60" style={{ left: `${maxFraction * 100}%` }} />
        <div
          className="h-full rounded-sm transition-[width] duration-100"
          style={{ width: `${fraction * 100}%`, background: `linear-gradient(90deg, ${PALETTE.forestGreen}, ${PALETTE.brass})` }}
        />
      </div>
      <span className="text-right font-mono text-[10px] text-[#f2e8cf]/70">{session.player.speed.toFixed(1)} u/s</span>
    </div>
  );
}
