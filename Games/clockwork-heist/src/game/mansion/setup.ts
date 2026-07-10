import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { PALETTE } from "../ui/palette";
import { GUARD_DEFS, GUARD_CATALOG_KIND } from "../entities/guards";
import { CAMERA_DEFS } from "../entities/cameras";
import { DOOR_DEFS } from "../entities/doors";
import { SIDE_LOOT_DEFS, TREASURE_DEFS } from "../items/treasures";
import { guardPositionAt } from "../schedule/guardSchedule";
import { cameraAngleAt } from "../schedule/cameraSchedule";
import { doorStateAt } from "../schedule/doorSchedule";
import type { DetectionSource } from "../state/heistState";
import { isPointDetected, type WallSegment } from "../schedule/visionCone";
import {
  doorwayGapLosSegment,
  generateAllWallBoxes,
  SCHEDULED_DOORWAYS,
  staticLosSegments,
} from "./floorPlan";
import { generateFurniturePlacements } from "./furniture";
import {
  CAMERA_CATALOG_ID,
  DOOR_BARRIER_CATALOG_ID,
  TREASURE_CATALOG_ID,
  SIDE_LOOT_CATALOG_ID,
  WALL_CATALOG_ID,
  cameraInstanceId,
  doorBarrierInstanceId,
  lootInstanceId,
  treasureInstanceId,
  wallInstanceId,
} from "./catalog";

export function placeStaticWorld(ctx: GameContext): void {
  for (const box of generateAllWallBoxes()) {
    const instanceId = wallInstanceId(box.id);
    if (ctx.scene.object.get(instanceId) !== null) continue;
    ctx.scene.object.place(WALL_CATALOG_ID, box.x, 1.5, box.z, {
      instanceId,
      visual: { scale: [1, 3, 1], color: PALETTE.mahogany },
    });
  }

  for (const placement of generateFurniturePlacements()) {
    if (ctx.scene.object.get(placement.instanceId) !== null) continue;
    ctx.scene.object.place(placement.kind, placement.x, placement.y, placement.z, {
      instanceId: placement.instanceId,
      rotation: placement.rotationY,
      visual: { scale: placement.scale, color: placement.color },
    });
  }

  for (const camera of CAMERA_DEFS) {
    const instanceId = cameraInstanceId(camera.id);
    if (ctx.scene.object.get(instanceId) !== null) continue;
    ctx.scene.object.place(CAMERA_CATALOG_ID, camera.position[0], camera.position[1], camera.position[2], {
      instanceId,
      rotation: camera.baseAngle,
      visual: { scale: [0.6, 0.6, 0.6], color: PALETTE.brass },
    });
  }

  for (const guard of GUARD_DEFS) {
    if (ctx.scene.entity.get(guard.id) !== null) continue;
    const pose = guardPositionAt(guard, 0);
    ctx.scene.entity.spawn(GUARD_CATALOG_KIND, {
      id: guard.id,
      position: pose.position,
      rotationY: pose.heading,
      role: "npc",
      movement: { walkSpeed: guard.speed },
    });
  }
}

export function ensureCollectiblesPlaced(
  ctx: GameContext,
  collectedTreasureIds: readonly string[],
  collectedLootIds: readonly string[],
): void {
  for (const treasure of TREASURE_DEFS) {
    if (collectedTreasureIds.includes(treasure.id)) continue;
    const instanceId = treasureInstanceId(treasure.id);
    if (ctx.scene.object.get(instanceId) !== null) continue;
    ctx.scene.object.place(TREASURE_CATALOG_ID, treasure.position[0], treasure.position[1], treasure.position[2], {
      instanceId,
      visual: { scale: [0.55, 0.55, 0.55], color: PALETTE.candlelight },
    });
  }
  for (const loot of SIDE_LOOT_DEFS) {
    if (collectedLootIds.includes(loot.id)) continue;
    const instanceId = lootInstanceId(loot.id);
    if (ctx.scene.object.get(instanceId) !== null) continue;
    ctx.scene.object.place(SIDE_LOOT_CATALOG_ID, loot.position[0], loot.position[1], loot.position[2], {
      instanceId,
      visual: { scale: [0.35, 0.35, 0.35], color: PALETTE.brass },
    });
  }
}

export interface WorldTickResult {
  detected: boolean;
  source: DetectionSource | null;
}

export function tickWorld(ctx: GameContext, elapsed: number, sneaking: boolean): WorldTickResult {
  for (const guard of GUARD_DEFS) {
    const pose = guardPositionAt(guard, elapsed);
    ctx.scene.entity.setPose(guard.id, { position: pose.position, rotationY: pose.heading });
  }

  const lockedDoorGapSegments: WallSegment[] = [];
  for (const doorDef of DOOR_DEFS) {
    const state = doorStateAt(doorDef, elapsed);
    const barrierId = doorBarrierInstanceId(doorDef.id);
    const placed = ctx.scene.object.get(barrierId) !== null;
    if (state.locked && !placed) {
      ctx.scene.object.place(DOOR_BARRIER_CATALOG_ID, doorDef.gapCenter[0], 1.2, doorDef.gapCenter[1], {
        instanceId: barrierId,
        visual: { scale: [2, 2.4, 0.4], color: PALETTE.velvetRed },
      });
    } else if (!state.locked && placed) {
      ctx.scene.object.remove(barrierId);
    }
    if (state.locked) {
      const connection = SCHEDULED_DOORWAYS.find((entry) => entry.id === doorDef.id);
      if (connection !== undefined) lockedDoorGapSegments.push(doorwayGapLosSegment(connection));
    }
  }

  for (const camera of CAMERA_DEFS) {
    const angle = cameraAngleAt(camera, elapsed).angle;
    ctx.scene.object.rotate(cameraInstanceId(camera.id), angle);
  }

  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return { detected: false, source: null };

  const walls: WallSegment[] = [...staticLosSegments(), ...lockedDoorGapSegments];

  for (const guard of GUARD_DEFS) {
    const pose = guardPositionAt(guard, elapsed);
    const detected = isPointDetected({
      observerPosition: pose.position,
      observerHeading: pose.heading,
      visionRadius: guard.visionRadius,
      visionAngleDeg: guard.visionAngleDeg,
      targetPosition: player.position,
      walls,
      sneaking,
    });
    if (detected) {
      const room = ROOM_FOR_GUARD.get(guard.id) ?? "the mansion";
      return { detected: true, source: { kind: "guard", name: guard.name, roomName: room } };
    }
  }

  for (const camera of CAMERA_DEFS) {
    const pose = cameraAngleAt(camera, elapsed);
    const detected = isPointDetected({
      observerPosition: camera.position,
      observerHeading: pose.angle,
      visionRadius: camera.range,
      visionAngleDeg: camera.angleDeg,
      targetPosition: player.position,
      walls,
      sneaking,
    });
    if (detected) return { detected: true, source: { kind: "camera", name: camera.name, roomName: camera.roomName } };
  }

  return { detected: false, source: null };
}

const ROOM_FOR_GUARD = new Map<string, string>([
  ["guard_higgins", "Servants' Wing"],
  ["guard_reeve", "Gallery Wing"],
  ["guard_voss", "Scholar's Wing"],
  ["guard_blythe", "State Wing"],
  ["guard_marchetti", "the mansion"],
  ["guard_corwin", "Vault Antechamber"],
]);
