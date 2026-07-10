import { projectToMinimap, type MinimapView } from "@jgengine/core/world/minimap";

import type { Archipelago } from "../../world/archipelago";
import type { CourseDef } from "../../world/courses";
import { panelClass } from "../theme";

const SIZE = 168;
const WORLD_RADIUS = 150;

export function ArchipelagoMap({
  archipelago,
  course,
  checkpointsHit,
  playerPosition,
}: {
  archipelago: Archipelago;
  course: CourseDef | undefined;
  checkpointsHit: number;
  playerPosition: readonly [number, number, number];
}) {
  const view: MinimapView = { center: [playerPosition[0], playerPosition[2]], worldRadius: WORLD_RADIUS, size: SIZE };
  const routePoints =
    course?.checkpoints
      .map((cp) => projectToMinimap([cp.center[0], cp.center[2]], view))
      .filter((p) => p.inside)
      .map((p) => `${p.x},${p.y}`)
      .join(" ") ?? "";

  return (
    <div className={`${panelClass} p-2`}>
      <div
        className="relative overflow-hidden rounded-full border border-[#b08d57]/50"
        style={{ width: SIZE, height: SIZE, background: "radial-gradient(circle, rgba(46,139,139,0.25), rgba(43,33,24,0.92))" }}
      >
        <svg className="pointer-events-none absolute inset-0" width={SIZE} height={SIZE}>
          {routePoints.length > 0 ? (
            <polyline points={routePoints} fill="none" stroke="#2e8b8b" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.85} />
          ) : null}
        </svg>
        {archipelago.islets.map((islet) => {
          const p = projectToMinimap([islet.position.x, islet.position.z], view);
          if (!p.inside) return null;
          return (
            <span
              key={islet.id}
              className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8a9b68]"
              style={{ left: p.x, top: p.y }}
            />
          );
        })}
        {course?.checkpoints.map((cp, index) => {
          const p = projectToMinimap([cp.center[0], cp.center[2]], view);
          if (!p.inside) return null;
          const isNext = index === checkpointsHit;
          return (
            <span
              key={cp.id}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[8px] font-bold ${
                isNext ? "h-3.5 w-3.5 animate-pulse border-[#ffd699] bg-[#ffd699] text-[#2b2118]" : "h-2 w-2 border-[#2e8b8b] bg-[#2e8b8b]/80 text-transparent"
              }`}
              style={{ left: p.x, top: p.y }}
            >
              {isNext ? index + 1 : ""}
            </span>
          );
        })}
        <span
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f4efe6]"
          style={{ left: SIZE / 2, top: SIZE / 2, boxShadow: "0 0 6px 2px rgba(244,239,230,0.7)" }}
        />
      </div>
      <p className="mt-1 text-center text-[10px] font-bold uppercase tracking-wide text-[#f4efe6]/70">{course?.name ?? "Archipelago"}</p>
    </div>
  );
}
