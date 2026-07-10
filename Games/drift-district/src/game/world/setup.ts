import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { DISTRICTS } from "../district/districts";
import { vecLerp } from "../race/geometry";
import { CHECKPOINTS_2D, CHECKPOINT_COUNT, ROAD_Y, SHIFT_PAIRS, checkpointPosition, districtForLeg } from "../race/route";
import { barrierWorldPosition, type ShiftState } from "../race/shift";
import { BARRIER_OBJECT, CHECKPOINT_ARCH_OBJECT, DISTRICT_SIGN_OBJECT, GLOW_STRIP_OBJECT } from "../objects/catalog";

function barrierInstanceId(shiftPairId: string): string {
  return `barrier-${shiftPairId}`;
}

function placeIdempotent(
  ctx: GameContext,
  catalogId: string,
  x: number,
  y: number,
  z: number,
  instanceId: string,
): void {
  ctx.scene.object.remove(instanceId);
  ctx.scene.object.place(catalogId, x, y, z, { instanceId });
}

export function placeCityProps(ctx: GameContext, shiftState: ShiftState): void {
  for (let i = 0; i < CHECKPOINT_COUNT; i += 1) {
    const archPos = checkpointPosition(i);
    placeIdempotent(ctx, CHECKPOINT_ARCH_OBJECT, archPos[0], ROAD_Y, archPos[2], `arch-${i}`);

    const from = CHECKPOINTS_2D[i]!;
    const to = CHECKPOINTS_2D[(i + 1) % CHECKPOINT_COUNT]!;
    const mid = vecLerp(from, to, 0.5);
    const glowId = GLOW_STRIP_OBJECT[districtForLeg(i)]!;
    placeIdempotent(ctx, glowId, mid[0], ROAD_Y, mid[1], `glow-${i}`);
  }

  for (const district of DISTRICTS) {
    const signId = DISTRICT_SIGN_OBJECT[district.id]!;
    placeIdempotent(ctx, signId, district.center[0], ROAD_Y + 3, district.center[1], `sign-${district.id}`);
  }

  for (const pair of SHIFT_PAIRS) {
    const pos = barrierWorldPosition(pair, shiftState);
    placeIdempotent(ctx, BARRIER_OBJECT, pos[0], ROAD_Y, pos[1], barrierInstanceId(pair.id));
  }
}

export function syncBarriers(ctx: GameContext, shiftState: ShiftState): void {
  for (const pair of SHIFT_PAIRS) {
    const pos = barrierWorldPosition(pair, shiftState);
    ctx.scene.object.move(barrierInstanceId(pair.id), pos[0], ROAD_Y, pos[1]);
  }
}
