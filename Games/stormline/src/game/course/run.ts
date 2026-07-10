import { clampAxis, rampToward } from "@jgengine/core/input/axisInput";
import type { RaceEvent } from "@jgengine/core/game/race";
import { resolveWeather, type WeatherModifierTable } from "@jgengine/core/world/weather";

import { FORK_LOCK_LANE, FORK_WARN_OFFSET, FORKS, GATES } from "./catalog";
import { advanceExposure } from "./exposure";
import { isStrikeActive, strikeHitsProgress } from "./strikes";
import { frontProgressAt, stormPhaseAt } from "./storm";
import {
  forkLockLine,
  forkWarnLine,
  gateLine,
  leadCriticalLine,
  loseLine,
  lullStartLine,
  phaseLine,
  strikeHitLine,
  winLine,
  type ForkChoice,
  type RunEvent,
} from "./radio";

export const MAX_SPEED = 32;
export const ACCEL = 14;
export const BRAKE_DECEL = 22;
export const HANDBRAKE_DECEL = 34;
export const COAST_DECEL = 5;
export const STALL_DECEL = 40;
export const LANE_RATE_NORMAL = 1.5;
export const LANE_RATE_DRIFT = 2.4;
export const STALL_SECONDS = 3;
export const LEAD_CRITICAL_METERS = 40;
export const LOG_LIMIT = 8;

export const GRIP_TABLE: WeatherModifierTable = {
  clear: { grip: 1 },
  stormband: { grip: 0.8 },
};

export type RunStatus = "ready" | "playing" | "won" | "lost";

export interface RunInput {
  readonly throttle: boolean;
  readonly brake: boolean;
  readonly steerLeft: boolean;
  readonly steerRight: boolean;
  readonly handbrake: boolean;
}

export const NEUTRAL_RUN_INPUT: RunInput = {
  throttle: false,
  brake: false,
  steerLeft: false,
  steerRight: false,
  handbrake: false,
};

export interface GateSplit {
  readonly gate: number;
  readonly time: number;
}

export interface RunState {
  readonly status: RunStatus;
  readonly now: number;
  readonly progress: number;
  readonly speed: number;
  readonly lane: number;
  readonly bankedBonus: number;
  readonly exposure: number;
  readonly stalledUntil: number;
  readonly forkChoices: Readonly<Record<number, ForkChoice>>;
  readonly struckZoneIds: readonly string[];
  readonly gatesPassed: number;
  readonly gateSplits: readonly GateSplit[];
  readonly minLead: number;
  readonly log: readonly RunEvent[];
  readonly logSeq: number;
  readonly loseGate: number | null;
  readonly finishedAt: number | null;
}

export function initialRunState(): RunState {
  return {
    status: "ready",
    now: 0,
    progress: 0,
    speed: 0,
    lane: 0,
    bankedBonus: 0,
    exposure: 0,
    stalledUntil: -1,
    forkChoices: {},
    struckZoneIds: [],
    gatesPassed: 0,
    gateSplits: [],
    minLead: Number.POSITIVE_INFINITY,
    log: [],
    logSeq: 0,
    loseGate: null,
    finishedAt: null,
  };
}

export function startRun(): RunState {
  return { ...initialRunState(), status: "playing" };
}

export function currentLead(progress: number, bankedBonus: number, now: number): number {
  return progress + bankedBonus - frontProgressAt(now);
}

export function laneGrip(lane: number): number {
  const kind = lane < 0 ? "stormband" : "clear";
  const intensity = Math.max(0, Math.min(1, -lane));
  return resolveWeather({ kind, intensity }, GRIP_TABLE).grip;
}

