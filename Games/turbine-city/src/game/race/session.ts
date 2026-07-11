import { createRaceState, firstPastPost, raceTrack, type RaceState } from "@jgengine/core/game/race";
import { createRecordBook, type RecordBook, type RecordDirection } from "@jgengine/core/game/recordBook";
import { createDashState, dashOffset, type DashConfig, type DashState } from "@jgengine/core/movement/dash";
import { createRecordingBuffer, type RecordingBuffer } from "@jgengine/core/sensor/recordingBuffer";
import { windField } from "@jgengine/core/world/wind";

import { fanSpoolState, type FanStage, type FanState } from "../flight/fanSchedule";
import { NO_FLOW, resolveActiveFlow, type Vec3 } from "../flight/flowTube";
import { DEFAULT_GLIDER_TUNING, initialGliderState, resolveSteerInput, rightVector, stepGlider, type GliderInput, type GliderPhysicsState, type RawSteerInput } from "../flight/glider";
import { initialLaminarState, laminarPercent, laminarTier, onRingCrossed, tickLaminar, type LaminarState } from "../flight/laminarStreak";
import { advancePacer, initPacer, type PacerRuntime } from "./pacer";
import { CHECKPOINTS, FANS, FLOW_TUBES, LAPS, RING_COUNT, SPAWN_HEADING, SPAWN_POSITION } from "./route";

export const PLAYER_RACER_ID = "player";
export const PACER_RACER_ID = "pacer";
export const SESSION_STORE_KEY = "session";

export type RacePhase = "start" | "countdown" | "racing" | "finished";
export type RaceOutcome = "win" | "lose" | null;

export type RecordFieldId = "totalTime" | "bestStreak" | "laminarPercent";
export const RECORD_BOOK_KEY = "jgengine:turbine-city:records";
export const RECORD_FIELDS: Readonly<Record<RecordFieldId, RecordDirection>> = {
  totalTime: "lower",
  bestStreak: "higher",
  laminarPercent: "higher",
};

export const COUNTDOWN_SECONDS = 3;
const RACE_TIMEOUT_SECONDS = 320;
const FAN_WARNING_SECONDS = 5;
const TOAST_HOLD_SECONDS = 3.2;
const GHOST_SAMPLE_SECONDS = 0.1;

const DODGE_DASH: DashConfig = {
  distance: 7,
  durationMs: 260,
  iframes: { fromMs: 0, toMs: 0 },
  staminaCost: 1,
  staminaMax: 2,
  staminaRegenPerSecond: 0.45,
  cooldownMs: 400,
};

export const DODGE_MAX_CHARGES = DODGE_DASH.staminaMax;

export interface ControllerToast {
  readonly id: string;
  readonly message: string;
  readonly expiresAt: number;
}

export interface FanReadout {
  readonly id: string;
  readonly power: number;
  readonly stage: FanStage;
  readonly direction: 1 | -1;
  readonly secondsToNextStage: number;
}

export interface RacerPose {
  readonly position: Vec3;
  readonly heading: number;
}

export interface FlowReadout {
  readonly inTube: boolean;
  readonly inCore: boolean;
  readonly centering: number;
  readonly buffet: number;
}

export interface DodgeReadout {
  readonly charges: number;
  readonly maxCharges: number;
  readonly rechargeFraction: number;
}

export interface GhostReadout {
  readonly pose: RacerPose | null;
  readonly bestTime: number | null;
}

export interface RecordsReadout {
  readonly bestTime: number | null;
  readonly bestStreak: number | null;
  readonly bestLaminarPercent: number | null;
  readonly improved: readonly RecordFieldId[];
}

export interface SessionSnapshot {
  readonly phase: RacePhase;
  readonly outcome: RaceOutcome;
  readonly countdown: number;
  readonly lap: number;
  readonly laps: number;
  readonly ringIndex: number;
  readonly ringsTotal: number;
  readonly totalTime: number;
  readonly secondsRemaining: number;
  readonly pacerDelta: number | null;
  readonly playerPose: RacerPose;
  readonly pacerPose: RacerPose;
  readonly playerSpeed: number;
  readonly flow: FlowReadout;
  readonly laminar: { readonly streak: number; readonly best: number; readonly multiplier: number; readonly tierLabel: string; readonly percent: number };
  readonly dodge: DodgeReadout;
  readonly ghost: GhostReadout;
  readonly records: RecordsReadout;
  readonly fans: readonly FanReadout[];
  readonly toast: ControllerToast | null;
  readonly playerFinished: boolean;
  readonly playerPosition: number;
}

