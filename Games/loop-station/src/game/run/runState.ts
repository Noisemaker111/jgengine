import { createRaceState } from "@jgengine/core/game/race";
import { createRecordingBuffer } from "@jgengine/core/sensor/recordingBuffer";

import { ghostColor } from "../track/palette";
import {
  applyLateral,
  buildLap,
  distance3,
  lapLength,
  MAIN_LANES,
  sampleAtDistance,
  zoneRange,
  BASE_SPEED,
  COLLISION_RADIUS,
  TRACK_SEED,
} from "../track/geometry";
import { TRACK } from "../track/checkpoints";
import { ghostPositionAt } from "./ghosts";
import {
  BRAKE_MULT,
  GHOST_CAP,
  GHOST_SPAWN_GRACE_SECONDS,
  JUMP_WINDOW_PAD,
  NEUTRAL_INPUT,
  PACE_MAX,
  PACE_MIN,
  PACE_RATE,
  STEER_RATE,
  type GhostFrameData,
  type GhostRecord,
  type RunEvent,
  type RunInputState,
  type RunPhase,
  type RunState,
} from "./types";

export const PLAYER_RACER_ID = "player";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function initialPosition(): GhostFrameData {
  const sample = applyLateral(sampleAtDistance(buildLap(MAIN_LANES), 0), 0);
  return { x: sample.x, y: sample.y, z: sample.z, headingRad: sample.headingRad, s: 0 };
}

export function freshRunState(prev: RunState | null, phase: RunPhase, now: number): RunState {
  const race = createRaceState({ track: TRACK });
  race.addRacer(PLAYER_RACER_ID, now);
  return {
    phase,
    seed: TRACK_SEED,
    d: 0,
    paceMultiplier: 1,
    lateral: 0,
    laneA: "main",
    laneB: "main",
    forkADecided: false,
    forkBDecided: false,
    jumpWindowActive: false,
    jumpedThisPass: false,
    lapIndex: 1,
    lapStartTime: now,
    now,
    liveRecorder: createRecordingBuffer<GhostFrameData>(),
    previousLapFrames: null,
    previousLapDuration: null,
    ghosts: [],
    tape: [],
    best: prev?.best ?? null,
    bestLapsSurvived: prev?.bestLapsSurvived ?? 0,
    death: null,
    position: initialPosition(),
    prevInput: NEUTRAL_INPUT,
    race,
  };
}

export function recomputeFaded(ghosts: readonly GhostRecord[]): { ghosts: GhostRecord[]; justFaded: GhostRecord | null } {
  let justFaded: GhostRecord | null = null;
  const next = ghosts.map((ghost, index) => {
    const fromEnd = ghosts.length - 1 - index;
    const faded = fromEnd >= GHOST_CAP;
    if (faded && !ghost.faded) justFaded = ghost;
    return faded === ghost.faded ? ghost : { ...ghost, faded };
  });
  return { ghosts: next, justFaded };
}

