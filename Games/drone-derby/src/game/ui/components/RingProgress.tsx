import { HudLabel } from "@/components/ui/hud-label";
import { compassBearing, headingToBearing, relativeBearing } from "@jgengine/core/world/minimap";

const ON_SCREEN_TOLERANCE = Math.PI / 6;

function Chevron({ angle }: { angle: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        transform: `rotate(${(angle * 180) / Math.PI}deg)`,
        color: "var(--jg-mana)",
        fontSize: 20,
        filter: "drop-shadow(0 0 4px var(--jg-mana))",
        animation: "jg-pulse 1.1s infinite",
      }}
    >
      ▲
    </span>
  );
}

export function RingProgress({
  ringIndex,
  ringTotal,
  dronePosition,
  droneHeading,
  nextRingPosition,
}: {
  ringIndex: number;
  ringTotal: number;
  dronePosition: readonly [number, number, number];
  droneHeading: number;
  nextRingPosition: readonly [number, number, number] | null;
}) {
  const bearingToRing =
    nextRingPosition !== null
      ? relativeBearing(
          compassBearing([dronePosition[0], dronePosition[2]], [nextRingPosition[0], nextRingPosition[2]]),
          headingToBearing(droneHeading),
        )
      : 0;
  const offScreen = nextRingPosition !== null && Math.abs(bearingToRing) > ON_SCREEN_TOLERANCE;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <HudLabel>Ring Progress</HudLabel>
      <div className="flex items-center gap-3">
        {offScreen && <Chevron angle={bearingToRing} />}
        <span
          className="font-mono text-2xl font-extrabold"
          style={{ color: "var(--jg-text)", textShadow: "0 1px 2px rgba(0,0,0,0.9), 0 0 8px var(--jg-mana-deep)" }}
        >
          RING {Math.min(ringIndex + 1, ringTotal)}/{ringTotal}
        </span>
      </div>
    </div>
  );
}
