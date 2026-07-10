import { createBeatClock, type BeatClock, type BeatSnapshot } from "@jgengine/core/time/beatClock";
import { createLevelSequence, type LevelSequence } from "@jgengine/core/game/levelSequence";

import { MOVEMENTS, gradeForAccuracy, worldZFor, type Grade, type Movement, type ObstacleEvent } from "../course/course";
import {
  DOOR_OPEN_WINDOW_BEATS,
  LEAN_BOOST_AMOUNT,
  LEAN_DECAY_PER_SEC,
  MAX_STRIKES,
  PULSE_DRAIN,
  PULSE_GAIN,
  applyPulseDelta,
  classifyTap,
  createPulseState,
  forwardSpeed,
  isDefeated,
  isDownbeatOpen,
  resonanceActive,
  steeringRateForPulse,
  type PulseState,
  type TapJudgement,
} from "../rules/rhythm";

const LANE_COUNT = 3;
const START_LANE = 1;
export const LANE_WIDTH = 3;

export function laneWorldX(laneIndex: number): number {
  return (laneIndex - 1) * LANE_WIDTH;
}

export type RunnerPhase = "idle" | "playing" | "won" | "lost";

export interface TapAccuracy {
  readonly perfect: number;
  readonly good: number;
  readonly miss: number;
}

function emptyTaps(): TapAccuracy {
  return { perfect: 0, good: 0, miss: 0 };
}

export interface MovementResult {
  readonly movementId: string;
  readonly title: string;
  readonly accuracy: number;
  readonly grade: Grade;
}

export type RunnerEventKind =
  | "beat"
  | "judgement"
  | "obstacleHit"
  | "movementCleared"
  | "resonanceStart"
  | "resonanceEnd"
  | "defeated"
  | "victory";

export interface RunnerEvent {
  readonly kind: RunnerEventKind;
  readonly detail?: unknown;
}

export interface CheckpointStatus {
  readonly id: string;
  readonly title: string;
  readonly cleared: boolean;
}

export interface RunnerSnapshot {
  readonly phase: RunnerPhase;
  readonly movementIndex: number;
  readonly movement: Movement;
  readonly localZ: number;
  readonly worldZ: number;
  readonly progress: number;
  readonly laneIndex: number;
  readonly laneX: number;
  readonly pulse: number;
  readonly strikes: number;
  readonly perfectStreak: number;
  readonly longestPerfectStreak: number;
  readonly resonance: boolean;
  readonly lastJudgement: { readonly kind: TapJudgement; readonly atSec: number } | null;
  readonly taps: TapAccuracy;
  readonly accuracy: number;
  readonly results: readonly MovementResult[];
  readonly checkpoints: readonly CheckpointStatus[];
  readonly beat: BeatSnapshot;
  readonly defeatedAt: string | null;
}

export interface RunnerEngine {
  start(): void;
  restart(): void;
  setLane(direction: -1 | 1): void;
  lean(): void;
  tapStride(): TapJudgement | null;
  tick(dt: number): void;
  snapshot(): RunnerSnapshot;
  drainEvents(): readonly RunnerEvent[];
}

function overallAccuracy(sample: TapAccuracy): number {
  const total = sample.perfect + sample.good + sample.miss;
  if (total === 0) return 0;
  return (sample.perfect + sample.good * 0.5) / total;
}