function stepRunning(state: RunState, input: RunInputState, dt: number, now: number): { state: RunState; events: RunEvent[] } {
  const steer = input.steerLeft ? -1 : input.steerRight ? 1 : 0;
  const lateral = clamp(state.lateral + steer * STEER_RATE * dt, -1, 1);

  let paceMultiplier = state.paceMultiplier;
  if (input.throttleUp) paceMultiplier += PACE_RATE * dt;
  if (input.throttleDown) paceMultiplier -= PACE_RATE * dt;
  paceMultiplier = clamp(paceMultiplier, PACE_MIN, PACE_MAX);

  const speed = BASE_SPEED * paceMultiplier * (input.brake ? BRAKE_MULT : 1);
  const newDRaw = state.d + speed * dt;

  let laneA = state.laneA;
  let laneB = state.laneB;
  let forkADecided = state.forkADecided;
  let forkBDecided = state.forkBDecided;

  let segments = buildLap({ forkA: laneA, forkB: laneB });
  const forkAZone = zoneRange(segments, "forkA")!;
  if (!forkADecided && state.d < forkAZone.start && newDRaw >= forkAZone.start) {
    laneA = lateral < -0.35 ? "branch" : "main";
    forkADecided = true;
    segments = buildLap({ forkA: laneA, forkB: laneB });
  }
  const forkBZone = zoneRange(segments, "forkB")!;
  if (!forkBDecided && state.d < forkBZone.start && newDRaw >= forkBZone.start) {
    laneB = lateral < -0.35 ? "branch" : "main";
    forkBDecided = true;
    segments = buildLap({ forkA: laneA, forkB: laneB });
  }

  const total = lapLength(segments);
  const rampZone = zoneRange(segments, "rampUp")!;
  const windowStart = rampZone.start - JUMP_WINDOW_PAD;
  const windowEnd = rampZone.end + JUMP_WINDOW_PAD;

  let jumpWindowActive = state.jumpWindowActive;
  let jumpedThisPass = state.jumpedThisPass;
  const enteringWindow = state.d < windowStart && newDRaw >= windowStart;
  const exitingWindow = state.d < windowEnd && newDRaw >= windowEnd;
  if (enteringWindow) {
    jumpWindowActive = true;
    jumpedThisPass = false;
  }
  if (jumpWindowActive && input.jumpHop) jumpedThisPass = true;

  const sample = applyLateral(sampleAtDistance(segments, newDRaw), lateral);
  const s = total <= 0 ? 0 : Math.min(newDRaw, total) / total;
  const position: GhostFrameData = { x: sample.x, y: sample.y, z: sample.z, headingRad: sample.headingRad, s };

  const events: RunEvent[] = [];

  if (exitingWindow && jumpWindowActive && !jumpedThisPass) {
    events.push({ type: "death", reason: "gate", ghostLap: null });
    return {
      state: {
        ...state,
        phase: "ended",
        death: { reason: "gate", ghostLap: null },
        position,
        prevInput: input,
        now,
        jumpWindowActive: false,
        bestLapsSurvived: Math.max(state.bestLapsSurvived, state.tape.length),
      },
      events,
    };
  }
  if (exitingWindow) jumpWindowActive = false;

  for (const ghost of state.ghosts) {
    if (ghost.faded) continue;
    if (now - ghost.startTime < GHOST_SPAWN_GRACE_SECONDS) continue;
    const ghostPos = ghostPositionAt(ghost, now);
    if (ghostPos === null) continue;
    if (distance3(position, ghostPos) <= COLLISION_RADIUS) {
      events.push({ type: "death", reason: "ghost", ghostLap: ghost.lapIndex });
      return {
        state: {
          ...state,
          phase: "ended",
          death: { reason: "ghost", ghostLap: ghost.lapIndex },
          position,
          prevInput: input,
          now,
          bestLapsSurvived: Math.max(state.bestLapsSurvived, state.tape.length),
        },
        events,
      };
    }
  }

  const liveRecorder = state.liveRecorder;
  liveRecorder.append(now - state.lapStartTime, position);

  const raceEvents = state.race.update(now, { [PLAYER_RACER_ID]: [position.x, position.y, position.z] });
  const lapCompleted = raceEvents.some((event) => event.type === "lap.completed");

  if (lapCompleted) {
    const lapDuration = liveRecorder.duration();
    const frames = liveRecorder.frames();
    const buffer = createRecordingBuffer<GhostFrameData>();
    for (const frame of frames) buffer.append(frame.t, frame.data);
    const newGhost: GhostRecord = {
      id: `ghost-${state.lapIndex}`,
      lapIndex: state.lapIndex,
      color: ghostColor(state.lapIndex),
      startTime: now,
      lapDuration,
      buffer,
      faded: false,
    };
    const { ghosts, justFaded } = recomputeFaded([...state.ghosts, newGhost]);
    if (justFaded !== null) events.push({ type: "ghost.faded", lapIndex: justFaded.lapIndex });
    events.push({ type: "lap.completed", lapIndex: state.lapIndex, duration: lapDuration });

    return {
      state: {
        ...state,
        d: 0,
        paceMultiplier,
        lateral,
        laneA: "main",
        laneB: "main",
        forkADecided: false,
        forkBDecided: false,
        jumpWindowActive: false,
        jumpedThisPass: false,
        lapIndex: state.lapIndex + 1,
        lapStartTime: now,
        now,
        liveRecorder: createRecordingBuffer<GhostFrameData>(),
        previousLapFrames: frames,
        previousLapDuration: lapDuration,
        ghosts,
        tape: [...state.tape, { lapIndex: state.lapIndex, duration: lapDuration, laneA, laneB }],
        best: state.best === null ? lapDuration : Math.min(state.best, lapDuration),
        position,
        prevInput: input,
      },
      events,
    };
  }

  return {
    state: {
      ...state,
      d: Math.min(newDRaw, total),
      paceMultiplier,
      lateral,
      laneA,
      laneB,
      forkADecided,
      forkBDecided,
      jumpWindowActive,
      jumpedThisPass,
      position,
      prevInput: input,
      now,
    },
    events,
  };
}

export function stepRun(state: RunState, input: RunInputState, dt: number, now: number): { state: RunState; events: RunEvent[] } {
  const started = input.start && !state.prevInput.start;
  const restarted = input.restart && !state.prevInput.restart;

  if (restarted) {
    return { state: freshRunState(state, "start", now), events: [] };
  }

  if (state.phase === "start") {
    if (started) return { state: freshRunState(state, "running", now), events: [] };
    return { state: { ...state, prevInput: input, now }, events: [] };
  }

  if (state.phase === "ended") {
    if (started) return { state: freshRunState(state, "running", now), events: [] };
    return { state: { ...state, prevInput: input, now }, events: [] };
  }

  return stepRunning(state, input, dt, now);
}
