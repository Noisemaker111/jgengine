import { MAIN_ROUTE, type CourseFix } from "@jgengine/core/roads/routeCourse";

import type { KartTuning } from "../parts/build";
import { partById, type DriftFoundryPartDef } from "../parts/catalog";
import type { PickupDef } from "../run/pickups";
import { ROW_SIX_TRACK, type Track } from "../tracks/catalog";

export type GateNeed = "plow" | "jump";

export interface RouteGate {
  id: string;
  zoneId: string;
  requirement: GateNeed;
  /** Route the barricade stands on; a shortcut's gate only stops karts that took the shortcut. */
  route: string;
  /** The band of lateral offset this barricade spans. Every barricade seals its whole road. */
  laneX: readonly [number, number];
  /** Run metres: main-line metres from the start line (on Row Six, world z). */
  atZ: number;
  label: string;
  radioLine: string;
  /** A set-piece barricade: open road until this many seconds into the run. */
  dropsAt?: number;
}

/**
 * Every track is a gauntlet of road-wide salvage barricades. Each one seals its whole road and only
 * opens for a kart carrying the matching part - a welded plow blade smashes through the debris
 * walls, coil-spring hops clear the ramps. A bare chassis is walled in at the first barricade, so the
 * plow/jump upgrade fantasy is load-bearing: no part, no progress. Each track's drops (see
 * tracks/drops.ts) put the plow blade and coil springs on the centreline BEFORE the first barricade
 * of each type, and never re-offer those slots afterward.
 *
 * `ROUTE_GATES` is Row Six's gauntlet, the corridor every other default is measured on.
 */
export const ROUTE_GATES: readonly RouteGate[] = ROW_SIX_TRACK.gates;

export function gateSatisfied(gate: RouteGate, tuning: KartTuning): boolean {
  return gate.requirement === "plow" ? tuning.hasPlow : tuning.jumpPower > 0;
}

export function inLane(x: number, laneX: readonly [number, number]): boolean {
  return x >= laneX[0] && x <= laneX[1];
}

/** A dropped barricade is only there once its drop time has passed. */
export function gateStanding(gate: RouteGate, time: number): boolean {
  return gate.dropsAt === undefined || time >= gate.dropsAt;
}

/** Springs alone cannot clear a stack: the chassis must actually be above its 0.52m crest. */
export const JUMP_CLEARANCE = 0.65;

function opens(gate: RouteGate, tuning: KartTuning, airHeight: number): boolean {
  return gateSatisfied(gate, tuning) && (gate.requirement === "plow" || airHeight >= JUMP_CLEARANCE);
}

/** Row Six's barricades along one straight line: how far a move from `currentZ` toward `candidateZ` may go. */
export function blockedZ(x: number, currentZ: number, candidateZ: number, tuning: KartTuning, airHeight = 0, gates: readonly RouteGate[] = ROUTE_GATES): number {
  let maxZ = candidateZ;
  for (const gate of gates) {
    if (gate.route !== MAIN_ROUTE) continue;
    if (!inLane(x, gate.laneX)) continue;
    if (currentZ > gate.atZ) continue;
    if (opens(gate, tuning, airHeight)) continue;
    if (candidateZ > gate.atZ) maxZ = Math.min(maxZ, gate.atZ);
  }
  return maxZ;
}

/** What stopped a move along a track: a barricade, or a train on a crossing. */
export interface CourseBlock {
  /** Run metres the move may reach. */
  run: number;
  gate: RouteGate | null;
  train: string | null;
}

/**
 * The same veto on a laid track: a move from `from` to `to` (both course fixes) crosses an unopened
 * barricade or a crossing with a train on it. Gates on another route than the one the kart is on do
 * not apply - that is what a shortcut is.
 */
