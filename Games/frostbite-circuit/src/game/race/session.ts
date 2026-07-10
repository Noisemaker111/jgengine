import type { AxisInput } from "@jgengine/core/input/axisInput";
import { createRaceState, firstPastPost, raceTrack, type RaceState } from "@jgengine/core/game/race";
import { seededStreams } from "@jgengine/core/random/rng";

import { advanceSledder, initSledder, initSledderAtLeg, SLEDDERS, type SledderRuntime } from "../ai/sledders";
import { buildIceWorld } from "../ice/build";
import { advanceLapBoundary, iceCellAt, markCrossed, type IceWorld } from "../ice/grid";
import { createSledController, type SledController, type SledPose } from "../vehicle/controller";
import {
  bannersFromChanges,
  lapFlavorLine,
  radioLinesFromChanges,
  sinkRadioLine,
  type CornerBanner,
  type RadioLine,
} from "./iceEvents";
import { checkSink, resolveSink, MAX_SINKS_BEFORE_LOSS } from "./sinkRule";
import { CHECKPOINTS, LAPS, legIndexAfterCheckpoint, SPAWN_HEADING, SPAWN_POSITION } from "./track";

export const PLAYER_RACER_ID = "player";
export const SESSION_STORE_KEY = "session";

export type RacePhase = "start" | "countdown" | "racing" | "finished";
export type RaceOutcome = "win" | "lose" | null;
export type LoseReason = "sunk" | "outraced" | null;

const COUNTDOWN_SECONDS = 3;
const RADIO_LOG_LIMIT = 6;
const TRAIL_MAX = 220;
const TRAIL_SAMPLE_INTERVAL = 0.12;

export interface RacerPose {
  readonly position: readonly [number, number, number];
  readonly heading: number;
}

export interface StandingRow {
  readonly racerId: string;
  readonly name: string;
  readonly position: number;
  readonly finished: boolean;
  readonly lap: number;
}

export interface SessionSnapshot {
  readonly phase: RacePhase;
  readonly countdown: number;
  readonly lap: number;
  readonly laps: number;
  readonly currentLapTime: number;
  readonly bestLapTime: number | null;
  readonly lastLapTime: number | null;
  readonly totalTime: number;
  readonly lapSplits: readonly number[];
  readonly speedKmh: number;
  readonly drifting: boolean;
  readonly slip: number;
  readonly playerPose: RacerPose;
  readonly sledderPoses: Readonly<Record<string, RacerPose>>;
  readonly standings: readonly StandingRow[];
  readonly iceWorld: IceWorld;
  readonly playerTrail: readonly (readonly [number, number])[];
  readonly sinkCount: number;
  readonly maxSinks: number;
  readonly cleanLines: number;
  readonly banner: CornerBanner | null;
  readonly radioLog: readonly RadioLine[];
  readonly outcome: RaceOutcome;
  readonly loseReason: LoseReason;
}

export interface RaceSession {
  snapshot(): SessionSnapshot;
  confirm(): void;
  restart(): void;
  tick(dt: number, axis: AxisInput): void;
}

function buildTrack() {
  return raceTrack({ checkpoints: CHECKPOINTS, laps: LAPS });
}