export function createRunnerEngine(movements: readonly Movement[] = MOVEMENTS): RunnerEngine {
  let phase: RunnerPhase = "idle";
  let movementIndex = 0;
  let z = 0;
  let laneIndex = START_LANE;
  let laneX = laneWorldX(START_LANE);
  let pulseState: PulseState = createPulseState();
  let leanBoost = 0;
  let perfectStreak = 0;
  let longestPerfectStreak = 0;
  let obstacleCursor = 0;
  let taps: TapAccuracy = emptyTaps();
  let movementTaps: TapAccuracy = emptyTaps();
  let lastJudgement: { kind: TapJudgement; atSec: number } | null = null;
  let results: MovementResult[] = [];
  let defeatedAt: string | null = null;
  let wasResonating = false;
  let events: RunnerEvent[] = [];
  let clock: BeatClock = makeClock(movements[0]!);
  const levels: LevelSequence<Movement> = createLevelSequence({
    levels: movements.map((movement) => ({ id: movement.id, config: movement })),
  });

  function makeClock(movement: Movement): BeatClock {
    return createBeatClock({ bpm: movement.bpm, beatsPerBar: movement.beatsPerBar }, (beatIndex) => {
      events.push({ kind: "beat", detail: beatIndex });
    });
  }

  function currentMovement(): Movement {
    return movements[movementIndex]!;
  }

  function resetAll(): void {
    phase = "idle";
    movementIndex = 0;
    z = 0;
    laneIndex = START_LANE;
    laneX = laneWorldX(START_LANE);
    pulseState = createPulseState();
    leanBoost = 0;
    perfectStreak = 0;
    longestPerfectStreak = 0;
    obstacleCursor = 0;
    taps = emptyTaps();
    movementTaps = emptyTaps();
    lastJudgement = null;
    results = [];
    defeatedAt = null;
    wasResonating = false;
    events = [];
    clock = makeClock(movements[0]!);
    levels.reset();
  }

  function beginRun(): void {
    resetAll();
    phase = "playing";
    levels.start();
  }

  function applyJudgement(kind: TapJudgement, atSec: number): void {
    lastJudgement = { kind, atSec };
    taps = { ...taps, [kind]: taps[kind] + 1 };
    movementTaps = { ...movementTaps, [kind]: movementTaps[kind] + 1 };
    if (kind === "perfect") {
      perfectStreak += 1;
      longestPerfectStreak = Math.max(longestPerfectStreak, perfectStreak);
      pulseState = applyPulseDelta(pulseState, PULSE_GAIN.perfect);
    } else if (kind === "good") {
      perfectStreak = 0;
      pulseState = applyPulseDelta(pulseState, PULSE_GAIN.good);
    } else {
      perfectStreak = 0;
      pulseState = applyPulseDelta(pulseState, -PULSE_DRAIN.miss);
    }
    events.push({ kind: "judgement", detail: { kind, atSec } });
    checkDefeat();
  }

  function checkDefeat(): void {
    if (phase === "playing" && isDefeated(pulseState, MAX_STRIKES)) {
      phase = "lost";
      defeatedAt = currentMovement().title;
      events.push({ kind: "defeated" });
    }
  }

  function resolveObstacle(obstacle: ObstacleEvent, beat: BeatSnapshot): void {
    if (resonanceActive(perfectStreak)) return;
    const hit =
      obstacle.type === "door"
        ? !isDownbeatOpen(beat.beat, currentMovement().beatsPerBar, DOOR_OPEN_WINDOW_BEATS)
        : obstacle.blockedLanes.includes(laneIndex);
    if (!hit) return;
    perfectStreak = 0;
    pulseState = applyPulseDelta(pulseState, -PULSE_DRAIN.obstacle);
    events.push({ kind: "obstacleHit", detail: obstacle });
    checkDefeat();
  }

  function finishMovement(): void {
    const movement = currentMovement();
    const accuracy = overallAccuracy(movementTaps);
    results = [...results, { movementId: movement.id, title: movement.title, accuracy, grade: gradeForAccuracy(accuracy) }];
    events.push({ kind: "movementCleared", detail: movement.id });
    levels.clear();
    movementTaps = emptyTaps();
    levels.advance();
    if (levels.status() === "complete") {
      phase = "won";
      events.push({ kind: "victory" });
      return;
    }
    movementIndex += 1;
    z = 0;
    obstacleCursor = 0;
    clock = makeClock(currentMovement());
  }

  return {
    start: beginRun,
    restart: beginRun,
    setLane(direction) {
      if (phase !== "playing") return;
      laneIndex = Math.min(LANE_COUNT - 1, Math.max(0, laneIndex + direction));
    },
    lean() {
      if (phase !== "playing") return;
      leanBoost = LEAN_BOOST_AMOUNT;
    },
    tapStride() {
      if (phase === "idle") {
        beginRun();
        return null;
      }
      if (phase !== "playing") return null;
      const nowSec = clock.now();
      const judgement = classifyTap(nowSec, clock.beatDurationSec());
      applyJudgement(judgement, nowSec);
      return judgement;
    },
    tick(dt) {
      const beat = clock.advance(dt);
      const resonatingNow = resonanceActive(perfectStreak);
      if (resonatingNow !== wasResonating) {
        events.push({ kind: resonatingNow ? "resonanceStart" : "resonanceEnd" });
        wasResonating = resonatingNow;
      }
      if (phase !== "playing") return;
      leanBoost = Math.max(0, leanBoost - LEAN_DECAY_PER_SEC * dt);
      const movement = currentMovement();
      const speed = forwardSpeed(movement.bpm, movement.unitsPerBeat, pulseState.value, leanBoost, resonatingNow);
      z += speed * dt;
      const targetX = laneWorldX(laneIndex);
      const rate = steeringRateForPulse(pulseState.value);
      laneX += (targetX - laneX) * Math.min(1, rate * dt);
      const obstacles = movement.obstacles;
      while (obstacleCursor < obstacles.length && obstacles[obstacleCursor]!.beatIndex * movement.unitsPerBeat <= z) {
        resolveObstacle(obstacles[obstacleCursor]!, beat);
        obstacleCursor += 1;
        if (phase !== "playing") return;
      }
      const movementLength = movement.totalBeats * movement.unitsPerBeat;
      if (phase === "playing" && z >= movementLength) {
        finishMovement();
      }
    },
    snapshot() {
      const movement = currentMovement();
      const movementLength = movement.totalBeats * movement.unitsPerBeat;
      return {
        phase,
        movementIndex,
        movement,
        localZ: z,
        worldZ: worldZFor(movementIndex, z),
        progress: movementLength <= 0 ? 0 : Math.min(1, z / movementLength),
        laneIndex,
        laneX,
        pulse: pulseState.value,
        strikes: pulseState.strikes,
        perfectStreak,
        longestPerfectStreak,
        resonance: resonanceActive(perfectStreak),
        lastJudgement,
        taps,
        accuracy: overallAccuracy(taps),
        results,
        checkpoints: movements.map((movement_, index) => ({
          id: movement_.id,
          title: movement_.title,
          cleared: index < movementIndex || phase === "won",
        })),
        beat: clock.snapshot(),
        defeatedAt,
      };
    },
    drainEvents() {
      const drained = events;
      events = [];
      return drained;
    },
  };
}
