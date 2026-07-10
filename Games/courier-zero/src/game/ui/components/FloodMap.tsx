import { actionLabel } from "@jgengine/core/input/actionBindings";
import { clampToMinimapEdge, projectToMinimap, type MinimapPoint } from "@jgengine/core/world/minimap";
import { useGame } from "@jgengine/react/hooks";
import { keybinds } from "../../keybinds";
import {
  nextSurgeLevel,
  passabilityAt,
  tideLevelAt,
  waterDepthAt,
  type Passability,
} from "../../tide/catalog";
import { ALL_ROUTES, VILLAGES, type CausewayRoute, type Village } from "../../world/villages";
import { jobById } from "../../delivery/catalog";
import { COMMAND_TOGGLE_MAP } from "../../run/session";
import { useMapOpen, usePlayerEntity, useRunState } from "../useRunView";

function passabilityColor(state: Passability): string {
  if (state === "dry") return "#e8d5a3";
  if (state === "wade") return "#2a9d8f";
  return "#123a44";
}

interface Projector {
  size: number;
  project(x: number, z: number): MinimapPoint;
  clip: boolean;
}

function RoutePreview({ route, tideLevel, nextLevel, projector }: {
  route: CausewayRoute;
  tideLevel: number;
  nextLevel: number;
  projector: Projector;
}) {
  const currentState = passabilityAt(waterDepthAt(route.elevation, tideLevel));
  const nextState = passabilityAt(waterDepthAt(route.elevation, nextLevel));
  const points = route.waypoints.map((wp) => projector.project(wp.position[0], wp.position[1]));
  const pointsAttr = points.map((p) => `${p.x},${p.y}`).join(" ");
  const willWorsen = nextState !== currentState;

  return (
    <g data-route={route.id}>
      <polyline
        points={pointsAttr}
        fill="none"
        stroke={passabilityColor(currentState)}
        strokeWidth={currentState === "blocked" ? 5 : 3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
      {willWorsen ? (
        <polyline
          points={pointsAttr}
          fill="none"
          stroke="#e76f51"
          strokeWidth={3}
          strokeDasharray="5 4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.95}
        />
      ) : null}
    </g>
  );
}

function VillageMark({ village, tideLevel, nextLevel, projector, isOrigin, isDestination }: {
  village: Village;
  tideLevel: number;
  nextLevel: number;
  projector: Projector;
  isOrigin: boolean;
  isDestination: boolean;
}) {
  const currentState = passabilityAt(waterDepthAt(village.elevation, tideLevel));
  const nextState = passabilityAt(waterDepthAt(village.elevation, nextLevel));
  const raw = projector.project(village.position[0], village.position[1]);
  const at = projector.clip ? clampToMinimapEdge(raw, projector.size) : raw;
  const jobColor = isDestination ? "#e76f51" : isOrigin ? "#4a7c59" : null;

  return (
    <g data-village={village.id}>
      <circle cx={at.x} cy={at.y} r={8} fill={passabilityColor(currentState)} stroke="#26413c" strokeWidth={1.5} />
      {nextState !== currentState ? (
        <circle cx={at.x} cy={at.y} r={11.5} fill="none" stroke="#e76f51" strokeWidth={1.5} strokeDasharray="3 3" />
      ) : null}
      {jobColor !== null ? <circle cx={at.x} cy={at.y} r={4} fill={jobColor} /> : null}
    </g>
  );
}

function PlayerMark({ x, y, heading }: { x: number; y: number; heading: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${(heading * 180) / Math.PI})`}>
      <path d="M0,-9 L6,7 L0,3 L-6,7 Z" fill="#e76f51" stroke="#26413c" strokeWidth={0.75} />
    </g>
  );
}

function MapContents({ projector }: { projector: Projector }) {
  const run = useRunState();
  const player = usePlayerEntity();
  const tideLevel = tideLevelAt(run.elapsed);
  const nextLevel = nextSurgeLevel(run.elapsed);
  const activeJob =
    run.carried !== null ? jobById(run.carried.jobId) : run.queue[0] !== undefined ? jobById(run.queue[0]) : null;

  return (
    <>
      {ALL_ROUTES.map((route) => (
        <RoutePreview key={route.id} route={route} tideLevel={tideLevel} nextLevel={nextLevel} projector={projector} />
      ))}
      {VILLAGES.map((village) => (
        <VillageMark
          key={village.id}
          village={village}
          tideLevel={tideLevel}
          nextLevel={nextLevel}
          projector={projector}
          isOrigin={run.carried === null && activeJob?.originId === village.id}
          isDestination={run.carried !== null && activeJob?.destinationId === village.id}
        />
      ))}
      {player !== null ? (
        (() => {
          const raw = projector.project(player.position[0], player.position[2]);
          const at = projector.clip ? clampToMinimapEdge(raw, projector.size) : raw;
          return <PlayerMark x={at.x} y={at.y} heading={player.rotationY} />;
        })()
      ) : null}
    </>
  );
}

function MiniMap() {
  const player = usePlayerEntity();
  const size = 188;
  const worldRadius = 75;
  const center: readonly [number, number] = player === null ? [0, 0] : [player.position[0], player.position[2]];
  const projector: Projector = {
    size,
    clip: true,
    project: (x, z) => projectToMinimap([x, z], { center, worldRadius, size }),
  };
  const mapKey = actionLabel(keybinds, "toggleMap");
  const { commands } = useGame();

  return (
    <div className="pointer-events-auto flex w-52 flex-col gap-1.5 rounded-xl border border-[#2a9d8f]/50 bg-[#26413c]/90 px-3 py-2.5 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e8d5a3]/70">Waterline</span>
        <button
          type="button"
          onClick={() => commands.run(COMMAND_TOGGLE_MAP, undefined)}
          className="rounded border border-[#e8d5a3]/40 bg-[#0f1f1c] px-1.5 py-0.5 text-[10px] font-bold text-[#e8d5a3] hover:bg-[#123a44]"
        >
          {mapKey}
        </button>
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-full">
        <defs>
          <clipPath id="courier-zero-mini-clip">
            <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} />
          </clipPath>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill="#0f1f1c" />
        <g clipPath="url(#courier-zero-mini-clip)">
          <MapContents projector={projector} />
        </g>
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill="none" stroke="#e8d5a3" strokeOpacity={0.35} strokeWidth={1.5} />
      </svg>
    </div>
  );
}

function BigMap() {
  const size = 560;
  const worldRadius = 130;
  const projector: Projector = {
    size,
    clip: false,
    project: (x, z) => projectToMinimap([x, z], { center: [0, 0], worldRadius, size }),
  };
  const { commands } = useGame();

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-[#0f1f1c]/70">
      <div className="flex flex-col gap-3 rounded-2xl border border-[#2a9d8f]/60 bg-[#26413c]/97 p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#e8d5a3]">The Island — Flood Chart</span>
          <button
            type="button"
            onClick={() => commands.run(COMMAND_TOGGLE_MAP, undefined)}
            className="rounded-lg border border-[#e8d5a3]/40 bg-[#0f1f1c] px-3 py-1 text-xs font-bold text-[#e8d5a3] hover:bg-[#123a44]"
          >
            Close (M)
          </button>
        </div>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-xl border border-[#e8d5a3]/20">
          <rect x={0} y={0} width={size} height={size} fill="#0f1f1c" />
          <MapContents projector={projector} />
        </svg>
        <div className="flex gap-4 text-[11px] text-[#e8d5a3]/80">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#e8d5a3" }} /> dry
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#2a9d8f" }} /> wade
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#123a44" }} /> drowned
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-[#e76f51]" /> floods next surge
          </span>
        </div>
      </div>
    </div>
  );
}

export function FloodMap() {
  const mapOpen = useMapOpen();
  return (
    <>
      <MiniMap />
      {mapOpen ? <BigMap /> : null}
    </>
  );
}
