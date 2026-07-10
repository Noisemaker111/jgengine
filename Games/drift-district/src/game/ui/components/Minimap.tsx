import { clampToMinimapEdge, headingToBearing, projectToMinimap, type MinimapView } from "@jgengine/core/world/minimap";

import type { SessionSnapshot } from "../../race/session";
import { CHECKPOINTS_2D, CHECKPOINT_COUNT, DRIFT_GATES, SHIFT_PAIRS } from "../../race/route";
import { legWaypoints } from "../../race/shift";
import { RIVALS } from "../../rivals/catalog";

const SIZE = 180;
const WORLD_RADIUS = 150;

export function Minimap({ snapshot }: { snapshot: SessionSnapshot }) {
  const playerXZ: readonly [number, number] = [snapshot.playerPose.position[0], snapshot.playerPose.position[2]];
  const view: MinimapView = {
    center: playerXZ,
    worldRadius: WORLD_RADIUS,
    size: SIZE,
    rotate: headingToBearing(snapshot.playerPose.heading),
  };

  return (
    <div
      className="absolute right-4 top-4 overflow-hidden rounded-lg border border-[#e8e6f0]/20 bg-[#0d0d13]/90 shadow-[0_0_24px_rgba(0,0,0,0.55)]"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {Array.from({ length: CHECKPOINT_COUNT }, (_, legIndex) => legIndex).map((legIndex) => {
          const pair = SHIFT_PAIRS.find((p) => p.legIndex === legIndex);
          const shifted = pair !== undefined && snapshot.shiftState[pair.id]?.active === true;
          const points = legWaypoints(legIndex, snapshot.shiftState).map((p) => projectToMinimap(p, view));
          const path = points.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");
          return (
            <path
              key={legIndex}
              d={path}
              stroke={shifted ? "#ffb347" : "#e8e6f0"}
              strokeWidth={shifted ? 3 : 1.6}
              strokeOpacity={shifted ? 0.95 : 0.32}
              fill="none"
              className={shifted ? "animate-pulse" : undefined}
            />
          );
        })}

        {CHECKPOINTS_2D.map((p, i) => {
          const proj = projectToMinimap(p, view);
          return <circle key={`cp-${i}`} cx={proj.x} cy={proj.y} r={2} fill="#e8e6f0" opacity={0.55} />;
        })}

        {DRIFT_GATES.map((gate) => {
          const proj = projectToMinimap(gate.position, view);
          return <circle key={gate.id} cx={proj.x} cy={proj.y} r={3} fill="#ff2d78" opacity={0.85} />;
        })}

        {RIVALS.map((rival) => {
          const pose = snapshot.rivalPoses[rival.id];
          if (pose === undefined) return null;
          const proj = clampToMinimapEdge(projectToMinimap([pose.position[0], pose.position[2]], view), SIZE);
          return <circle key={rival.id} cx={proj.x} cy={proj.y} r={4} fill={rival.livery.primary} stroke="#0d0d13" strokeWidth={1} />;
        })}

        <polygon
          points={`${SIZE / 2},${SIZE / 2 - 7} ${SIZE / 2 - 5},${SIZE / 2 + 6} ${SIZE / 2 + 5},${SIZE / 2 + 6}`}
          fill="#29d9e0"
        />
      </svg>
    </div>
  );
}
