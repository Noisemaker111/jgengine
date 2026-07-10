import { RAIL_EDGES, RAIL_NODES, nodeById } from "../../rail/network";
import type { RunOutcome } from "../../rail/raceOutcome";
import type { RunSession } from "../../rail/session";
import { PALETTE } from "../theme";

function project(x: number, z: number): readonly [number, number] {
  return [x + 100, 220 - z];
}

function RouteReview({ edgesTaken }: { edgesTaken: readonly string[] }) {
  const taken = new Set(edgesTaken);
  return (
    <svg viewBox="0 0 200 380" className="h-56 w-full rounded-sm border border-[#a98467] bg-[#1a160f]">
      {RAIL_EDGES.map((edge) => {
        const a = nodeById(edge.from).position;
        const b = nodeById(edge.to).position;
        const [x1, y1] = project(a[0], a[1]);
        const [x2, y2] = project(b[0], b[1]);
        return (
          <line
            key={edge.id}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={taken.has(edge.id) ? PALETTE.cream : "#4a4436"}
            strokeWidth={taken.has(edge.id) ? 3 : 1.4}
          />
        );
      })}
      {RAIL_NODES.filter((n) => n.kind === "station").map((node) => {
        const [x, y] = project(node.position[0], node.position[1]);
        return <rect key={node.id} x={x - 3} y={y - 3} width={6} height={6} fill={PALETTE.brass} />;
      })}
    </svg>
  );
}

export interface EndScreenProps {
  outcome: RunOutcome;
  session: RunSession;
  onRestart: () => void;
}

export function EndScreen({ outcome, session, onRestart }: EndScreenProps) {
  const isWin = outcome.status === "won";
  const title = isWin ? "CLEAR RUNNING, RUSHER" : outcome.status === "wrecked" ? "WRECKED" : "THE EXPRESS BEAT YOU IN";
  const accent = isWin ? PALETTE.forestGreen : PALETTE.signalRed;

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#1a160f]/92 p-4">
      <div className="flex w-full max-w-[560px] flex-col gap-3 rounded-sm border-2 border-[#a98467] bg-[#211d14] p-6 shadow-[0_8px_0_rgba(0,0,0,0.5)]">
        <div className="flex flex-col items-center gap-1 border-b-2 pb-3 text-center" style={{ borderColor: accent }}>
          <h1 className="text-2xl font-bold uppercase tracking-[0.1em]" style={{ color: accent }}>
            {title}
          </h1>
          {outcome.status === "won" && (
            <p className="font-mono text-sm text-[#f2e8cf]">
              Beat the Express by {outcome.marginSeconds.toFixed(1)}s{outcome.pardonUsed ? " (jump-clear pardon spent)" : ""}
            </p>
          )}
          {outcome.status === "wrecked" && (
            <p className="font-mono text-sm text-[#f2e8cf]/85">Struck by {outcome.reason} — one jump-clear pardon already spent.</p>
          )}
          {outcome.status === "lost-to-express" && (
            <p className="font-mono text-sm text-[#f2e8cf]/85">
              Run time {session.player.elapsed.toFixed(1)}s vs. a {session.deadlineSeconds.toFixed(1)}s deadline.
            </p>
          )}
        </div>

        <RouteReview edgesTaken={session.player.edgesTraveled} />

        <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-[#f2e8cf]/70">
          <span>Junctions thrown to reverse: {Object.values(session.throwStates).filter((s) => s === "reverse").length}</span>
          <span>Pardon used: {session.wreck.pardonUsed ? "yes" : "no"}</span>
        </div>

        <button
          type="button"
          onClick={onRestart}
          className="mt-1 rounded-sm border-2 border-[#f2e8cf] bg-[#386641] px-4 py-2.5 font-mono text-sm uppercase tracking-[0.16em] text-[#f2e8cf] shadow-[0_4px_0_rgba(0,0,0,0.4)] hover:brightness-110"
        >
          Restart (R)
        </button>
      </div>
    </div>
  );
}
