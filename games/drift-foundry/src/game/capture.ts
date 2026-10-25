import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { defineStore } from "@jgengine/core/store/defineStore";

import { readCareer, saveCareer } from "./career";
import { YARD_EVENTS } from "./events/catalog";
import { createRunSession, runSessionStore, type SessionSnapshot } from "./run/session";
import { createCoursePilot, driveCourse, type PilotFrame } from "./testing/courseDriver";
import type { Track } from "./tracks/catalog";

/** Dev-only live autopilot: the course pilot at the wheel, so a capture can film a whole lap. */
interface Autopilot {
  trackId: string;
  take: readonly string[];
  sweep: boolean;
  pilot: ((snap: SessionSnapshot) => PilotFrame) | null;
}
const autopilotStore = defineStore<Autopilot | undefined>("driftAutopilot", undefined);

/** The pilot's controls for this frame, or `null` when nobody engaged it (always, outside dev). */
export function autopilotFrame(ctx: GameContext, snap: SessionSnapshot, track: Track): PilotFrame | null {
  const auto = autopilotStore.peek(ctx);
  if (auto === undefined || snap.phase !== "running" || snap.paused) return null;
  if (auto.pilot === null || auto.trackId !== track.id) {
    auto.trackId = track.id;
    auto.pilot = createCoursePilot(track, { take: auto.take, sweep: auto.sweep });
  }
  return auto.pilot(snap);
}

/** What a staged run should look like when the capture takes it. */
export type StageMode = "midrun" | "result";

/** One simulated step at the frame rate the run is tuned for. */
const STEP = 1 / 60;

export interface StageReadout {
  phase: string;
  track: string;
  runTime: number;
  z: number;
  /** Run metres down the track. */
  run: number;
  speedKmh: number;
  outcome: string;
}

/**
 * Drive the run's own session forward with the throttle pinned, pressing jump for the ramps.
 * The pickups, gates, crusher, damage, rivals and the finish are the real systems: this is the
 * corridor driven quickly, not a pose dropped onto the track.
 */
function drive(ctx: GameContext, seconds: number): void {
  const session = runSessionStore.peek(ctx);
  if (session === undefined) return;
  const axis = { throttle: 1, brake: 0, steer: 0 };
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    session.tick(STEP, axis, { jumpPressed: true, plowBracing: true });
    if (session.snapshot().phase !== "running") return;
  }
}

/** Stage on another event's track: the course driver follows its line, through `take` shortcuts. */
export interface StageCourse {
  event?: string;
  seconds?: number;
  take?: readonly string[];
}

export function stageRun(ctx: GameContext, mode: StageMode, course: StageCourse = {}): void {
  const session = runSessionStore.peek(ctx);
  if (session === undefined) return;
  if (course.event !== undefined) {
    if (!session.selectEvent(course.event).ok) return;
    session.start();
    driveCourse(session, { limit: course.seconds ?? (mode === "midrun" ? 14 : 180), take: course.take ?? [] });
    return;
  }
  session.start();
  // Partway down the corridor the mid-run shot frames the compactor closing; the result shot keeps
  // driving to whatever ending the gauntlet hands the kart.
  drive(ctx, mode === "midrun" ? 14 : 180);
}

export function stageReadout(ctx: GameContext): StageReadout {
  const snapshot = runSessionStore.peek(ctx)?.snapshot();
  return {
    phase: snapshot?.phase ?? "none",
    track: snapshot?.track.id ?? "none",
    runTime: Math.round((snapshot?.runTime ?? 0) * 10) / 10,
    z: Math.round((snapshot?.pose.position[2] ?? 0) * 10) / 10,
    run: Math.round((snapshot?.run ?? 0) * 10) / 10,
    speedKmh: Math.round(snapshot?.pose.speedKmh ?? 0),
    outcome: snapshot?.outcome?.kind ?? "none",
  };
}

/**
 * Dev-only capture staging for the two states that need a driven corridor: a mid-run with the
 * compactor on the kart, and a finished run with its result card. Play reaches both by racing.
 */
export function registerCaptureCommands(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define<{ on?: boolean; take?: readonly string[]; sweep?: boolean; event?: string; openAll?: boolean }>("run.autopilot", {
    apply(state, input) {
      if (input.openAll === true) {
        // A capture profile starts with a blank career; gold on every event opens every tier.
        const career = readCareer(localStorage);
        saveCareer({ ...career, medals: { best: Object.fromEntries(YARD_EVENTS.map((event) => [event.id, event.targets.gold])) } }, localStorage);
        runSessionStore.write(state, createRunSession(state.world.groundHeightAt, undefined, state.game.notices));
      }
      if (input.event !== undefined) {
        const session = runSessionStore.peek(state);
        if (session === undefined || !session.selectEvent(input.event).ok) return state;
        session.start();
      }
      autopilotStore.write(state, input.on === false ? undefined : { trackId: "", take: input.take ?? [], sweep: input.sweep === true, pilot: null });
      return state;
    },
  });
  ctx.game.commands.define<{ mode?: StageMode } & StageCourse>("run.stage", {
    apply(state, input) {
      stageRun(state, input.mode ?? "midrun", input);
      return state;
    },
  });
}
