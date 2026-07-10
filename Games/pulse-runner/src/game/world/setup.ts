import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";

import { COURSE_LENGTH, COURSE_START_Z, MOVEMENTS, worldZFor, type ObstacleEvent } from "../course/course";
import { laneWorldX } from "../session/runnerEngine";
import {
  ARCHWAY_HEIGHT,
  BEAT_GATED_DOOR,
  BRAZIER_OFFSET,
  BRAZIER_SPACING,
  MANDALA_HEIGHT,
  MANDALA_SPACING,
  NARROW_BARRIER,
  PILLAR_HEIGHT,
  PILLAR_OFFSET,
  PILLAR_SPACING,
  SANCTUM_GATE,
  SWING_CENSER,
  TEMPLE_ARCHWAY,
  TEMPLE_BRAZIER,
  TEMPLE_MANDALA,
  TEMPLE_PILLAR,
  VOID_RIFT,
  type PulseRunnerObjectId,
} from "../objects/catalog";

export interface DressingPlacement {
  readonly instanceId: string;
  readonly catalogId: PulseRunnerObjectId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotationY?: number;
  readonly color?: string;
}

const cosmeticRng = seededRng("pulse-runner:dressing");

function jitter(spread: number): number {
  return (cosmeticRng() - 0.5) * 2 * spread;
}

function propsForObstacle(obstacle: ObstacleEvent): { catalogId: PulseRunnerObjectId; x: number }[] {
  if (obstacle.type === "door") return [{ catalogId: BEAT_GATED_DOOR, x: 0 }];
  const catalogId: PulseRunnerObjectId =
    obstacle.type === "censer" || obstacle.type === "twinCenser"
      ? SWING_CENSER
      : obstacle.type === "narrows"
        ? NARROW_BARRIER
        : VOID_RIFT;
  return obstacle.blockedLanes.map((lane) => ({ catalogId, x: laneWorldX(lane) }));
}

export function generateDressing(): readonly DressingPlacement[] {
  const placements: DressingPlacement[] = [];
  const courseEndZ = COURSE_START_Z + COURSE_LENGTH;

  for (let z = COURSE_START_Z, i = 0; z <= courseEndZ; z += PILLAR_SPACING, i += 1) {
    placements.push({
      instanceId: `pillar-left-${i}`,
      catalogId: TEMPLE_PILLAR,
      x: -PILLAR_OFFSET,
      y: PILLAR_HEIGHT / 2,
      z: z + jitter(0.6),
      rotationY: jitter(0.05),
    });
    placements.push({
      instanceId: `pillar-right-${i}`,
      catalogId: TEMPLE_PILLAR,
      x: PILLAR_OFFSET,
      y: PILLAR_HEIGHT / 2,
      z: z - jitter(0.6),
      rotationY: jitter(0.05),
    });
  }

  for (let z = COURSE_START_Z + BRAZIER_SPACING / 2, i = 0; z <= courseEndZ; z += BRAZIER_SPACING, i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    placements.push({
      instanceId: `brazier-${i}`,
      catalogId: TEMPLE_BRAZIER,
      x: side * BRAZIER_OFFSET,
      y: 0.9,
      z,
    });
  }

  for (let z = COURSE_START_Z + MANDALA_SPACING / 2, i = 0; z <= courseEndZ; z += MANDALA_SPACING, i += 1) {
    placements.push({
      instanceId: `mandala-${i}`,
      catalogId: TEMPLE_MANDALA,
      x: jitter(0.8),
      y: MANDALA_HEIGHT,
      z,
    });
  }

  const archwayZs = [COURSE_START_Z, ...MOVEMENTS.slice(1).map((_, index) => worldZFor(index + 1, 0))];
  archwayZs.forEach((z, index) => {
    placements.push({
      instanceId: `archway-${index}`,
      catalogId: TEMPLE_ARCHWAY,
      x: 0,
      y: ARCHWAY_HEIGHT / 2,
      z,
    });
  });

  const finalMovement = MOVEMENTS[MOVEMENTS.length - 1]!;
  placements.push({
    instanceId: "sanctum-gate",
    catalogId: SANCTUM_GATE,
    x: 0,
    y: ARCHWAY_HEIGHT / 2 + 1,
    z: worldZFor(MOVEMENTS.length - 1, finalMovement.totalBeats * finalMovement.unitsPerBeat),
  });

  MOVEMENTS.forEach((movement, movementIndex) => {
    movement.obstacles.forEach((obstacle) => {
      const localZ = obstacle.beatIndex * movement.unitsPerBeat;
      const worldZ = worldZFor(movementIndex, localZ);
      propsForObstacle(obstacle).forEach((prop, propIndex) => {
        placements.push({
          instanceId: `obstacle-${obstacle.id}-${propIndex}`,
          catalogId: prop.catalogId,
          x: prop.x,
          y: prop.catalogId === BEAT_GATED_DOOR ? ARCHWAY_HEIGHT / 2 : 0.6,
          z: worldZ,
        });
      });
    });
  });

  return placements;
}

export function placeWorldDressing(ctx: GameContext): void {
  for (const placement of generateDressing()) {
    ctx.scene.object.place(placement.catalogId, placement.x, placement.y, placement.z, {
      instanceId: placement.instanceId,
      rotation: placement.rotationY,
    });
  }
}
