import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { ringsForCourse, type CourseId } from "../race/courses";
import { BASE_ARM_LENGTH, BASE_CRANE_HEIGHT, BASE_RING_RADIUS, CHARGE_PAD_KIND, CRANE_KIND, HOLOGRAM_BLUE, RING_GATE_KIND, SIGNAL_ORANGE } from "../objects/catalog";
import { CHARGE_PADS, CRANES } from "../race/ringPool";

export interface ResolvedPad {
  id: string;
  position: readonly [number, number, number];
  radius: number;
}

export function placeStaticProps(ctx: GameContext): readonly ResolvedPad[] {
  const resolved: ResolvedPad[] = [];
  for (const pad of CHARGE_PADS) {
    const y = ctx.world.groundHeightAt(pad.x, pad.z) + pad.altitude;
    ctx.scene.object.place(CHARGE_PAD_KIND, pad.x, y, pad.z, {
      instanceId: pad.id,
      visual: { color: SIGNAL_ORANGE },
    });
    resolved.push({ id: pad.id, position: [pad.x, y, pad.z], radius: pad.radius });
  }
  for (const crane of CRANES) {
    const y = ctx.world.groundHeightAt(crane.x, crane.z);
    ctx.scene.object.place(CRANE_KIND, crane.x, y, crane.z, {
      instanceId: crane.id,
      rotation: crane.armFacing,
      visual: { scale: [1, crane.height / BASE_CRANE_HEIGHT, crane.armLength / BASE_ARM_LENGTH] },
    });
  }
  return resolved;
}

export function placeCourseRings(
  ctx: GameContext,
  courseId: CourseId,
  groundHeightAt: (x: number, z: number) => number,
): void {
  for (const object of ctx.scene.object.list()) {
    if (object.catalogId === RING_GATE_KIND) ctx.scene.object.remove(object.instanceId);
  }
  const rings = ringsForCourse(courseId);
  rings.forEach((ring, index) => {
    const isFinal = index === rings.length - 1;
    const prev = rings[index - 1] ?? ring;
    const target = rings[index + 1] ?? ring;
    const heading = Math.atan2(target.x - prev.x, target.z - prev.z);
    const y = groundHeightAt(ring.x, ring.z) + ring.altitude;
    ctx.scene.object.place(RING_GATE_KIND, ring.x, y, ring.z, {
      instanceId: `ring-${courseId}-${ring.id}`,
      rotation: heading,
      visual: { scale: ring.radius / BASE_RING_RADIUS, color: isFinal ? SIGNAL_ORANGE : HOLOGRAM_BLUE },
    });
  });
}