export function advanceRun(state: RunState, input: RunInput, dt: number): RunState {
  if (state.status !== "playing" || dt <= 0) return state;
  const now = state.now + dt;
  const nowMs = now * 1000;

  const laneTarget = (input.steerLeft ? -1 : 0) + (input.steerRight ? 1 : 0);
  const laneRate = input.handbrake ? LANE_RATE_DRIFT : LANE_RATE_NORMAL;
  const lane = clampAxis(rampToward(state.lane, laneTarget, laneRate, dt), { min: -1, max: 1 });

  const grip = laneGrip(lane);
  const effectiveMax = MAX_SPEED * grip;
  const stalled = now < state.stalledUntil;

  let speed = state.speed;
  if (stalled) speed = rampToward(speed, 0, STALL_DECEL, dt);
  else if (input.handbrake) speed = rampToward(speed, 0, HANDBRAKE_DECEL, dt);
  else if (input.brake) speed = rampToward(speed, 0, BRAKE_DECEL, dt);
  else if (input.throttle) speed = rampToward(speed, effectiveMax, ACCEL, dt);
  else speed = rampToward(speed, 0, COAST_DECEL, dt);
  speed = Math.max(0, Math.min(effectiveMax, speed));

  const oldProgress = state.progress;
  const progress = oldProgress + speed * dt;

  let bankedBonus = state.bankedBonus;
  let forkChoices = state.forkChoices;
  let struckZoneIds = state.struckZoneIds;
  let stalledUntil = state.stalledUntil;
  let logSeq = state.logSeq;
  const events: RunEvent[] = [];

  function pushEvent(kind: RunEvent["kind"], text: string): void {
    logSeq += 1;
    events.push({ id: `evt-${logSeq}`, at: now, kind, text });
  }

  for (const fork of FORKS) {
    const existing = forkChoices[fork.index];
    if (existing !== undefined) continue;
    const warnAt = fork.forkProgress - FORK_WARN_OFFSET;
    if (oldProgress < warnAt && progress >= warnAt) {
      pushEvent("forkWarn", forkWarnLine(fork));
    }
    if (oldProgress < fork.forkProgress && progress >= fork.forkProgress) {
      const choice: ForkChoice = lane <= FORK_LOCK_LANE ? "fast" : "safe";
      forkChoices = { ...forkChoices, [fork.index]: choice };
      if (choice === "fast") bankedBonus += fork.bonusMeters;
      pushEvent("forkLock", forkLockLine(fork, choice));
    }
  }

  for (const fork of FORKS) {
    if (forkChoices[fork.index] !== "fast") continue;
    if (progress < fork.forkProgress || progress > fork.gateProgress) continue;
    for (const zone of fork.hazards) {
      if (struckZoneIds.includes(zone.id)) continue;
      if (isStrikeActive(zone, nowMs) && strikeHitsProgress(zone, progress)) {
        struckZoneIds = [...struckZoneIds, zone.id];
        stalledUntil = now + STALL_SECONDS;
        pushEvent("strikeHit", strikeHitLine(fork));
      }
    }
  }

  const front = frontProgressAt(now);
  const lead = progress + bankedBonus - front;
  const minLead = Math.min(state.minLead, lead);
  const exposure = advanceExposure(state.exposure, lead, dt);

  if (lead < LEAD_CRITICAL_METERS && state.minLead >= LEAD_CRITICAL_METERS) {
    pushEvent("leadCritical", leadCriticalLine());
  }

  const prevPhase = stormPhaseAt(state.now);
  const nextPhase = stormPhaseAt(now);
  if (nextPhase.label !== prevPhase.label) {
    const isLull = nextPhase.label.startsWith("Lull");
    pushEvent(isLull ? "lullStart" : "phase", isLull ? lullStartLine(nextPhase.label) : phaseLine(nextPhase.label));
  }

  let status: RunStatus = state.status;
  let loseGate = state.loseGate;
  let finishedAt = state.finishedAt;
  if (exposure >= 100) {
    status = "lost";
    loseGate = state.gatesPassed + 1;
    finishedAt = now;
    pushEvent("lose", loseLine(loseGate));
  }

  const log = events.length === 0 ? state.log : [...state.log, ...events].slice(-LOG_LIMIT);

  return {
    ...state,
    status,
    now,
    progress,
    speed,
    lane,
    bankedBonus,
    exposure,
    stalledUntil,
    forkChoices,
    struckZoneIds,
    minLead,
    log,
    logSeq,
    loseGate,
    finishedAt,
  };
}

export function applyRaceEvents(run: RunState, raceEvents: readonly RaceEvent[]): RunState {
  if (raceEvents.length === 0 || run.status === "lost") return run;
  let gatesPassed = run.gatesPassed;
  let gateSplits = run.gateSplits;
  let status = run.status;
  let finishedAt = run.finishedAt;
  let logSeq = run.logSeq;
  const additions: RunEvent[] = [];

  for (const evt of raceEvents) {
    if (evt.type === "checkpoint.hit") {
      const gate = GATES[evt.checkpoint];
      if (gate === undefined) continue;
      gatesPassed = gate.index;
      gateSplits = [...gateSplits, { gate: gate.index, time: evt.time }];
      logSeq += 1;
      additions.push({ id: `evt-${logSeq}`, at: evt.time, kind: "gate", text: gateLine(gate) });
    } else if (evt.type === "race.finished" && status === "playing") {
      status = "won";
      finishedAt = evt.time;
      logSeq += 1;
      additions.push({ id: `evt-${logSeq}`, at: evt.time, kind: "win", text: winLine() });
    }
  }

  if (additions.length === 0) return run;
  return {
    ...run,
    gatesPassed,
    gateSplits,
    status,
    finishedAt,
    logSeq,
    log: [...run.log, ...additions].slice(-LOG_LIMIT),
  };
}
