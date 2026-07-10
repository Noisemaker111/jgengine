import { isSingleTrackOccupied, projectConflict } from "../../rail/conflict";
import { playerForwardEdgeT, upcomingEdgesForPlayer } from "../../rail/movement";
import { RAIL_EDGES, RAIL_NODES, nodeById, type NodeId } from "../../rail/network";
import { TRAINS, trainById, trainPositionAt } from "../../rail/schedule";
import type { RunSession } from "../../rail/session";
import { PALETTE } from "../theme";

const VIEW_WIDTH = 200;
const VIEW_HEIGHT = 380;

function project(x: number, z: number): readonly [number, number] {
  return [x + 100, 220 - z];
}

const TRAIN_COLORS: Record<string, string> = Object.fromEntries(TRAINS.map((t) => [t.id, t.livery.body]));

export interface DispatcherDiagramProps {
  session: RunSession;
  now: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onThrowJunction: (nodeId: NodeId) => void;
}

export function DispatcherDiagram({ session, now, expanded, onToggleExpand, onThrowJunction }: DispatcherDiagramProps) {
  const upcoming = upcomingEdgesForPlayer(session.player, session.throwStates);
  const conflict = projectConflict(
    {
      currentEdgeId: session.player.currentEdgeId,
      edgeT: playerForwardEdgeT(session.player),
      speed: Math.max(session.player.speed, 0.6),
      upcomingEdgeIds: upcoming,
    },
    TRAINS,
    now,
  );

  const [playerSx, playerSy] = project(...playerPointFor(session));

  return (
    <div
      className={`pointer-events-auto flex flex-col gap-1 rounded-sm border-2 border-[#a98467] bg-[#211d14]/90 p-2 shadow-[0_4px_0_rgba(0,0,0,0.4)] transition-[width,height] ${
        expanded ? "w-[min(92vw,440px)]" : "w-[min(58vw,240px)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f2e8cf]/80">Dispatcher Board</span>
        <button
          type="button"
          onClick={onToggleExpand}
          className="rounded-sm border border-[#a98467] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#f2e8cf] hover:bg-[#a98467]/30"
        >
          M
        </button>
      </div>
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className={expanded ? "h-[min(70vh,640px)] w-full" : "h-[min(38vh,320px)] w-full"}>
        <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#1a160f" />
        {RAIL_EDGES.map((edge) => {
          const a = nodeById(edge.from).position;
          const b = nodeById(edge.to).position;
          const [x1, y1] = project(a[0], a[1]);
          const [x2, y2] = project(b[0], b[1]);
          const occupied = edge.singleTrack && isSingleTrackOccupied(edge.id, TRAINS, now);
          const isConflictEdge = conflict !== null && conflict.edgeId === edge.id;
          const isUpcoming = upcoming.includes(edge.id) || session.player.currentEdgeId === edge.id;
          const stroke = isConflictEdge ? PALETTE.signalRed : occupied ? "#e0a339" : isUpcoming ? PALETTE.cream : "#5c5546";
          return (
            <line
              key={edge.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={stroke}
              strokeWidth={edge.singleTrack ? 3.4 : 2.2}
              strokeDasharray={edge.kind === "tunnel" ? "3 2" : undefined}
              opacity={isConflictEdge ? 1 : 0.9}
            >
              {isConflictEdge && <animate attributeName="opacity" values="1;0.25;1" dur="0.6s" repeatCount="indefinite" />}
            </line>
          );
        })}
        {RAIL_NODES.filter((n) => n.kind === "station").map((node) => {
          const [x, y] = project(node.position[0], node.position[1]);
          return (
            <g key={node.id}>
              <rect x={x - 4} y={y - 4} width={8} height={8} fill={PALETTE.brass} stroke="#1a160f" strokeWidth={0.6} />
              <text x={x} y={y - 7} textAnchor="middle" fontSize={7} fill={PALETTE.cream} fontFamily="monospace">
                {node.label}
              </text>
            </g>
          );
        })}
        {RAIL_NODES.filter((n) => n.kind === "junction").map((node) => {
          const [x, y] = project(node.position[0], node.position[1]);
          const state = session.throwStates[node.id] ?? "normal";
          const color = state === "reverse" ? PALETTE.signalRed : PALETTE.forestGreen;
          return (
            <g
              key={node.id}
              onClick={() => onThrowJunction(node.id)}
              className="cursor-pointer"
              role="button"
              aria-label={`Throw junction ${node.junctionIndex ?? ""}`}
            >
              <circle cx={x} cy={y} r={5.5} fill={color} stroke={PALETTE.cream} strokeWidth={1} />
              <text x={x} y={y + 2.4} textAnchor="middle" fontSize={6.4} fill={PALETTE.cream} fontFamily="monospace">
                {node.junctionIndex}
              </text>
            </g>
          );
        })}
        {TRAINS.map((train) => (
          <TrainBlock key={train.id} trainId={train.id} now={now} />
        ))}
        <circle cx={playerSx} cy={playerSy} r={4.5} fill={PALETTE.cream} stroke={PALETTE.ink} strokeWidth={1.4} />
      </svg>
    </div>
  );
}

function playerPointFor(session: RunSession): readonly [number, number] {
  const edge = RAIL_EDGES.find((e) => e.id === session.player.currentEdgeId)!;
  const a = nodeById(edge.from).position;
  const b = nodeById(edge.to).position;
  const t = playerForwardEdgeT(session.player);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function TrainBlock({ trainId, now }: { trainId: string; now: number }) {
  const train = trainById(trainId);
  const pose = trainPositionAt(train, now);
  const [x, y] = project(pose.x, pose.z);
  const color = TRAIN_COLORS[trainId] ?? PALETTE.signalRed;
  return (
    <g>
      <rect x={x - 3.6} y={y - 3.6} width={7.2} height={7.2} fill={color} stroke={PALETTE.ink} strokeWidth={0.8} />
      <text x={x} y={y - 6} textAnchor="middle" fontSize={5.6} fill={color} fontFamily="monospace">
        {train.role === "express" ? "EXP" : train.role === "local" ? "LOC" : "FRT"}
      </text>
    </g>
  );
}