export function courseBlock(track: Track, from: CourseFix, to: CourseFix, tuning: KartTuning, airHeight: number, time: number): CourseBlock | null {
  const fromRun = track.run(from);
  const toRun = track.run(to);
  if (toRun <= fromRun) return null;
  let block: CourseBlock | null = null;
  for (const gate of track.gates) {
    if (gate.route !== to.route || !gateStanding(gate, time) || opens(gate, tuning, airHeight)) continue;
    if (fromRun > gate.atZ || toRun <= gate.atZ) continue;
    if (block === null || gate.atZ < block.run) block = { run: gate.atZ, gate, train: null };
  }
  for (const span of track.hazardSpans) {
    if (span.kind !== "train" || span.route !== to.route) continue;
    const cycle = span.cycle;
    if (cycle !== undefined) {
      const t = (((time - (cycle.phase ?? 0)) % cycle.period) + cycle.period) % cycle.period;
      if (t >= cycle.active) continue;
    }
    const line = track.course.progressOf(span.route, span.from) - track.origin - 0.4;
    if (fromRun > line || toRun <= line) continue;
    if (block === null || line < block.run) block = { run: line, gate: null, train: span.id };
  }
  return block;
}

export function gatesInZone(zoneId: string, gates: readonly RouteGate[] = ROUTE_GATES): readonly RouteGate[] {
  return gates.filter((gate) => gate.zoneId === zoneId);
}

/** Whether a part, bolted on, is what this barricade asks for. */
export function partOpens(part: DriftFoundryPartDef, need: GateNeed): boolean {
  return need === "plow" ? (part.grants?.plow ?? 0) > 0 : (part.grants?.jumpPower ?? 0) > 0;
}

/** What the sign and the radio tell a driver stopped at a barricade: the call, and how to get through. */
export interface GateAdvice {
  gateId: string;
  /** `run-up`: springs on, not enough air. `go-back`: the part lies behind. `crushed` and `gone`: no part to reach. */
  kind: "run-up" | "go-back" | "crushed" | "gone";
  call: string;
  sub: string;
  /** Run metres of the part the driver should go back for, or null when there is none to reach. */
  partAt: number | null;
}

/** Where the kart stands when a barricade stops it. */
export interface StoppedKart {
  run: number;
  tuning: KartTuning;
  collected: ReadonlySet<string>;
  /** Run metres of the compactor's front. */
  crusherAt: number;
}

/**
 * Why this barricade will not open and how to get through it. Springs that did not lift the kart
 * high enough want a run-up; a missing part is still lying on the road behind unless the crusher has
 * rolled over it, and then the run is lost.
 */
export function gateAdvice(gate: RouteGate, pickups: readonly PickupDef[], kart: StoppedKart): GateAdvice {
  if (gateSatisfied(gate, kart.tuning)) {
    return { gateId: gate.id, kind: "run-up", call: "BACK UP AND HIT IT FASTER", sub: `Springs need ${JUMP_CLEARANCE} m of air: jump on the teal marks at speed`, partAt: null };
  }
  let behind: PickupDef | null = null;
  let crushed: PickupDef | null = null;
  for (const pickup of pickups) {
    const part = partById(pickup.partId);
    if (part === null || !partOpens(part, gate.requirement) || kart.collected.has(pickup.id)) continue;
    if (pickup.at > gate.atZ || (pickup.route !== gate.route && pickup.route !== MAIN_ROUTE)) continue;
    if (pickup.at <= kart.crusherAt) crushed ??= pickup;
    else if (behind === null || pickup.at > behind.at) behind = pickup;
  }
  const label = (gate.requirement === "plow" ? "plow blade" : "coil springs").toUpperCase();
  if (behind !== null) {
    const back = Math.max(0, Math.round(kart.run - behind.at));
    return { gateId: gate.id, kind: "go-back", call: `NO ${label} - ${back}M BACK`, sub: "Reverse onto it before the crusher does", partAt: behind.at };
  }
  return {
    gateId: gate.id,
    kind: crushed !== null ? "crushed" : "gone",
    call: crushed !== null ? `NO ${label} - THE CRUSHER HAS IT` : `NO ${label} ON THIS ROAD`,
    sub: "This wall will not open: restart the run from Settings",
    partAt: null,
  };
}

/** Lowest barricade on the main line the given tuning cannot open, or null if the build clears it. */
export function firstUnsatisfiedGate(tuning: KartTuning, gates: readonly RouteGate[] = ROUTE_GATES): RouteGate | null {
  let earliest: RouteGate | null = null;
  for (const gate of gates) {
    if (gate.route !== MAIN_ROUTE || gateSatisfied(gate, tuning)) continue;
    if (earliest === null || gate.atZ < earliest.atZ) earliest = gate;
  }
  return earliest;
}
