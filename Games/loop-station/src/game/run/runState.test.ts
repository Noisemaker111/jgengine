import { describe, expect, test } from "bun:test";
import { createRecordingBuffer } from "@jgengine/core/sensor/recordingBuffer";

import { COLLISION_RADIUS, zoneRange, buildLap, MAIN_LANES } from "../track/geometry";
import { freshRunState, recomputeFaded, stepRun } from "./runState";
import { NEUTRAL_INPUT, type GhostFrameData, type GhostRecord, type RunInputState, type RunState } from "./types";

const DT = 0.25;

function input(overrides: Partial<RunInputState>): RunInputState {
  return { ...NEUTRAL_INPUT, ...overrides };
}

function drive(state: RunState, overrides: Partial<RunInputState>, ticks: number, now0: number): { state: RunState; now: number } {
  let current = state;
  let now = now0;
  for (let i = 0; i < ticks; i += 1) {
    now += DT;
    const jumpHop = overrides.jumpHop === true;
    const result = stepRun(current, input({ ...overrides, jumpHop }), DT, now);
    current = result.state;
  }
  return { state: current, now };
}

function startRunning(now0 = 0): { state: RunState; now: number } {
  const start = freshRunState(null, "start", now0);
  const { state } = stepRun(start, input({ start: true }), DT, now0 + DT);
  return { state, now: now0 + DT };
}

function driveOneLap(state: RunState, now0: number, overrides: Partial<RunInputState> = {}): { state: RunState; now: number } {
  let current = state;
  let now = now0;
  const startLapIndex = current.lapIndex;
  let guard = 0;
  while (current.lapIndex === startLapIndex && guard < 4000) {
    now += DT;
    const result = stepRun(current, input(overrides), DT, now);
    current = result.state;
    guard += 1;
  }
  return { state: current, now };
}

