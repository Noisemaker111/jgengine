import { nextJunctionAhead } from "../../rail/movement";
import { nodeById } from "../../rail/network";
import type { RunSession } from "../../rail/session";
import { PALETTE } from "../theme";

export interface JunctionIndicatorProps {
  session: RunSession;
}

export function JunctionIndicator({ session }: JunctionIndicatorProps) {
  const nodeId = nextJunctionAhead(session.player, session.throwStates);
  if (nodeId === null) return null;
  const node = nodeById(nodeId);
  const state = session.throwStates[nodeId] ?? "normal";
  const color = state === "reverse" ? PALETTE.signalRed : PALETTE.forestGreen;

  return (
    <div className="pointer-events-none flex items-center gap-2 rounded-sm border-2 border-[#a98467] bg-[#211d14]/90 px-3 py-1.5 shadow-[0_4px_0_rgba(0,0,0,0.4)]">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#f2e8cf]">
        {node.label} AHEAD — {state === "reverse" ? "REVERSE" : "NORMAL"}
      </span>
      <span className="rounded-sm border border-[#f2e8cf]/50 px-1 font-mono text-[10px] text-[#f2e8cf]/80">SPACE</span>
    </div>
  );
}
