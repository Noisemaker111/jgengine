import { isOpenAt, type IceWorld } from "../ice/grid";

export const SINK_TIME_PENALTY_SECONDS = 6;
export const MAX_SINKS_BEFORE_LOSS = 4;

export function checkSink(world: IceWorld, position: readonly [number, number, number]): boolean {
  return isOpenAt(world, position[0], position[2]);
}

export interface RespawnPose {
  readonly position: readonly [number, number, number];
  readonly heading: number;
}

export interface SinkOutcome {
  readonly sinkCount: number;
  readonly timePenalty: number;
  readonly lostToSinking: boolean;
  readonly respawn: RespawnPose;
}

export function resolveSink(previousSinkCount: number, respawn: RespawnPose): SinkOutcome {
  const sinkCount = previousSinkCount + 1;
  return {
    sinkCount,
    timePenalty: SINK_TIME_PENALTY_SECONDS,
    lostToSinking: sinkCount >= MAX_SINKS_BEFORE_LOSS,
    respawn,
  };
}
