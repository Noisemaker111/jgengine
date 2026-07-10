import { edgeById, edgeLength, type EdgeId } from "./network";
import { trainPositionAt, type TrainDef } from "./schedule";

const PORTAL_MARGIN_T = 0.04;

export function isSingleTrackOccupied(edgeId: EdgeId, trains: readonly TrainDef[], t: number): boolean {
  const edge = edgeById(edgeId);
  if (!edge.singleTrack) return false;
  return trains.some((train) => {
    const pose = trainPositionAt(train, t);
    return pose.edgeId === edgeId && pose.edgeT > PORTAL_MARGIN_T && pose.edgeT < 1 - PORTAL_MARGIN_T;
  });
}

export function occupyingTrains(edgeId: EdgeId, trains: readonly TrainDef[], t: number): readonly TrainDef[] {
  return trains.filter((train) => {
    const pose = trainPositionAt(train, t);
    return pose.edgeId === edgeId;
  });
}

export interface PlayerForecastInput {
  currentEdgeId: EdgeId;
  edgeT: number;
  speed: number;
  upcomingEdgeIds: readonly EdgeId[];
}

export function forecastPlayerEdgeAt(input: PlayerForecastInput, deltaSeconds: number): { edgeId: EdgeId; edgeT: number } | null {
  if (deltaSeconds <= 0 || input.speed <= 0) return { edgeId: input.currentEdgeId, edgeT: input.edgeT };
  let edgeId = input.currentEdgeId;
  let edgeT = input.edgeT;
  let budget = input.speed * deltaSeconds;
  const upcoming = [...input.upcomingEdgeIds];
  let guard = upcoming.length + 2;
  while (budget > 1e-9 && guard > 0) {
    guard -= 1;
    const length = edgeLength(edgeById(edgeId));
    const distanceToEnd = (1 - edgeT) * length;
    if (budget < distanceToEnd) {
      edgeT += budget / length;
      budget = 0;
    } else {
      budget -= distanceToEnd;
      const next = upcoming.shift();
      if (next === undefined) return null;
      edgeId = next;
      edgeT = 0;
    }
  }
  return { edgeId, edgeT };
}

export interface ConflictProjection {
  edgeId: EdgeId;
  trainId: string;
  atSeconds: number;
}

const ALONG_TRACK_PROXIMITY_T = 0.1;

export function projectConflict(
  player: PlayerForecastInput,
  trains: readonly TrainDef[],
  now: number,
  horizonSeconds = 30,
  sampleStep = 0.1,
): ConflictProjection | null {
  for (let dt = 0; dt <= horizonSeconds; dt += sampleStep) {
    const forecast = forecastPlayerEdgeAt(player, dt);
    if (forecast === null) return null;
    for (const train of trains) {
      const pose = trainPositionAt(train, now + dt);
      if (pose.edgeId === forecast.edgeId && Math.abs(pose.edgeT - forecast.edgeT) <= ALONG_TRACK_PROXIMITY_T) {
        return { edgeId: forecast.edgeId, trainId: train.id, atSeconds: dt };
      }
    }
  }
  return null;
}
