import { steerToward } from "@jgengine/core/movement/steering";
import { MAIN_ROUTE, type CourseVec2 } from "@jgengine/core/world/routeCourse";

import type { RunSession, SessionSnapshot } from "../run/session";
import { ROW_SIX_TRACK, trackById, type Track } from "../tracks/catalog";

/**
 * A scripted driver for any track, used by the tests and the medal tuning: it follows the course's
 * racing line (through the shortcuts in `take`), lifts for tight corners, hops the jump gates on its
 * route, waits for the freight at a crossing and, with `sweep`, steers onto every drop it passes.
 */
export interface CourseDriveOptions {
  sweep?: boolean;
  /** Brake this many seconds from `stallAt` (default 12 s). */
  stall?: number;
  stallAt?: number;
  /** Shortcut ids to take. */
  take?: readonly string[];
  /** Give up after this many seconds of run clock. */
  limit?: number;
  /** Ignore the crossing lights and drive into the freight. */
  reckless?: boolean;
}

const DT = 1 / 60;
const LINE_STEP = 2;
/** Lateral grip (m/s²) the driver trusts in a corner, and the braking it counts on. */
const CORNER_GRIP = 11;
const BRAKING = 7;

export function sessionTrack(session: RunSession): Track {
  return trackById(session.snapshot().track.id) ?? ROW_SIX_TRACK;
}

function nearestIndex(line: readonly CourseVec2[], x: number, z: number, from: number): number {
  let best = from;
  let bestD = Number.POSITIVE_INFINITY;
  const end = Math.min(line.length, from + 40);
  for (let i = Math.max(0, from - 4); i < end; i += 1) {
    const p = line[i]!;
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function bearing(from: readonly number[], to: CourseVec2): number {
  return Math.atan2(to[0] - from[0]!, to[1] - from[2]!);
}

/** One frame of the pilot's driving: what it holds on the pedals and wheel, and what it presses. */
export interface PilotFrame {
  axis: { throttle: number; brake: number; steer: number };
  input: { jumpPressed: boolean; plowBracing: boolean; salvageSwap: boolean };
}

/**
 * The scripted driver as a per-frame pilot: hand it each snapshot and it answers with the frame's
 * controls. {@link driveCourse} runs it headless; the dev build can put it behind the wheel live.
 */
export function createCoursePilot(track: Track, options: Pick<CourseDriveOptions, "sweep" | "take" | "reckless"> = {}): (snap: SessionSnapshot) => PilotFrame {
  const take = new Set(options.take ?? []);
  const line = track.course.line({ take: [...take], step: LINE_STEP });
  const routes = new Set([MAIN_ROUTE, ...take]);
  const taken = track.def.branches.filter((branch) => take.has(branch.id));
  /** The route this driver is on at a run mark. */
  const routeAt = (run: number): string => taken.find((branch) => run > branch.from && run < branch.to)?.id ?? MAIN_ROUTE;
  let cursor = 0;
  return (snap) => {
    const { position, heading, speedKmh, airborne } = snap.pose;
    const speed = speedKmh / 3.6;
    cursor = nearestIndex(line, position[0], position[2], cursor);
    const look = Math.min(line.length - 1, cursor + Math.max(3, Math.round((4 + speed * 0.35) / LINE_STEP)));
    let target: CourseVec2 = line[look]!;
    if (options.sweep === true) {
      const drop = track.pickups.find((p) => !snap.collectedIds.has(p.id) && p.route === routeAt(p.at) && p.at > snap.run - 4 && p.at < snap.run + 22);
      if (drop !== undefined) target = [drop.position[0], drop.position[2]];
    }
    const steer = Math.max(-1, Math.min(1, steerToward(heading, bearing(position, target)) * 2.2));

    // Brake for what is coming: every corner in the next 40 m caps the speed the kart may carry now.
    let cornerSpeed = Number.POSITIVE_INFINITY;
    for (let j = cursor + 1; j < Math.min(line.length - 2, cursor + Math.round(40 / LINE_STEP)); j += 1) {
      const a = line[j - 1]!;
      const b = line[j]!;
      const c = line[j + 1]!;
      let turn = Math.atan2(c[0] - b[0], c[1] - b[1]) - Math.atan2(b[0] - a[0], b[1] - a[1]);
      turn = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
      if (turn < 1e-4) continue;
      const radius = LINE_STEP / turn;
      const vCorner = Math.sqrt(CORNER_GRIP * radius);
      cornerSpeed = Math.min(cornerSpeed, Math.sqrt(vCorner * vCorner + 2 * BRAKING * (j - cursor) * LINE_STEP));
    }
    let throttle = 1;
    let brake = 0;
    if (speed > cornerSpeed + 1.5) {
      throttle = 0;
      brake = Math.min(1, (speed - cornerSpeed) / 6);
    } else if (speed > cornerSpeed) throttle = 0.2;

    // The freight: stop short of an active crossing, or one that turns red before the kart is over.
    for (const span of track.hazardSpans) {
      if (options.reckless === true || span.kind !== "train" || span.cycle === undefined || !routes.has(span.route)) continue;
      const at = track.course.progressOf(span.route, span.from) - track.origin;
      const ahead = at - snap.run;
      if (ahead < 0 || ahead > 30) continue;
      // Will the crossing stay clear until the kart is over it at a committed pace?
      const pace = Math.max(12, speed);
      const clear = snap.runTime + (ahead + (span.to - span.from) + 3) / pace;
      const { period, active, phase = 0 } = span.cycle;
      const red = (time: number) => (((time - phase) % period) + period) % period < active;
      let redSoon = false;
      for (let time = snap.runTime; time <= clear; time += 0.1) redSoon ||= red(time);
      if (redSoon) {
        throttle = 0;
        brake = ahead < 12 ? 1 : 0.4;
      }
    }

    const next = track.gates.find((gate) => gate.requirement === "jump" && gate.route === snap.route && gate.atZ >= snap.run);
    const jump = next !== undefined && !airborne && next.atZ - snap.run < Math.max(5, speed * 0.5);
    return { axis: { throttle, brake, steer }, input: { jumpPressed: jump, plowBracing: true, salvageSwap: options.sweep === true } };
  };
}

/** Drive the session's run until it ends or `limit` seconds pass. */
export function driveCourse(session: RunSession, options: CourseDriveOptions = {}): void {
  const pilot = createCoursePilot(sessionTrack(session), options);
  const stallAt = options.stallAt ?? 12;
  const stall = options.stall ?? 0;
  const limit = options.limit ?? 150;
  for (let t = 0; t < limit; t += DT) {
    const snap = session.snapshot();
    if (snap.phase !== "running") return;
    if (t > stallAt && t < stallAt + stall) {
      session.tick(DT, { throttle: 0, brake: 1, steer: 0 }, { jumpPressed: false, plowBracing: false });
      continue;
    }
    const frame = pilot(snap);
    session.tick(DT, frame.axis, frame.input);
  }
}
