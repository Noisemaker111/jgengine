import { advancePathFollow, createPathFollow, type PathFollowConfig, type PathFollowState } from "@jgengine/core/nav/pathFollow";

import type { ShiftState } from "../race/shift";
import { legWaypoints } from "../race/shift";
import { CHECKPOINT_COUNT, ROAD_Y } from "../race/route";
import type { RivalDef } from "./catalog";

export interface RivalRuntime {
  legIndex: number;
  config: PathFollowConfig;
  follow: PathFollowState;
}

function legConfig(legIndex: number, rival: RivalDef, shiftState: ShiftState): PathFollowConfig {
  const effectiveState: ShiftState = rival.usesShortcuts ? shiftState : {};
  const waypoints2d = legWaypoints(legIndex, effectiveState);
  const waypoints = waypoints2d.map((p): readonly [number, number, number] => [p[0], ROAD_Y, p[1]]);
  return { waypoints, speed: rival.speed, loop: false };
}

export function initRival(rival: RivalDef, shiftState: ShiftState, startLeg = 0): RivalRuntime {
  const config = legConfig(startLeg, rival, shiftState);
  return { legIndex: startLeg, config, follow: createPathFollow(config) };
}

export interface RivalAdvance {
  runtime: RivalRuntime;
  position: readonly [number, number, number];
  heading: number;
}

export function advanceRival(runtime: RivalRuntime, rival: RivalDef, shiftState: ShiftState, dt: number): RivalAdvance {
  let follow = advancePathFollow(runtime.config, runtime.follow, dt);
  let legIndex = runtime.legIndex;
  let config = runtime.config;
  let guard = CHECKPOINT_COUNT + 1;
  while (follow.done && guard > 0) {
    guard -= 1;
    legIndex = (legIndex + 1) % CHECKPOINT_COUNT;
    config = legConfig(legIndex, rival, shiftState);
    follow = createPathFollow(config);
  }
  return { runtime: { legIndex, config, follow }, position: follow.position, heading: follow.heading };
}
