import { createRaceState, type RaceState, type RaceWinCondition } from "@jgengine/core/game/race";
import { ASTEROID_OBSTACLES, BOOST_PADS, BOOST_PAD_RADIUS, PLANETOIDS, planetoidById } from "../cluster/catalog";
import {
  predictTrajectory,
  spawnKartState,
  stepKart,
  type KartPhysicsState,
} from "../physics/orbitalSim";
import { RIVALS, steerRival } from "../ai/rivals";
import { KART_Y, PLAYER_ID } from "../constants";
import { RACER_SPAWNS, TRACK, type RacerSpawn } from "./track";
import { cleanSlingLine, lapLine, loseLine, overtakeLine, startLine, timeoutLine, winLine } from "./announcer";

export type RacePhase = "start" | "countdown" | "racing" | "finished";
export type RaceOutcome = "win" | "lose" | null;

const COUNTDOWN_SECONDS = 3;
const TIME_LIMIT_SECONDS = 300;
const ANNOUNCER_HOLD_SECONDS = 3.2;

export interface RawKartInput {
  thrust: boolean;
  retro: boolean;
  rotateLeft: boolean;
  rotateRight: boolean;
  dischargeHeld: boolean;
}

export interface KartSnapshot {
  position: readonly [number, number, number];
  heading: number;
  velocity: readonly [number, number];
  speed: number;
  wellCharge: number;
  wellId: string | null;
  inWindow: boolean;
  nextCheckpoint: number;
}

export interface AnnouncerLine {
  message: string;
  expiresAt: number;
}

export interface StandingEntry {
  racerId: string;
  name: string;
  position: number;
  finished: boolean;
}

export interface SessionSnapshot {
  phase: RacePhase;
  countdown: number;
  lap: number;
  laps: number;
  playerPosition: number;
  currentLapTime: number;
  bestLapTime: number | null;
  lastLapTime: number | null;
  totalTime: number;
  outcome: RaceOutcome;
  timedOut: boolean;
  cleanSlingCount: number;
  announcer: AnnouncerLine | null;
  karts: Readonly<Record<string, KartSnapshot>>;
  trajectory: readonly (readonly [number, number])[];
  standings: readonly StandingEntry[];
}

export interface RaceSession {
  snapshot(): SessionSnapshot;
  confirmStart(): void;
  restart(): void;
  tick(dt: number, now: number, input: RawKartInput): void;
}

const RACER_NAMES: Readonly<Record<string, string>> = {
  [PLAYER_ID]: "You",
  ...Object.fromEntries(RIVALS.map((rival) => [rival.id, rival.name])),
};

function playerFinishes(playerId: string): RaceWinCondition {
  return (standings) => {
    const player = standings.find((s) => s.racerId === playerId);
    if (player === undefined || !player.finished) return null;
    return standings.map((s) => s.racerId);
  };
}

function radialWindowFlag(state: KartPhysicsState): boolean {
  if (state.wellId === null) return false;
  const planetoid = planetoidById(state.wellId);
  if (planetoid === undefined) return false;
  const radialX = state.x - planetoid.position[0];
  const radialZ = state.z - planetoid.position[1];
  const radialLen = Math.hypot(radialX, radialZ);
  const speed = Math.hypot(state.vx, state.vz);
  if (radialLen === 0 || speed === 0) return false;
  const dot = (radialX / radialLen) * (state.vx / speed) + (radialZ / radialLen) * (state.vz / speed);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
  return angle >= (18 * Math.PI) / 180 && angle <= (80 * Math.PI) / 180;
}

