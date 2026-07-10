import { useMemo } from "react";
import { createMarkerSet, type MapMarker } from "@jgengine/core/world/markers";
import { clampToMinimapEdge, projectToMinimap, type MinimapView } from "@jgengine/core/world/minimap";
import { useMarkers } from "@jgengine/react/map";

import { forkAfterProgress, FORKS, GATES } from "../../course/catalog";
import { forkEtas } from "../../course/eta";
import { laneGrip } from "../../course/run";
import { frontProgressAt } from "../../course/storm";
import { useRunState } from "../hooks";

const SIZE = 176;
const WORLD_RADIUS = 260;
const FAST_GRIP = laneGrip(-1);

function markerColor(kind: string): string {
  if (kind === "objective") return "#d9a441";
  if (kind === "danger") return "#f25c05";
  return "#9fb8c8";
}

export function CorridorMinimap() {
  const run = useRunState();

  const markerSet = useMemo(() => {
    const set = createMarkerSet(() => 0);
    for (const gate of GATES) {
      set.add({ id: `gate-${gate.index}`, kind: "objective", position: [0, 0, -gate.progress], label: gate.name });
    }
    for (const fork of FORKS) {
      const midpoint = -(fork.forkProgress + fork.gateProgress) / 2;
      set.add({ id: `fork-${fork.index}-fast`, kind: "danger", position: [-26, 0, midpoint], label: fork.fastName });
      set.add({ id: `fork-${fork.index}-safe`, kind: "location", position: [26, 0, midpoint], label: fork.safeName });
    }
    return set;
  }, []);
  const markers = useMarkers(markerSet);

  const progress = run.status === "ready" ? 0 : run.progress;
  const now = run.status === "ready" ? 0 : run.now;
  const front = frontProgressAt(now);
  const view: MinimapView = { center: [0, -progress], worldRadius: WORLD_RADIUS, size: SIZE };

  const truckPoint = clampToMinimapEdge(projectToMinimap([0, -progress], view), SIZE);
  const frontPoint = clampToMinimapEdge(projectToMinimap([0, -front], view), SIZE);

  const nextFork = forkAfterProgress(progress);
  const etas = nextFork !== null ? forkEtas(nextFork, progress, Math.max(run.speed, 6), FAST_GRIP) : null;

  return (
    <div className="flex w-48 flex-col gap-1.5 rounded-lg border border-[#3d4a5c] bg-[#1e2633]/85 p-2 shadow-lg">
      <div className="text-[10px] uppercase tracking-widest text-[#9fb8c8]">Corridor</div>
      <div
        className="relative overflow-hidden rounded-full border border-[#3d4a5c]/80"
        style={{
          width: SIZE,
          height: SIZE,
          background: "radial-gradient(circle at 50% 50%, #22303d 0%, #141b23 75%)",
        }}
      >
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            top: `${(frontPoint.y / SIZE) * 100}%`,
            background: "linear-gradient(#3d4a5c00, #3d4a5cd0 40%, #f25c0599)",
          }}
        />
        {markers.map((marker: MapMarker) => {
          const p = clampToMinimapEdge(projectToMinimap(marker.position, view), SIZE);
          return (
            <div
              key={marker.id}
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40"
              style={{ left: p.x, top: p.y, backgroundColor: markerColor(marker.kind) }}
              title={marker.label}
            />
          );
        })}
        <div
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#facc15]"
          style={{ left: truckPoint.x, top: truckPoint.y }}
        />
      </div>
      {nextFork !== null && etas !== null ? (
        <div className="flex justify-between gap-2 text-[10px]">
          <span className="text-[#f25c05]">
            {nextFork.fastName} · {Number.isFinite(etas.fastSeconds) ? `${etas.fastSeconds.toFixed(0)}s` : "--"}
          </span>
          <span className="text-[#9fb8c8]">
            {nextFork.safeName} · {Number.isFinite(etas.safeSeconds) ? `${etas.safeSeconds.toFixed(0)}s` : "--"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
