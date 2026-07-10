import { Minimap, useMarkers } from "@jgengine/react";
import type { MarkerSet } from "@jgengine/core/world/markers";
import { projectToMinimap } from "@jgengine/core/world/minimap";
import type { Vec3 } from "../../world/canyonMath";
import { MARKER_KIND_STYLES } from "../../world/canyonMarkers";
import {
  CORNER_MAP_SIZE,
  CORNER_MAP_WORLD_RADIUS,
  LARGE_MAP_SIZE,
  LARGE_MAP_WORLD_RADIUS,
  MAP_CENTER,
  projectCanyonEdges,
} from "../../world/mapProjection";

const EDGE_STYLE: Record<string, { stroke: string; width: number; dash?: string }> = {
  main: { stroke: "rgba(232,215,195,0.55)", width: 3 },
  fork: { stroke: "rgba(125,140,101,0.75)", width: 2.4 },
  shortcut: { stroke: "#ffc857", width: 3.4 },
  deadend: { stroke: "#e0546b", width: 2.4, dash: "5 5" },
};

export interface CornerSurveyMapProps {
  readonly carPosition: Vec3;
  readonly carHeading: number;
  readonly markers: MarkerSet;
}

export function CornerSurveyMap({ carPosition, carHeading, markers }: CornerSurveyMapProps) {
  return (
    <Minimap
      markers={markers}
      center={[carPosition[0], carPosition[2]]}
      worldRadius={CORNER_MAP_WORLD_RADIUS}
      heading={carHeading}
      size={CORNER_MAP_SIZE}
      kindStyles={MARKER_KIND_STYLES}
      title="Survey"
      className="rounded-2xl border border-[#ffc857]/30 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
    />
  );
}

export interface LargeSurveyMapProps {
  readonly markers: MarkerSet;
}

export function LargeSurveyMap({ markers }: LargeSurveyMapProps) {
  const view = { center: MAP_CENTER, worldRadius: LARGE_MAP_WORLD_RADIUS, size: LARGE_MAP_SIZE };
  const edges = projectCanyonEdges(view);
  const markerList = useMarkers(markers);

  return (
    <div className="pointer-events-none flex w-full flex-col items-center gap-2">
      <div className="rounded-2xl border-2 border-[#ffc857]/60 bg-[#1b1220]/95 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.75)]">
        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.25em] text-[#e8d7c3]/80">
          <span>Survey Map</span>
          <span className="text-[#ffc857]">The map does not lie</span>
        </div>
        <svg
          viewBox={`0 0 ${LARGE_MAP_SIZE} ${LARGE_MAP_SIZE}`}
          className="aspect-square w-[min(86vw,560px)] rounded-xl bg-[#241a2c] sm:w-[min(70vw,640px)]"
        >

          {edges.map((edge) => {
            const style = EDGE_STYLE[edge.kind] ?? EDGE_STYLE.main;
            return (
              <line
                key={edge.id}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke={style.stroke}
                strokeWidth={style.width}
                strokeDasharray={style.dash}
                strokeLinecap="round"
              />
            );
          })}
          {markerList.map((marker) => {
            const projected = projectToMinimap(marker.position, view);
            const style = MARKER_KIND_STYLES[marker.kind] ?? MARKER_KIND_STYLES.fork;
            return (
              <g key={marker.id}>
                <circle cx={projected.x} cy={projected.y} r={9} fill="rgba(10,6,14,0.75)" stroke={style.color} strokeWidth={1.4} />
                <text x={projected.x} y={projected.y + 4} textAnchor="middle" fontSize={11} fill={style.color} fontWeight={700}>
                  {style.glyph}
                </text>
                {marker.label !== undefined ? (
                  <text x={projected.x + 12} y={projected.y + 4} fontSize={10} fill="#e8d7c3">
                    {marker.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
