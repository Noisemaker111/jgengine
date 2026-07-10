import { advancePathFollow } from "@jgengine/core/nav/pathFollow";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { racerNameFor, RIVALS } from "../boats/catalog";
import { BOAT_Y, currentAssistMood, type CurrentAssistMood, groundSpeed, stepBoat } from "../boats/momentum";
import { rivalBaseSpeed, rivalDirectionToTarget, rivalEffectiveSpeed, rivalPathConfig } from "../boats/rivalAI";
import { currentVectorAt, sampleCurrentField, type CurrentField } from "../course/current";
import { GATE_COUNT, GATES, LAPS } from "../course/track";
import {
  computePlacings,
  lapTimesFromSplits,
  resolveOutcome,
  surfPercent,
  tallySurfTime,
  type RaceOutcome,
} from "./raceLogic";
import type { Sim } from "./sim";

const GATE_SPLIT_ACTION = "gate.split";

export interface HudSnapshot {
  status: Sim["status"];
  elapsedSec: number;
  lap: number;
  totalLaps: number;
  position: number;
  totalRacers: number;
  knots: number;
  assistMood: CurrentAssistMood;
  nextGateLabel: string;
}

export interface ResultsPlacingRow {
  racerId: string;
  name: string;
  position: number;
  finished: boolean;
  finishTime: number | null;
  isPlayer: boolean;
}

export interface ResultsSnapshot {
  outcome: RaceOutcome;
  placings: readonly ResultsPlacingRow[];
  bestLapSec: number | null;
  surfPercent: number;
}

export interface GateSplitToast {
  gateLabel: string;
  lap: number;
  splitSec: number;
}

function publishCurrent(ctx: GameContext, sim: Sim, elapsedSec: number): CurrentField {
  const field = sampleCurrentField(sim.seed, elapsedSec);
  ctx.game.store.set("current", field);
  return field;
}

function publishHud(
  ctx: GameContext,
  sim: Sim,
  elapsedSec: number,
  knots: number,
  assistMood: CurrentAssistMood,
): void {
  const progress = sim.raceState.progressOf(sim.playerId);
  const nextGate = GATES[progress?.nextCheckpoint ?? 0] ?? GATES[0]!;
  const snapshot: HudSnapshot = {
    status: sim.status,
    elapsedSec,
    lap: progress?.lap ?? 1,
    totalLaps: LAPS,
    position: progress?.position ?? sim.ids.length,
    totalRacers: sim.ids.length,
    knots,
    assistMood,
    nextGateLabel: nextGate.label,
  };
  ctx.game.store.set("hud", snapshot);
}

function publishResults(ctx: GameContext, sim: Sim): void {
  const placings: ResultsPlacingRow[] = computePlacings(sim.raceState).map((row) => ({
    racerId: row.racerId,
    name: racerNameFor(row.racerId, sim.playerId),
    position: row.position,
    finished: row.finished,
    finishTime: row.finishTime,
    isPlayer: row.racerId === sim.playerId,
  }));
  const playerProgress = sim.raceState.progressOf(sim.playerId);
  const lapTimes = lapTimesFromSplits(playerProgress?.splits ?? [], GATE_COUNT);
  const snapshot: ResultsSnapshot = {
    outcome: sim.outcome ?? "lose",
    placings,
    bestLapSec: lapTimes.length > 0 ? Math.min(...lapTimes) : null,
    surfPercent: surfPercent(sim.surfTally),
  };
  ctx.game.store.set("results", snapshot);
}

export function tickSim(ctx: GameContext, sim: Sim, dt: number): void {
  if (sim.status === "start") {
    publishCurrent(ctx, sim, 0);
    return;
  }
  if (sim.status === "finished") return;

  const now = ctx.time.now();
  const elapsedSec = now - (sim.raceStartSec ?? now);
  const field = publishCurrent(ctx, sim, elapsedSec);

  const throttle = ctx.input.isDown("throttleUp") ? 1 : ctx.input.isDown("throttleReverse") ? -1 : 0;
  const rudder = ctx.input.isDown("rudderLeft") ? -1 : ctx.input.isDown("rudderRight") ? 1 : 0;
  const brake = ctx.input.isDown("brakeBrace");

  const playerBoat = sim.boats.get(sim.playerId);
  if (playerBoat === undefined) return;
  const playerCurrentVec = currentVectorAt(field, playerBoat.x, playerBoat.z);
  const nextPlayerBoat = stepBoat(
    playerBoat,
    { throttle: throttle as -1 | 0 | 1, rudder: rudder as -1 | 0 | 1, brake },
    playerCurrentVec,
    dt,
  );
  sim.boats.set(sim.playerId, nextPlayerBoat);
  ctx.scene.entity.setPose(sim.playerId, {
    position: [nextPlayerBoat.x, BOAT_Y, nextPlayerBoat.z],
    rotationY: nextPlayerBoat.headingRad,
    dt,
  });
  const assistMood = currentAssistMood(nextPlayerBoat.headingRad, playerCurrentVec);
  sim.surfTally = tallySurfTime(sim.surfTally, assistMood, dt);

  const positions: Record<string, readonly [number, number, number]> = {
    [sim.playerId]: [nextPlayerBoat.x, BOAT_Y, nextPlayerBoat.z],
  };

  for (const rival of RIVALS) {
    const waypoints = sim.rivalWaypointsById.get(rival.id);
    const follow = sim.rivalFollowById.get(rival.id);
    if (waypoints === undefined || follow === undefined) continue;
    if (!follow.done) {
      const currentVec = currentVectorAt(field, follow.position[0], follow.position[2]);
      const dir = rivalDirectionToTarget(follow, waypoints);
      const speed = rivalEffectiveSpeed(rivalBaseSpeed(rival.skill), dir, currentVec);
      const nextFollow = advancePathFollow(rivalPathConfig(waypoints, speed), follow, dt);
      sim.rivalFollowById.set(rival.id, nextFollow);
      ctx.scene.entity.setPose(rival.id, { position: nextFollow.position, rotationY: nextFollow.heading, dt });
      positions[rival.id] = nextFollow.position;
    } else {
      positions[rival.id] = follow.position;
    }
  }

  const events = sim.raceState.update(now, positions);
  for (const event of events) {
    if (event.type === "checkpoint.hit" && event.racerId === sim.playerId) {
      const progress = sim.raceState.progressOf(event.racerId);
      const splitSec = progress?.splits[progress.splits.length - 1] ?? 0;
      const toast: GateSplitToast = {
        gateLabel: GATES[event.checkpoint]?.label ?? `Gate ${event.checkpoint + 1}`,
        lap: event.lap,
        splitSec,
      };
      ctx.game.feed.push(GATE_SPLIT_ACTION, toast);
    }
  }

  const outcome = resolveOutcome(sim.raceState, sim.playerId, elapsedSec);
  if (outcome !== "racing") {
    sim.status = "finished";
    sim.outcome = outcome;
    sim.finishedAtSec = now;
    publishResults(ctx, sim);
  }

  publishHud(ctx, sim, elapsedSec, groundSpeed(nextPlayerBoat, playerCurrentVec), assistMood);
}

export const GATE_SPLIT_FEED_ACTION = GATE_SPLIT_ACTION;