export function createRaceSession(seed: string): RaceSession {
  const streams = seededStreams(seed);
  const aiRng = streams("ai-lines");

  let phase: RacePhase = "start";
  let countdown = COUNTDOWN_SECONDS;
  let lap = 1;
  let currentLapTime = 0;
  let bestLapTime: number | null = null;
  let lastLapTime: number | null = null;
  let totalTime = 0;
  let lapSplits: number[] = [];
  let sinkCount = 0;
  let cleanLines = 0;
  let banner: CornerBanner | null = null;
  let radioLog: RadioLine[] = [];
  let outcome: RaceOutcome = null;
  let loseReason: LoseReason = null;
  let iceWorld: IceWorld = buildIceWorld();
  let playerTrail: [number, number][] = [];
  let trailAccum = 0;

  const player: SledController = createSledController({ position: SPAWN_POSITION, heading: SPAWN_HEADING });
  let playerPose: SledPose = player.pose();

  let raceState: RaceState = createRaceState({ track: buildTrack(), win: firstPastPost(1) });
  raceState.addRacer(PLAYER_RACER_ID, 0);

  let sledderRuntimes: Record<string, SledderRuntime> = {};
  let sledderPoses: Record<string, RacerPose> = {};

  function pushRadio(line: RadioLine): void {
    radioLog = [line, ...radioLog].slice(0, RADIO_LOG_LIMIT);
  }

  function resetSledders(): void {
    sledderRuntimes = {};
    sledderPoses = {};
    for (const def of SLEDDERS) {
      raceState.addRacer(def.id, 0);
      sledderRuntimes[def.id] = initSledder(def, iceWorld, aiRng);
      sledderPoses[def.id] = { position: SPAWN_POSITION, heading: SPAWN_HEADING };
    }
  }
  resetSledders();

  function resetAll(): void {
    countdown = COUNTDOWN_SECONDS;
    lap = 1;
    currentLapTime = 0;
    bestLapTime = null;
    lastLapTime = null;
    totalTime = 0;
    lapSplits = [];
    sinkCount = 0;
    cleanLines = 0;
    banner = null;
    radioLog = [];
    outcome = null;
    loseReason = null;
    iceWorld = buildIceWorld();
    playerTrail = [];
    trailAccum = 0;
    player.resetTo(SPAWN_POSITION, SPAWN_HEADING);
    playerPose = player.pose();
    raceState = createRaceState({ track: buildTrack(), win: firstPastPost(1) });
    raceState.addRacer(PLAYER_RACER_ID, 0);
    resetSledders();
  }

  function nameOf(id: string): string {
    if (id === PLAYER_RACER_ID) return "You";
    return SLEDDERS.find((s) => s.id === id)?.name ?? id;
  }

  function standingsRows(): StandingRow[] {
    return raceState
      .standings()
      .map((s) => ({ racerId: s.racerId, name: nameOf(s.racerId), position: s.position, finished: s.finished, lap: s.lap }));
  }

  function applyStanding(): void {
    if (raceState.finished && outcome === null) {
      const ranking = raceState.ranking;
      outcome = ranking[0] === PLAYER_RACER_ID ? "win" : "lose";
      loseReason = outcome === "lose" ? "outraced" : null;
      phase = "finished";
    }
  }

  function respawnSledder(def: (typeof SLEDDERS)[number]): void {
    const progress = raceState.progressOf(def.id);
    const legIndex = legIndexAfterCheckpoint(progress?.lastCheckpoint ?? -1);
    const runtime = initSledderAtLeg(def, iceWorld, aiRng, legIndex, sledderRuntimes[def.id]?.lap ?? 1);
    sledderRuntimes[def.id] = runtime;
    sledderPoses[def.id] = { position: runtime.follow.position, heading: runtime.follow.heading };
    pushRadio(sinkRadioLine(def.name, legIndex, totalTime));
  }

  return {
    snapshot() {
      return {
        phase,
        countdown,
        lap,
        laps: LAPS,
        currentLapTime,
        bestLapTime,
        lastLapTime,
        totalTime,
        lapSplits: [...lapSplits],
        speedKmh: playerPose.speedKmh,
        drifting: playerPose.drifting,
        slip: playerPose.slip,
        playerPose: { position: playerPose.position, heading: playerPose.heading },
        sledderPoses: { ...sledderPoses },
        standings: standingsRows(),
        iceWorld,
        playerTrail: [...playerTrail],
        sinkCount,
        maxSinks: MAX_SINKS_BEFORE_LOSS,
        cleanLines,
        banner,
        radioLog: [...radioLog],
        outcome,
        loseReason,
      };
    },
    confirm() {
      if (phase === "start") phase = "countdown";
    },
    restart() {
      resetAll();
      phase = "countdown";
    },
    tick(dt, axis) {
      if (phase === "start" || phase === "finished") return;

      if (phase === "countdown") {
        countdown = Math.max(0, countdown - dt);
        if (countdown <= 0) phase = "racing";
        return;
      }

      playerPose = player.tick(dt, axis);
      iceWorld = markCrossed(iceWorld, playerPose.position[0], playerPose.position[2]);

      trailAccum += dt;
      if (trailAccum >= TRAIL_SAMPLE_INTERVAL) {
        trailAccum = 0;
        playerTrail.push([playerPose.position[0], playerPose.position[2]]);
        if (playerTrail.length > TRAIL_MAX) playerTrail.shift();
      }

      for (const def of SLEDDERS) {
        const progress = raceState.progressOf(def.id);
        if (progress !== null && (progress.finished || progress.eliminated)) continue;
        const runtime = sledderRuntimes[def.id]!;
        const advance = advanceSledder(def, runtime, iceWorld, aiRng, dt);
        sledderRuntimes[def.id] = advance.runtime;
        sledderPoses[def.id] = { position: advance.position, heading: advance.heading };
        iceWorld = markCrossed(iceWorld, advance.position[0], advance.position[2]);
      }

      currentLapTime += dt;
      totalTime += dt;

      const positions: Record<string, readonly [number, number, number]> = { [PLAYER_RACER_ID]: playerPose.position };
      for (const def of SLEDDERS) positions[def.id] = sledderPoses[def.id]!.position;

      const events = raceState.update(totalTime, positions);
      for (const event of events) {
        if (event.type === "checkpoint.hit" && event.racerId === PLAYER_RACER_ID) {
          lapSplits.push(currentLapTime);
          const cell = iceCellAt(iceWorld, playerPose.position[0], playerPose.position[2]);
          if (cell !== null && cell.status === "solid") cleanLines += 1;
        }
        if (event.type === "lap.completed" && event.racerId === PLAYER_RACER_ID) {
          lastLapTime = currentLapTime;
          bestLapTime = bestLapTime === null || currentLapTime < bestLapTime ? currentLapTime : bestLapTime;
          lapSplits = [];
          currentLapTime = 0;
          const finishedLap = event.lap;
          lap = Math.min(LAPS, finishedLap + 1);

          const { world: nextWorld, changed } = advanceLapBoundary(iceWorld);
          iceWorld = nextWorld;
          const banners = bannersFromChanges(changed, totalTime);
          if (banners.length > 0) banner = banners[0]!;
          for (const line of radioLinesFromChanges(changed, totalTime)) pushRadio(line);
          if (finishedLap < LAPS) pushRadio(lapFlavorLine(lap, LAPS, iceWorld, totalTime));
        }
      }

      if (banner !== null && totalTime > banner.expiresAt) banner = null;

      if (checkSink(iceWorld, playerPose.position)) {
        const progress = raceState.progressOf(PLAYER_RACER_ID);
        const respawn = raceState.resetToCheckpoint(PLAYER_RACER_ID) ?? { position: SPAWN_POSITION, heading: SPAWN_HEADING };
        const result = resolveSink(sinkCount, respawn);
        sinkCount = result.sinkCount;
        totalTime += result.timePenalty;
        currentLapTime += result.timePenalty;
        player.resetTo(result.respawn.position, result.respawn.heading);
        playerPose = player.pose();
        const corner = legIndexAfterCheckpoint(progress?.lastCheckpoint ?? -1);
        pushRadio(sinkRadioLine("You", corner, totalTime));
        if (result.lostToSinking) {
          outcome = "lose";
          loseReason = "sunk";
          phase = "finished";
          raceState.eliminate(PLAYER_RACER_ID);
        }
      }

      for (const def of SLEDDERS) {
        const pose = sledderPoses[def.id];
        const progress = raceState.progressOf(def.id);
        if (pose === undefined || progress === null || progress.finished || progress.eliminated) continue;
        if (checkSink(iceWorld, pose.position)) respawnSledder(def);
      }

      applyStanding();
    },
  };
}