export function createRaceSession(): RaceSession {
  let phase: RacePhase = "start";
  let countdown = COUNTDOWN_SECONDS;
  let lap = 1;
  let currentLapTime = 0;
  let bestLapTime: number | null = null;
  let lastLapTime: number | null = null;
  let totalTime = 0;
  let outcome: RaceOutcome = null;
  let timedOut = false;
  let cleanSlingCount = 0;
  let announcer: AnnouncerLine | null = null;
  let announcerIndex = 0;
  let prevPlayerPosition = 1;

  const racerIds = [PLAYER_ID, ...RIVALS.map((rival) => rival.id)];
  const kartStates = new Map<string, KartPhysicsState>();
  const padMembership = new Map<string, Set<string>>();

  function spawnOf(id: string): RacerSpawn {
    return RACER_SPAWNS[id]!;
  }

  function resetKarts(): void {
    kartStates.clear();
    padMembership.clear();
    for (const id of racerIds) {
      const spawn = spawnOf(id);
      kartStates.set(id, spawnKartState(spawn.position[0], spawn.position[2], spawn.heading));
      padMembership.set(id, new Set());
    }
  }
  resetKarts();

  let raceState: RaceState = createRaceState({ track: TRACK, win: playerFinishes(PLAYER_ID) });
  for (const id of racerIds) raceState.addRacer(id, 0);

  function setAnnouncer(message: string): void {
    announcer = { message, expiresAt: totalTime + ANNOUNCER_HOLD_SECONDS };
    announcerIndex += 1;
  }

  function resetAll(): void {
    countdown = COUNTDOWN_SECONDS;
    lap = 1;
    currentLapTime = 0;
    bestLapTime = null;
    lastLapTime = null;
    totalTime = 0;
    outcome = null;
    timedOut = false;
    cleanSlingCount = 0;
    announcer = null;
    announcerIndex = 0;
    prevPlayerPosition = 1;
    resetKarts();
    raceState = createRaceState({ track: TRACK, win: playerFinishes(PLAYER_ID) });
    for (const id of racerIds) raceState.addRacer(id, 0);
  }

  function applyBoostPads(id: string, state: KartPhysicsState): KartPhysicsState {
    const membership = padMembership.get(id) ?? new Set<string>();
    const nextMembership = new Set<string>();
    let vx = state.vx;
    let vz = state.vz;
    for (const pad of BOOST_PADS) {
      const dist = Math.hypot(pad.position[0] - state.x, pad.position[1] - state.z);
      if (dist > BOOST_PAD_RADIUS) continue;
      nextMembership.add(pad.id);
      if (!membership.has(pad.id)) {
        vx *= pad.boostMultiplier;
        vz *= pad.boostMultiplier;
      }
    }
    padMembership.set(id, nextMembership);
    return { ...state, vx, vz };
  }

  return {
    snapshot() {
      const playerState = kartStates.get(PLAYER_ID)!;
      const karts: Record<string, KartSnapshot> = {};
      for (const id of racerIds) {
        const state = kartStates.get(id)!;
        karts[id] = {
          position: [state.x, KART_Y, state.z],
          heading: state.heading,
          velocity: [state.vx, state.vz],
          speed: Math.hypot(state.vx, state.vz),
          wellCharge: state.wellCharge,
          wellId: state.wellId,
          inWindow: radialWindowFlag(state),
          nextCheckpoint: raceState.progressOf(id)?.nextCheckpoint ?? 0,
        };
      }
      const standings = raceState
        .standings()
        .map((entry) => ({ racerId: entry.racerId, name: RACER_NAMES[entry.racerId] ?? entry.racerId, position: entry.position, finished: entry.finished }));
      const playerStanding = standings.find((entry) => entry.racerId === PLAYER_ID);

      return {
        phase,
        countdown,
        lap,
        laps: TRACK.laps,
        playerPosition: playerStanding?.position ?? 1,
        currentLapTime,
        bestLapTime,
        lastLapTime,
        totalTime,
        outcome,
        timedOut,
        cleanSlingCount,
        announcer,
        karts,
        trajectory: predictTrajectory(playerState, PLANETOIDS, ASTEROID_OBSTACLES),
        standings,
      };
    },
    confirmStart() {
      if (phase !== "start") return;
      phase = "countdown";
      setAnnouncer(startLine(announcerIndex));
    },
    restart() {
      resetAll();
      phase = "countdown";
    },
    tick(dt, now, input) {
      if (phase === "start") return;

      if (phase === "countdown") {
        countdown = Math.max(0, countdown - dt);
        if (countdown <= 0) phase = "racing";
        return;
      }

      if (phase === "finished") return;

      const playerResult = stepKart(
        kartStates.get(PLAYER_ID)!,
        {
          thrust: input.thrust,
          retro: input.retro,
          rotateLeft: input.rotateLeft,
          rotateRight: input.rotateRight,
          discharge: input.dischargeHeld,
        },
        dt,
        PLANETOIDS,
        ASTEROID_OBSTACLES,
      );
      kartStates.set(PLAYER_ID, applyBoostPads(PLAYER_ID, playerResult.state));
      if (playerResult.cleanSling) {
        cleanSlingCount += 1;
        const planetoid = playerResult.state.wellId !== null ? planetoidById(playerResult.state.wellId) : undefined;
        setAnnouncer(cleanSlingLine(announcerIndex, planetoid?.name ?? "the void"));
      }

      for (const rival of RIVALS) {
        const rivalState = kartStates.get(rival.id)!;
        const progress = raceState.progressOf(rival.id);
        const targetIndex = progress?.nextCheckpoint ?? 0;
        const rivalInput = steerRival(rivalState, rival, targetIndex, PLANETOIDS);
        const rivalResult = stepKart(rivalState, rivalInput, dt, PLANETOIDS, ASTEROID_OBSTACLES);
        kartStates.set(rival.id, applyBoostPads(rival.id, rivalResult.state));
      }

      currentLapTime += dt;
      totalTime += dt;

      const positions: Record<string, readonly [number, number, number]> = {};
      for (const id of racerIds) {
        const state = kartStates.get(id)!;
        positions[id] = [state.x, KART_Y, state.z];
      }

      const events = raceState.update(now, positions);
      for (const event of events) {
        if (event.type === "lap.completed" && event.racerId === PLAYER_ID) {
          lastLapTime = currentLapTime;
          bestLapTime = bestLapTime === null || currentLapTime < bestLapTime ? currentLapTime : bestLapTime;
          lap = Math.min(TRACK.laps, event.lap + 1);
          currentLapTime = 0;
          setAnnouncer(lapLine(announcerIndex, lap));
        }
        if (event.type === "position.changed" && event.racerId === PLAYER_ID) {
          if (event.position < prevPlayerPosition) setAnnouncer(overtakeLine(announcerIndex, event.position));
          prevPlayerPosition = event.position;
        }
      }

      if (raceState.finished && outcome === null) {
        const ranking = raceState.ranking;
        outcome = ranking[0] === PLAYER_ID ? "win" : "lose";
        phase = "finished";
        setAnnouncer(outcome === "win" ? winLine() : loseLine());
      } else if (totalTime > TIME_LIMIT_SECONDS && phase === "racing") {
        timedOut = true;
        outcome = "lose";
        phase = "finished";
        raceState.eliminate(PLAYER_ID);
        setAnnouncer(timeoutLine());
      }
    },
  };
}
