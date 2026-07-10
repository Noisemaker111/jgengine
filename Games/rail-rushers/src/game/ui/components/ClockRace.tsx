import { remainingRouteDistance } from "../../rail/movement";
import type { RunSession } from "../../rail/session";
import { PALETTE } from "../theme";

function handPoint(progress: number, length: number): readonly [number, number] {
  const angle = progress * Math.PI * 2 - Math.PI / 2;
  return [50 + Math.cos(angle) * length, 50 + Math.sin(angle) * length];
}

function formatClock(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface ClockRaceProps {
  session: RunSession;
}

export function ClockRace({ session }: ClockRaceProps) {
  const expressRemaining = Math.max(0, session.deadlineSeconds - session.player.elapsed);
  const distance = remainingRouteDistance(session.player, session.throwStates);
  const projectedSeconds = session.player.speed > 0.2 ? distance / session.player.speed : distance / 1.5;

  const expressProgress = (expressRemaining % 60) / 60;
  const playerProgress = (projectedSeconds % 60) / 60;
  const [ehx, ehy] = handPoint(expressProgress, 34);
  const [phx, phy] = handPoint(playerProgress, 24);
  const leading = projectedSeconds <= expressRemaining;

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1 rounded-sm border-2 border-[#a98467] bg-[#211d14]/90 px-3 py-2 shadow-[0_4px_0_rgba(0,0,0,0.4)]">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f2e8cf]/75">Express Due vs. Your Pace</span>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 100 100" className="h-16 w-16">
          <circle cx={50} cy={50} r={44} fill="#1a160f" stroke={PALETTE.brass} strokeWidth={2} />
          {Array.from({ length: 12 }).map((_, i) => {
            const [x1, y1] = handPoint(i / 12, 40);
            const [x2, y2] = handPoint(i / 12, 44);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7c7460" strokeWidth={1} />;
          })}
          <line x1={50} y1={50} x2={ehx} y2={ehy} stroke={PALETTE.signalRed} strokeWidth={2.6} strokeLinecap="round" />
          <line x1={50} y1={50} x2={phx} y2={phy} stroke={PALETTE.cream} strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={50} cy={50} r={2.4} fill={PALETTE.brass} />
        </svg>
        <div className="flex flex-col gap-0.5 font-mono text-[11px] text-[#f2e8cf]">
          <span style={{ color: PALETTE.signalRed }}>EXPRESS {formatClock(expressRemaining)}</span>
          <span style={{ color: leading ? "#8fbf7a" : PALETTE.signalRed }}>YOU {formatClock(projectedSeconds)}</span>
        </div>
      </div>
    </div>
  );
}
