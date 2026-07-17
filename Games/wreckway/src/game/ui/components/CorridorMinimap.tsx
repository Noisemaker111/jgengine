import { HudFrame } from "@jgengine/react/hudFrame";
import { MinimapTrack, type MinimapTrackPip, type MinimapTrackSpan } from "@jgengine/react/map";
import { trackFraction, type TrackAxis } from "@jgengine/core/world/minimapTrack";

import { ROUTE_GATES } from "../../route/gates";
import { EXIT_Z } from "../../run/constants";
import type { SessionSnapshot } from "../../run/session";
import { ZONES } from "../../zones/catalog";

const AXIS: TrackAxis = { from: [0, 0], to: [0, EXIT_Z] };

/** 0..1 fraction of a corridor Z position along the escape route (reproduces the old `z / EXIT_Z`). */
function zpct(z: number): number {
  return trackFraction([0, z], AXIS);
}

export function CorridorMinimap({ snapshot }: { snapshot: SessionSnapshot }) {
  const spans: MinimapTrackSpan[] = ZONES.map((zone) => ({
    id: zone.id,
    start: zpct(zone.start),
    end: zpct(zone.end),
    color: zone.wallColor,
  }));
  const pips: MinimapTrackPip[] = [
    ...ROUTE_GATES.map(
      (gate): MinimapTrackPip => ({
        id: gate.id,
        at: zpct(gate.atZ),
        shape: "gate",
        color: gate.requirement === "plow" ? "#b7410e" : "#f0c419",
        title: gate.label,
      }),
    ),
    { id: "exit", at: zpct(EXIT_Z), shape: "exit", color: "#fef3e0", title: "Exit" },
    { id: "compactor", at: zpct(snapshot.compactorZ), shape: "dot", color: "#ff3b30", title: "Compactor" },
    { id: "you", at: zpct(snapshot.pose.position[2]), shape: "player", color: "#fef3e0", title: "You" },
  ];

  return (
    <HudFrame variation="plate" className="w-56 sm:w-64" padding={10}>
      <p className="text-[10px] font-black tracking-[0.2em] text-[#f0c419]">ESCAPE ROUTE</p>
      <MinimapTrack spans={spans} pips={pips} railColor="#241f19" style={{ marginTop: 8 }} />
      <div className="mt-2 flex justify-between text-[9px] font-semibold tracking-wide text-[#8d99a6]">
        <span>■ Plow gate</span>
        <span>■ Jump ramp</span>
      </div>
    </HudFrame>
  );
}