export interface RaceSession {
  snapshot(): SessionSnapshot;
  start(): void;
  restart(): void;
  requestDodge(): void;
  tick(dt: number, raw: RawSteerInput, thrustHeld: boolean, brakeHeld: boolean): void;
}

const AMBIENT_WIND = windField({ direction: [0.3, 1], speed: 1.4, gust: 0.7, turbulence: 0.5, seed: "turbine-city-ambient" });

interface GhostFrame {
  readonly position: Vec3;
  readonly heading: number;
}

function fanStatesAt(time: number): Map<string, FanState> {
  const map = new Map<string, FanState>();
  for (const schedule of FANS) map.set(schedule.id, fanSpoolState(schedule, time));
  return map;
}

function fanPowerLookup(states: ReadonlyMap<string, FanState>): (fanId: string) => { power: number; direction: 1 | -1 } {
  return (fanId) => {
    const state = states.get(fanId);
    return state === undefined ? { power: 0, direction: 1 } : { power: state.power, direction: state.direction };
  };
}

function wrapAngle(delta: number): number {
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

export function formatGhostTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

export function createRaceSession(records: RecordBook<RecordFieldId> = createRecordBook({ key: RECORD_BOOK_KEY, fields: RECORD_FIELDS, storage: null })): RaceSession {
  let phase: RacePhase = "start";
  let countdownRemaining = 0;
  let totalTime = 0;
  let outcome: RaceOutcome = null;
  let toast: ControllerToast | null = null;
  let toastCounter = 0;
  let dodgeRequested = false;
  let announcedFanCycles = new Set<string>();
  let wasInCore = false;

  let playerGlider: GliderPhysicsState = initialGliderState(SPAWN_POSITION, SPAWN_HEADING);
  let pacerRuntime: PacerRuntime = initPacer(SPAWN_POSITION, SPAWN_HEADING);
  let laminar: LaminarState = initialLaminarState();
  let raceState: RaceState = newRaceState();

  let dash: DashState = createDashState(DODGE_DASH);
  let dashDir: { x: number; z: number } = { x: 0, z: 0 };
  let dashStartMs: number | null = null;
  let lastDashOffset: readonly [number, number, number] = [0, 0, 0];

  let recorder: RecordingBuffer<GhostFrame> = createRecordingBuffer();
  let ghostSampleTimer = 0;
  let bestGhost: RecordingBuffer<GhostFrame> | null = null;
  let bestGhostTime: number | null = null;
  let playerFinishSeen = false;
  let lastImproved: readonly RecordFieldId[] = [];

  function newRaceState(): RaceState {
    const state = createRaceState({ track: raceTrack({ checkpoints: CHECKPOINTS, laps: LAPS }), win: firstPastPost(2) });
    state.addRacer(PLAYER_RACER_ID, 0);
    state.addRacer(PACER_RACER_ID, 0);
    return state;
  }

  function setToast(message: string, holdSeconds = TOAST_HOLD_SECONDS): void {
    toastCounter += 1;
    toast = { id: `toast-${toastCounter}`, message, expiresAt: totalTime + holdSeconds };
  }

  function beginCountdown(): void {
    phase = "countdown";
    countdownRemaining = COUNTDOWN_SECONDS;
    if (bestGhostTime !== null) setToast(`Racing your shadow — ${formatGhostTime(bestGhostTime)}.`);
  }

  function resetAll(): void {
    totalTime = 0;
    outcome = null;
    toast = null;
    toastCounter = 0;
    dodgeRequested = false;
    announcedFanCycles = new Set<string>();
    wasInCore = false;
    playerGlider = initialGliderState(SPAWN_POSITION, SPAWN_HEADING);
    pacerRuntime = initPacer(SPAWN_POSITION, SPAWN_HEADING);
    laminar = initialLaminarState();
    raceState = newRaceState();
    dash = createDashState(DODGE_DASH);
    dashDir = { x: 0, z: 0 };
    dashStartMs = null;
    lastDashOffset = [0, 0, 0];
    recorder = createRecordingBuffer();
    ghostSampleTimer = 0;
    playerFinishSeen = false;
    lastImproved = [];
  }

  function recordGhostFrame(): void {
    recorder.append(totalTime, { position: playerGlider.position, heading: playerGlider.heading });
  }

  function ghostPoseAt(t: number): RacerPose | null {
    if (bestGhost === null) return null;
    const { before, after } = bestGhost.seekPair(t);
    if (before === null && after === null) return null;
    if (before === null) return { position: after!.data.position, heading: after!.data.heading };
    if (after === null) return { position: before.data.position, heading: before.data.heading };
    const span = after.t - before.t;
    const f = span <= 0 ? 0 : (t - before.t) / span;
    const position: Vec3 = [
      before.data.position[0] + (after.data.position[0] - before.data.position[0]) * f,
      before.data.position[1] + (after.data.position[1] - before.data.position[1]) * f,
      before.data.position[2] + (after.data.position[2] - before.data.position[2]) * f,
    ];
    return { position, heading: before.data.heading + wrapAngle(after.data.heading - before.data.heading) * f };
  }

  function onPlayerFinished(): void {
    playerFinishSeen = true;
    const progress = raceState.progressOf(PLAYER_RACER_ID);
    const finishTime = progress?.splits[progress.splits.length - 1] ?? totalTime;
    recordGhostFrame();
    if (bestGhostTime === null || finishTime < bestGhostTime) {
      bestGhostTime = finishTime;
      const playback = createRecordingBuffer<GhostFrame>();
      for (const frame of recorder.frames()) playback.append(frame.t, frame.data);
      bestGhost = playback;
    }
    lastImproved = records.submit({ totalTime: finishTime, bestStreak: laminar.best, laminarPercent: laminarPercent(laminar) }).improved;
  }

  function evaluateFanCallouts(states: ReadonlyMap<string, FanState>): void {
    for (const schedule of FANS) {
      const state = states.get(schedule.id);
      if (state === undefined) continue;
      const cycleIndex = Math.floor((totalTime + schedule.phaseOffset) / state.cycleSeconds);
      const key = `${schedule.id}:${cycleIndex}`;
      if (state.stage === "on" && state.secondsToNextStage <= FAN_WARNING_SECONDS && !announcedFanCycles.has(key)) {
        announcedFanCycles.add(key);
        const label = schedule.id.replace("fan-", "").toUpperCase();
        setToast(`Fan ${label} spools down in five.`);
      }
    }
  }

  function tickDodge(steerYaw: number, nowMs: number): void {
    if (dodgeRequested) {
      const sign = steerYaw !== 0 ? Math.sign(steerYaw) : 1;
      const right = rightVector(playerGlider.heading);
      const burst = dash.tryDash({ x: right[0] * sign, z: right[2] * sign }, nowMs);
      if (!("reason" in burst)) {
        dashDir = burst.direction;
        dashStartMs = nowMs;
        lastDashOffset = [0, 0, 0];
      }
    }
    dodgeRequested = false;
    if (dashStartMs === null) return;
    const elapsedMs = Math.min(nowMs - dashStartMs, DODGE_DASH.durationMs);
    const offset = dashOffset(DODGE_DASH, dashDir, elapsedMs);
    playerGlider = {
      ...playerGlider,
      position: [
        playerGlider.position[0] + offset[0] - lastDashOffset[0],
        playerGlider.position[1],
        playerGlider.position[2] + offset[2] - lastDashOffset[2],
      ],
    };
    lastDashOffset = offset;
    if (elapsedMs >= DODGE_DASH.durationMs) dashStartMs = null;
  }

  return {
    snapshot(): SessionSnapshot {
      const states = fanStatesAt(totalTime);
      const flow = resolveActiveFlow(FLOW_TUBES, fanPowerLookup(states), playerGlider.position) ?? NO_FLOW;
      const centering = flow.inTube ? Math.max(0, 1 - flow.radialDistance / 11) : 0;
      const playerProgress = raceState.progressOf(PLAYER_RACER_ID);
      const pacerProgress = raceState.progressOf(PACER_RACER_ID);
      let pacerDelta: number | null = null;
      if (playerProgress !== null && pacerProgress !== null) {
        const common = Math.min(playerProgress.splits.length, pacerProgress.splits.length);
        if (common > 0) pacerDelta = playerProgress.splits[common - 1]! - pacerProgress.splits[common - 1]!;
      }
      const tier = laminarTier(laminar);
      const stamina = dash.stamina();
      const charges = Math.floor(stamina);
      const ghostVisible = phase === "countdown" || phase === "racing";
      const best = records.best();
      return {
        phase,
        outcome,
        countdown: countdownRemaining,
        lap: playerProgress?.lap ?? 1,
        laps: LAPS,
        ringIndex: playerProgress?.nextCheckpoint ?? 0,
        ringsTotal: RING_COUNT,
        totalTime,
        secondsRemaining: Math.max(0, RACE_TIMEOUT_SECONDS - totalTime),
        pacerDelta,
        playerPose: { position: playerGlider.position, heading: playerGlider.heading },
        pacerPose: { position: pacerRuntime.glider.position, heading: pacerRuntime.glider.heading },
        playerSpeed: Math.hypot(playerGlider.velocity[0], playerGlider.velocity[1], playerGlider.velocity[2]),
        flow: { inTube: flow.inTube, inCore: flow.inCore, centering, buffet: flow.buffet },
        laminar: { streak: laminar.streak, best: laminar.best, multiplier: tier.multiplier, tierLabel: tier.label, percent: laminarPercent(laminar) },
        dodge: { charges, maxCharges: DODGE_MAX_CHARGES, rechargeFraction: charges >= DODGE_MAX_CHARGES ? 1 : stamina - charges },
        ghost: { pose: ghostVisible ? ghostPoseAt(phase === "countdown" ? 0 : totalTime) : null, bestTime: bestGhostTime },
        records: { bestTime: best.totalTime ?? null, bestStreak: best.bestStreak ?? null, bestLaminarPercent: best.laminarPercent ?? null, improved: lastImproved },
        fans: FANS.map((schedule) => {
          const state = states.get(schedule.id)!;
          return { id: schedule.id, power: state.power, stage: state.stage, direction: state.direction, secondsToNextStage: state.secondsToNextStage };
        }),
        toast,
        playerFinished: playerProgress?.finished ?? false,
        playerPosition: playerProgress?.position ?? 1,
      };
    },
    start() {
      if (phase !== "start") return;
      beginCountdown();
    },
    restart() {
      resetAll();
      beginCountdown();
    },
    requestDodge() {
      dodgeRequested = true;
    },
    tick(dt, raw, thrustHeld, brakeHeld) {
      if (phase === "countdown") {
        countdownRemaining -= dt;
        if (countdownRemaining <= 0) {
          countdownRemaining = 0;
          phase = "racing";
          setToast("Cleared for departure. Hold your line.");
          recordGhostFrame();
        }
        return;
      }
      if (phase !== "racing") return;
      totalTime += dt;

      const states = fanStatesAt(totalTime);
      const lookup = fanPowerLookup(states);
      const ambient = AMBIENT_WIND.at(totalTime);

      const flow = resolveActiveFlow(FLOW_TUBES, lookup, playerGlider.position) ?? NO_FLOW;
      const steer = resolveSteerInput(raw);
      const input: GliderInput = { yaw: steer.yaw, pitch: steer.pitch, thrust: thrustHeld ? 1 : 0, brake: brakeHeld ? 1 : 0 };

      playerGlider = stepGlider(playerGlider, input, flow, ambient, dt, totalTime, DEFAULT_GLIDER_TUNING);
      const nowMs = totalTime * 1000;
      dash.tick(dt, nowMs);
      tickDodge(steer.yaw, nowMs);
      laminar = tickLaminar(laminar, flow.inCore, dt);

      if (flow.inCore && !wasInCore) setToast("You're in the core — hold her steady.");
      if (!flow.inTube && wasInCore) setToast("Edge turbulence — streak shattered.");
      wasInCore = flow.inCore;

      if (!playerFinishSeen) {
        ghostSampleTimer += dt;
        if (ghostSampleTimer >= GHOST_SAMPLE_SECONDS) {
          ghostSampleTimer -= GHOST_SAMPLE_SECONDS;
          recordGhostFrame();
        }
      }

      const pacerAdvance = advancePacer(pacerRuntime, dt, totalTime, lookup, states, ambient);
      pacerRuntime = pacerAdvance.runtime;

      const positions: Record<string, Vec3> = {
        [PLAYER_RACER_ID]: playerGlider.position,
        [PACER_RACER_ID]: pacerAdvance.position,
      };
      const events = raceState.update(totalTime, positions);
      for (const event of events) {
        if (event.type === "checkpoint.hit" && event.racerId === PLAYER_RACER_ID) {
          laminar = onRingCrossed(laminar, flow.inCore);
          setToast(`Ring ${event.checkpoint + 1} of ${RING_COUNT} locked.`);
        }
        if (event.type === "lap.completed" && event.racerId === PLAYER_RACER_ID) {
          setToast(`Lap ${event.lap + 1} — hold your line.`);
        }
        if (event.type === "race.finished") {
          outcome = event.ranking[0] === PLAYER_RACER_ID ? "win" : "lose";
          phase = "finished";
        }
      }

      if (!playerFinishSeen && raceState.progressOf(PLAYER_RACER_ID)?.finished === true) onPlayerFinished();

      evaluateFanCallouts(states);

      if (toast !== null && totalTime > toast.expiresAt) toast = null;

      if (phase === "racing" && totalTime > RACE_TIMEOUT_SECONDS) {
        outcome = "lose";
        phase = "finished";
        raceState.eliminate(PLAYER_RACER_ID);
        if (!playerFinishSeen) {
          lastImproved = records.submit({ bestStreak: laminar.best, laminarPercent: laminarPercent(laminar) }).improved;
        }
      }
    },
  };
}
