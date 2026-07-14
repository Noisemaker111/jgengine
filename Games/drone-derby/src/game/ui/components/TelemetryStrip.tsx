import { formatDistance } from "@jgengine/core/format/distance";
import { formatSpeed } from "@jgengine/core/format/speed";

import { HudLabel } from "@/components/ui/hud-label";

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <HudLabel>{label}</HudLabel>
      <span className="font-mono text-lg font-bold" style={{ color: "var(--jg-text)", textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>
        {value}
      </span>
    </div>
  );
}

export function TelemetryStrip({
  speed,
  altitude,
  windSpeed,
  gustActive,
}: {
  speed: number;
  altitude: number;
  windSpeed: number;
  gustActive: boolean;
}) {
  return (
    <div
      className="flex items-center gap-8 rounded px-5 py-2.5"
      style={{
        background: "linear-gradient(180deg, rgba(32,36,43,0.85) 0%, rgba(20,23,27,0.9) 100%)",
        border: "1px solid var(--jg-edge)",
      }}
    >
      <Readout label="Speed" value={formatSpeed(speed)} />
      <Readout label="Altitude" value={formatDistance(altitude, { decimals: 1 })} />
      <Readout label="Wind" value={gustActive ? `${windSpeed.toFixed(1)} m/s ⚡` : `${windSpeed.toFixed(1)} m/s`} />
    </div>
  );
}
