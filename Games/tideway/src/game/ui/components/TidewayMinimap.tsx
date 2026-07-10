import { usePlayer, useSceneEntities } from "@jgengine/react/hooks";
import { RIVALS } from "../../boats/catalog";
import type { CurrentField } from "../../course/current";
import { GATES } from "../../course/track";
import { ZONE_IDS, ZONE_LABELS, zoneCentroid } from "../../course/zones";
import { clampToMinimapEdge, headingToBearing, projectToMinimap } from "@jgengine/core/world/minimap";

const SIZE = 208;
const WORLD_RADIUS = 148;
const VIEW = { center: [0, 0] as const, worldRadius: WORLD_RADIUS, size: SIZE };
const ZONE_ARROW_RADIUS = 66;

function ArrowGlyph({ x, y, compassDeg, color, opacity, dashed }: { x: number; y: number; compassDeg: number; color: string; opacity: number; dashed?: boolean }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${compassDeg})`} opacity={opacity}>
      <line x1={0} y1={7} x2={0} y2={-7} stroke={color} strokeWidth={2} strokeDasharray={dashed ? "2 2" : undefined} />
      <path d="M -4 -3 L 0 -9 L 4 -3 Z" fill={color} />
    </g>
  );
}

const COMPASS_DEG: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

export function TidewayMinimap({ current }: { current: CurrentField }) {
  const entities = useSceneEntities();
  const { userId } = usePlayer();
  const boatIds = new Set([userId, ...RIVALS.map((rival) => rival.id)]);
  const boats = entities.filter((entity) => boatIds.has(entity.id));

  return (
    <div className="h-36 w-36 overflow-hidden rounded-full border-2 border-[#f2c14e]/50 bg-[#0e2a30] shadow-lg sm:h-52 sm:w-52">
      <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 1} fill="#14505c" />
        {GATES.map((gate) => {
          const point = projectToMinimap(gate.center, VIEW);
          const clamped = clampToMinimapEdge(point, SIZE);
          return (
            <g key={gate.id}>
              <circle cx={clamped.x} cy={clamped.y} r={4} fill="#e6f2ef" stroke="#0e2a30" strokeWidth={1} />
              <text x={clamped.x} y={clamped.y - 6} fontSize={7} fill="#e6f2ef" textAnchor="middle">
                {gate.index + 1}
              </text>
            </g>
          );
        })}
        {ZONE_IDS.map((zoneId) => {
          const [zx, zz] = zoneCentroid(zoneId, ZONE_ARROW_RADIUS);
          const point = projectToMinimap([zx, zz], VIEW);
          const nowState = current.zoneStates[zoneId];
          const nextState = current.nextZoneStates[zoneId];
          return (
            <g key={zoneId}>
              <ArrowGlyph x={point.x} y={point.y} compassDeg={COMPASS_DEG[nowState.compass] ?? 0} color="#f2c14e" opacity={1} />
              <ArrowGlyph
                x={point.x + 10}
                y={point.y + 10}
                compassDeg={COMPASS_DEG[nextState.compass] ?? 0}
                color="#e6f2ef"
                opacity={current.announcing ? 0.85 : 0.28}
                dashed
              />
            </g>
          );
        })}
        {boats.map((boat) => {
          const point = projectToMinimap(boat.position, VIEW);
          const isPlayer = boat.id === userId;
          const bearingDeg = (headingToBearing(boat.rotationY) * 180) / Math.PI;
          return (
            <g key={boat.id} transform={`translate(${point.x},${point.y}) rotate(${bearingDeg})`}>
              <path d="M 0 -6 L 4 5 L -4 5 Z" fill={isPlayer ? "#c74a34" : "#e6f2ef"} stroke="#0e2a30" strokeWidth={0.75} />
            </g>
          );
        })}
      </svg>
      <div className="sr-only">
        {ZONE_IDS.map((zoneId) => (
          <span key={zoneId}>{ZONE_LABELS[zoneId]}</span>
        ))}
      </div>
    </div>
  );
}
