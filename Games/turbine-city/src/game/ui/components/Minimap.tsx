import { clampToMinimapEdge, projectToMinimap, type MinimapView } from "@jgengine/core/world/minimap";

import type { SessionSnapshot } from "../../race/session";
import { FLOW_TUBES, RING_NODES } from "../../race/route";
import { PALETTE } from "./theme";

const SIZE = 190;

function courseCenterAndRadius(): { center: readonly [number, number]; radius: number } {
  const xs = RING_NODES.map((n) => n.position[0]);
  const zs = RING_NODES.map((n) => n.position[2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const center: readonly [number, number] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const radius = Math.max(maxX - minX, maxZ - minZ) / 2 + 40;
  return { center, radius };
}

const { center: COURSE_CENTER, radius: COURSE_RADIUS } = courseCenterAndRadius();

function fanColor(power: number, stage: string): string {
  if (stage === "off") return `${PALETTE.cloudWhite}44`;
  if (power > 0.7) return PALETTE.skyTeal;
  if (power > 0.3) return PALETTE.windsockOrange;
  return PALETTE.shadowBlue;
}

export function Minimap({ snapshot }: { snapshot: SessionSnapshot }) {
  const view: MinimapView = { center: COURSE_CENTER, worldRadius: COURSE_RADIUS, size: SIZE };

  return (
    <div
      className="absolute right-4 top-4 overflow-hidden rounded-lg border"
      style={{ width: SIZE, height: SIZE, borderColor: `${PALETTE.citySlate}55`, backgroundColor: "#0f1d1ee6" }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {FLOW_TUBES.map((tube) => {
          const from = projectToMinimap([tube.from[0], tube.from[2]], view);
          const to = projectToMinimap([tube.to[0], tube.to[2]], view);
          return (
            <line
              key={tube.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={tube.fanId === null ? `${PALETTE.cloudWhite}33` : `${PALETTE.skyTeal}55`}
              strokeWidth={tube.fanId === null ? 1.2 : 2}
            />
          );
        })}

        {RING_NODES.map((node, i) => {
          const proj = projectToMinimap([node.position[0], node.position[2]], view);
          return <circle key={node.id} cx={proj.x} cy={proj.y} r={2.4} fill={PALETTE.cloudWhite} opacity={0.7}>
            <title>{`Ring ${i + 1}`}</title>
          </circle>;
        })}

        {snapshot.fans.map((fanReadout, i) => {
          const tube = FLOW_TUBES.find((t) => t.fanId === fanReadout.id);
          if (tube === undefined) return null;
          const proj = projectToMinimap([tube.from[0], tube.from[2]], view);
          return (
            <g key={fanReadout.id}>
              <circle cx={proj.x} cy={proj.y} r={4} fill={fanColor(fanReadout.power, fanReadout.stage)} stroke="#0f1d1e" strokeWidth={1} />
              <text x={proj.x + 5} y={proj.y - 4} fontSize={7} fill={PALETTE.cloudWhite} opacity={0.85}>
                {Math.ceil(fanReadout.secondsToNextStage)}s
              </text>
              <title>{`Fan ${i + 1}: ${fanReadout.stage} (${Math.round(fanReadout.power * 100)}%)`}</title>
            </g>
          );
        })}

        {(() => {
          const proj = clampToMinimapEdge(projectToMinimap([snapshot.pacerPose.position[0], snapshot.pacerPose.position[2]], view), SIZE);
          return <circle cx={proj.x} cy={proj.y} r={4} fill={PALETTE.shadowBlue} stroke={PALETTE.cloudWhite} strokeWidth={1} />;
        })()}
        {(() => {
          const proj = clampToMinimapEdge(projectToMinimap([snapshot.playerPose.position[0], snapshot.playerPose.position[2]], view), SIZE);
          return <circle cx={proj.x} cy={proj.y} r={4.5} fill={PALETTE.windsockOrange} stroke="#0f1d1e" strokeWidth={1.2} />;
        })()}
      </svg>
    </div>
  );
}
