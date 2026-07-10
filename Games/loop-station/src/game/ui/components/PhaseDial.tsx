import { useMemo } from "react";

import { buildLap, lapLength, zoneRange, BASE_SPEED, MAIN_LANES } from "../../track/geometry";
import { forecastCollision, dialTicks } from "../../run/dial";
import { GRID_VIOLET, LOOP_TEAL, PAPER_WHITE, TAPE_MAGENTA } from "../../track/palette";
import type { RunState } from "../../run/types";

const REFERENCE_SEGMENTS = buildLap(MAIN_LANES);
const REFERENCE_TOTAL = lapLength(REFERENCE_SEGMENTS);
const BRIDGE_ZONE = zoneRange(REFERENCE_SEGMENTS, "rampUp")!;
const FORK_A_ZONE = zoneRange(REFERENCE_SEGMENTS, "forkA")!;
const FORK_B_ZONE = zoneRange(REFERENCE_SEGMENTS, "forkB")!;

const RADIUS = 74;
const CENTER = 84;

function angleFor(phase: number): number {
  return phase * Math.PI * 2 - Math.PI / 2;
}

function pointAt(phase: number, radius: number): { x: number; y: number } {
  const angle = angleFor(phase);
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius };
}

function LandmarkArc({ startPhase, endPhase, color, label }: { startPhase: number; endPhase: number; color: string; label: string }) {
  const start = pointAt(startPhase, RADIUS);
  const end = pointAt(endPhase, RADIUS);
  const large = endPhase - startPhase > 0.5 ? 1 : 0;
  return (
    <path
      d={`M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${end.x} ${end.y}`}
      stroke={color}
      strokeWidth={5}
      fill="none"
      strokeLinecap="round"
      opacity={0.85}
    >
      <title>{label}</title>
    </path>
  );
}

export function PhaseDial({ run }: { run: RunState }) {
  const ticks = useMemo(() => dialTicks(run.ghosts, run.now), [run.ghosts, run.now]);
  const speed = BASE_SPEED * run.paceMultiplier;
  const sPerSecond = REFERENCE_TOTAL > 0 ? speed / REFERENCE_TOTAL : 0;
  const forecast = useMemo(
    () => forecastCollision(run.position.s, sPerSecond, run.ghosts, run.now),
    [run.position.s, sPerSecond, run.ghosts, run.now],
  );
  const playerPoint = pointAt(run.position.s, RADIUS);

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1">
      <svg width={168} height={168} viewBox="0 0 168 168" className="drop-shadow-[0_0_16px_rgba(98,71,170,0.55)]">
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#12101f" fillOpacity={0.75} stroke={GRID_VIOLET} strokeWidth={2} />
        <LandmarkArc startPhase={FORK_A_ZONE.start / REFERENCE_TOTAL} endPhase={FORK_A_ZONE.end / REFERENCE_TOTAL} color={LOOP_TEAL} label="Fork A" />
        <LandmarkArc startPhase={FORK_B_ZONE.start / REFERENCE_TOTAL} endPhase={FORK_B_ZONE.end / REFERENCE_TOTAL} color={LOOP_TEAL} label="Fork B" />
        <LandmarkArc startPhase={BRIDGE_ZONE.start / REFERENCE_TOTAL} endPhase={BRIDGE_ZONE.end / REFERENCE_TOTAL} color={TAPE_MAGENTA} label="Over/under" />
        {forecast !== null ? (
          <circle cx={pointAt(forecast.phase, RADIUS).x} cy={pointAt(forecast.phase, RADIUS).y} r={7} fill={TAPE_MAGENTA} opacity={0.9} className="animate-pulse" />
        ) : null}
        {ticks.map((tick) => {
          const point = pointAt(tick.phase, RADIUS - 12);
          return (
            <circle
              key={tick.ghostId}
              cx={point.x}
              cy={point.y}
              r={tick.faded ? 2.5 : 4}
              fill={tick.color}
              opacity={tick.faded ? 0.35 : 0.95}
            />
          );
        })}
        <circle cx={playerPoint.x} cy={playerPoint.y} r={5.5} fill={PAPER_WHITE} stroke="#12101f" strokeWidth={1.5} />
        <circle cx={CENTER} cy={CENTER} r={3} fill={GRID_VIOLET} />
      </svg>
      <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#f5f2fa]/70">Phase Clock</p>
      {forecast !== null ? (
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#e83d84]">
          Ghost {forecast.lapIndex} in {forecast.secondsAhead.toFixed(1)}s
        </p>
      ) : null}
    </div>
  );
}