describe("run state — lap lifecycle", () => {
  test("start phase only transitions to running on the start edge", () => {
    const state = freshRunState(null, "start", 0);
    const held = stepRun(state, input({}), DT, DT).state;
    expect(held.phase).toBe("start");
    const started = stepRun(state, input({ start: true }), DT, DT).state;
    expect(started.phase).toBe("running");
  });

  test("driving a full lap records a ghost and clears the live recorder", () => {
    const { state, now } = startRunning();
    const { state: afterLap } = driveOneLap(state, now, { jumpHop: true });
    expect(afterLap.lapIndex).toBe(2);
    expect(afterLap.tape.length).toBe(1);
    expect(afterLap.ghosts.length).toBe(1);
    expect(afterLap.ghosts[0]!.lapDuration).toBeGreaterThan(0);
    expect(afterLap.liveRecorder.frames().length).toBe(0);
    expect(afterLap.best).toBeCloseTo(afterLap.tape[0]!.duration, 5);
  });

  test("recording fidelity: ghost frames replay to the same positions at the same lap-relative times", () => {
    const { state, now } = startRunning();
    const { state: afterLap } = driveOneLap(state, now, { jumpHop: true });
    const ghost = afterLap.ghosts[0]!;
    const frames = ghost.buffer.frames();
    expect(frames.length).toBeGreaterThan(10);
    for (const frame of frames.slice(0, 5)) {
      const replayed = ghost.buffer.seek(frame.t);
      expect(replayed).not.toBeNull();
      expect(replayed!.data.x).toBeCloseTo(frame.data.x, 6);
      expect(replayed!.data.y).toBeCloseTo(frame.data.y, 6);
      expect(replayed!.data.z).toBeCloseTo(frame.data.z, 6);
    }
  });

  test("missing the over/under jump gate ends the run", () => {
    const { state, now } = startRunning();
    const segments = buildLap(MAIN_LANES);
    const rampZone = zoneRange(segments, "rampUp")!;
    const distanceToRamp = rampZone.start - 5;
    const ticksToRamp = Math.floor(distanceToRamp / (4.5 * DT));
    const { state: nearRamp, now: nowAtRamp } = drive(state, {}, ticksToRamp, now);
    expect(nearRamp.phase).toBe("running");
    const { state: afterGate } = drive(nearRamp, {}, 60, nowAtRamp);
    expect(afterGate.phase).toBe("ended");
    expect(afterGate.death?.reason).toBe("gate");
  });

  test("jumping inside the over/under window survives the gate", () => {
    const { state, now } = startRunning();
    const segments = buildLap(MAIN_LANES);
    const rampZone = zoneRange(segments, "rampUp")!;
    const distanceToRamp = rampZone.start - 5;
    const ticksToRamp = Math.floor(distanceToRamp / (4.5 * DT));
    const { state: nearRamp, now: nowAtRamp } = drive(state, {}, ticksToRamp, now);
    const { state: afterGate } = drive(nearRamp, { jumpHop: true }, 60, nowAtRamp);
    expect(afterGate.death).toBeNull();
  });

  test("steering left through fork A takes the longer branch and records it on the tape", () => {
    const { state, now } = startRunning();
    const { state: afterLap } = driveOneLap(state, now, { steerLeft: true, jumpHop: true });
    expect(afterLap.tape[0]!.laneA).toBe("branch");
  });

  test("restart purity: ghosts, tape, and the live recorder all clear on restart", () => {
    const { state, now } = startRunning();
    const { state: afterLap, now: afterLapNow } = driveOneLap(state, now, { jumpHop: true });
    expect(afterLap.ghosts.length).toBeGreaterThan(0);
    const restarted = stepRun(afterLap, input({ restart: true }), DT, afterLapNow + DT).state;
    expect(restarted.phase).toBe("start");
    expect(restarted.ghosts.length).toBe(0);
    expect(restarted.tape.length).toBe(0);
    expect(restarted.liveRecorder.frames().length).toBe(0);
    expect(restarted.d).toBe(0);
  });

  test("death records the laps-survived score, and restart preserves it as the session best", () => {
    const { state, now } = startRunning();
    const { state: afterLap, now: afterLapNow } = driveOneLap(state, now, { jumpHop: true });
    const { state: afterGate } = drive(afterLap, {}, 200, afterLapNow);
    expect(afterGate.phase).toBe("ended");
    expect(afterGate.bestLapsSurvived).toBeGreaterThanOrEqual(1);
    const restarted = stepRun(afterGate, input({ restart: true }), DT, afterLapNow + DT).state;
    expect(restarted.bestLapsSurvived).toBe(afterGate.bestLapsSurvived);
  });

  test("collision tolerance: a ghost within the collision radius ends the run, naming its lap", () => {
    const { state, now } = startRunning();
    const buffer = createRecordingBuffer<GhostFrameData>();
    buffer.append(0, { ...state.position });
    const closeGhost: GhostRecord = {
      id: "ghost-3",
      lapIndex: 3,
      color: "#e83d84",
      startTime: now - 5,
      lapDuration: 45,
      buffer,
      faded: false,
    };
    const withGhost: RunState = { ...state, ghosts: [closeGhost] };
    const result = stepRun(withGhost, input({}), DT, now + DT);
    expect(result.state.phase).toBe("ended");
    expect(result.state.death?.reason).toBe("ghost");
    expect(result.state.death?.ghostLap).toBe(3);
  });

  test("collision tolerance: a ghost well outside the collision radius does not end the run", () => {
    const { state, now } = startRunning();
    const buffer = createRecordingBuffer<GhostFrameData>();
    buffer.append(0, { ...state.position, x: state.position.x + COLLISION_RADIUS * 10, z: state.position.z + COLLISION_RADIUS * 10 });
    const farGhost: GhostRecord = {
      id: "ghost-3",
      lapIndex: 3,
      color: "#e83d84",
      startTime: now - 5,
      lapDuration: 45,
      buffer,
      faded: false,
    };
    const withGhost: RunState = { ...state, ghosts: [farGhost] };
    const result = stepRun(withGhost, input({}), DT, now + DT);
    expect(result.state.phase).toBe("running");
  });

  test("two consecutive clean laps each record their own ghost", () => {
    const { state, now } = startRunning();
    const { state: afterLap1, now: now1 } = driveOneLap(state, now, { jumpHop: true, throttleUp: true, steerRight: true });
    expect(afterLap1.phase).toBe("running");
    const { state: afterLap2 } = driveOneLap(afterLap1, now1, { jumpHop: true, throttleDown: true, steerLeft: true });
    expect(afterLap2.phase).toBe("running");
    expect(afterLap2.ghosts.length).toBe(2);
    expect(afterLap2.tape.length).toBe(2);
    expect(afterLap2.ghosts.map((g) => g.lapIndex)).toEqual([1, 2]);
  });

  test("ghost cap: past 12 ghosts the oldest fades and stops being collidable", () => {
    const ghosts: GhostRecord[] = Array.from({ length: 13 }, (_, index) => ({
      id: `ghost-${index + 1}`,
      lapIndex: index + 1,
      color: "#e83d84",
      startTime: 0,
      lapDuration: 45,
      buffer: createRecordingBuffer<GhostFrameData>(),
      faded: false,
    }));
    const { ghosts: recomputed, justFaded } = recomputeFaded(ghosts);
    expect(recomputed.length).toBe(13);
    const fadedCount = recomputed.filter((g) => g.faded).length;
    const activeCount = recomputed.filter((g) => !g.faded).length;
    expect(fadedCount).toBe(1);
    expect(activeCount).toBe(12);
    expect(recomputed[0]!.faded).toBe(true);
    expect(recomputed[recomputed.length - 1]!.faded).toBe(false);
    expect(justFaded?.lapIndex).toBe(1);
  });

  test("recomputeFaded is a no-op once faded state is already correct", () => {
    const twelve: GhostRecord[] = Array.from({ length: 12 }, (_, index) => ({
      id: `ghost-${index + 1}`,
      lapIndex: index + 1,
      color: "#e83d84",
      startTime: 0,
      lapDuration: 45,
      buffer: createRecordingBuffer<GhostFrameData>(),
      faded: false,
    }));
    const { justFaded } = recomputeFaded(twelve);
    expect(justFaded).toBeNull();
  });
});
