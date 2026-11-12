/**
 * Race-lap DRESSING shared by every lap the race circuit produces — a designed closed circuit or a lap
 * lifted out of city streets: where the start/finish line goes so the whole grid stands on the start
 * straight, and where timing sectors split so each takes about a third of the lap TIME and breaks just
 * past a significant corner. Pure math over a closed centerline; no rendering dependencies.
 *
 * @capability circuit-dressing start line, grid placement and timed sectors for a closed race lap
 */
import { closedCurvature, closedSpacing, simulateLap } from "./circuitSim";
import type { StreetVec2 } from "./streetGenerator";

/** Grid rows stand this far apart, the front row this far behind the line (m). */
export const GRID_ROW_PITCH = 9;
export const GRID_FRONT_GAP = 8;

/** Length of road (m) a grid of `slots` cars occupies behind the line, front row to last row. */
export function gridLength(slots: number): number {
  const rows = Math.ceil(Math.max(0, slots) / 2);
  return rows === 0 ? 0 : GRID_FRONT_GAP + (rows - 1) * GRID_ROW_PITCH + 4;
}

/**
 * Arc distance from the start of a straight to the start/finish line: far enough in that the whole grid
 * stands on the straight behind it, and short of the braking zone at its end.
 */
export function startLineOffset(straightLength: number, slots: number): number {
  const grid = gridLength(slots);
  const latest = straightLength - Math.max(10, straightLength * 0.12);
  return Math.max(0, Math.min(latest, Math.max(grid + 10, straightLength * 0.5)));
}

/**
 * Timing-sector starts as lap fractions (from the start line, `[0, …]`): each boundary sits near an
 * equal share of the lap TIME, snapped to the nearest `breaks` sample (just past a significant corner)
 * when one is close enough in time. `time` is elapsed seconds per sample from sample 0.
 */
export function timedSectors(
  time: readonly number[],
  lapTime: number,
  at: readonly number[],
  total: number,
  startIndex: number,
  breaks: readonly number[],
  count: number,
): number[] {
  const even = Array.from({ length: count }, (_, k) => k / count);
  if (count <= 1 || !(lapTime > 0) || time.length !== at.length) return even;
  const t0 = time[startIndex]!;
  const rel = (i: number): number => (((time[i]! - t0) % lapTime) + lapTime) % lapTime;
  const arc = (i: number): number => (((at[i]! - at[startIndex]!) % total) + total) % total;
  const out = [0];
  const window = lapTime / count / 2.5;
  for (let k = 1; k < count; k += 1) {
    const target = (k * lapTime) / count;
    let best = -1;
    let bestGap = Infinity;
    for (const b of breaks) {
      const gap = Math.abs(rel(b) - target);
      if (gap < window && gap < bestGap - 1e-9) {
        best = b;
        bestGap = gap;
      }
    }
    if (best < 0) {
      for (let i = 0; i < time.length; i += 1) {
        const gap = Math.abs(rel(i) - target);
        if (gap < bestGap - 1e-9) {
          best = i;
          bestGap = gap;
        }
      }
    }
    out.push(arc(best) / total);
  }
  for (let k = 1; k < out.length; k += 1) if (!(out[k]! > out[k - 1]! && out[k]! < 1)) return even;
  return out;
}

/** Simulated per-sample time of a lap read straight off its geometry (for laps with no design). */
export function lapTimeProfile(centerline: readonly StreetVec2[]): { time: number[]; lapTime: number } {
  const sim = simulateLap(closedCurvature(centerline, 10), closedSpacing(centerline));
  return { time: sim.time, lapTime: sim.lapTime };
}
