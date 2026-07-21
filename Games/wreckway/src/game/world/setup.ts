import { seededStreams } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { scatter } from "@jgengine/core/world/scatter";

import { EXIT_GATE_ARCH, GATE_BARRICADE_JUMP, GATE_BARRICADE_PLOW, PICKUP_MARKER } from "../objects/catalog";
import { PICKUPS } from "../run/pickups";
import { EXIT_Z, RUN_SEED } from "../run/constants";
import { ROUTE_GATES } from "../route/gates";
import { ZONES } from "../zones/catalog";

const CORRIDOR_AVOID = { minX: -21, maxX: 21 };
const PROP_COUNT_PER_ZONE = 50;

export interface PropRow {
  instanceId: string;
  z: number;
}

function placeIdempotent(
  ctx: GameContext,
  catalogId: string,
  x: number,
  y: number,
  z: number,
  instanceId: string,
  rotation?: number,
): void {
  ctx.scene.object.remove(instanceId);
  ctx.scene.object.place(catalogId, x, y, z, { instanceId, ...(rotation === undefined ? {} : { rotation }) });
}

export function placeZoneDressing(ctx: GameContext): readonly PropRow[] {
  const rows: PropRow[] = [];
  for (const zone of ZONES) {
    const stream = seededStreams(RUN_SEED)(`props-${zone.id}`);
    const points = scatter({
      area: { w: 96, d: zone.end - zone.start, center: [0, (zone.start + zone.end) / 2] },
      count: PROP_COUNT_PER_ZONE,
      seed: `wreckway-props-${zone.id}`,
      minDistance: 3.4,
      avoid: [{ minX: CORRIDOR_AVOID.minX, minZ: zone.start, maxX: CORRIDOR_AVOID.maxX, maxZ: zone.end }],
    });
    points.forEach((point, index) => {
      const propId = zone.propIds[stream() < 0.5 ? 0 : 1];
      const instanceId = `prop-${zone.id}-${index}`;
      const y = ctx.world.groundHeightAt(point.x, point.z);
      const rotationY = stream() * Math.PI * 2;
      placeIdempotent(ctx, propId, point.x, y, point.z, instanceId, rotationY);
      rows.push({ instanceId, z: point.z });
    });
  }
  return rows.sort((a, b) => a.z - b.z);
}

/** Width covered by a single barricade prop — segments are tiled to seal a wider span. */
const BARRICADE_SEGMENT_WIDTH = 8;

export function placeGateBarricades(ctx: GameContext): void {
  for (const gate of ROUTE_GATES) {
    const catalogId = gate.requirement === "plow" ? GATE_BARRICADE_PLOW : GATE_BARRICADE_JUMP;
    const span = gate.laneX[1] - gate.laneX[0];
    // +1 so the even spacing lands at <= one segment width apart and the props seal the span solidly.
    const segments = Math.max(1, Math.ceil(span / BARRICADE_SEGMENT_WIDTH) + 1);
    for (let i = 0; i < segments; i += 1) {
      // Even spacing across [laneX[0], laneX[1]] so a corridor-spanning gate reads as a solid wall.
      const t = segments === 1 ? 0.5 : i / (segments - 1);
      const segX = gate.laneX[0] + t * span;
      const y = ctx.world.groundHeightAt(segX, gate.atZ);
      placeIdempotent(ctx, catalogId, segX, y, gate.atZ, `gate-${gate.id}-${i}`);
    }
  }
}

export function placePickupMarkers(ctx: GameContext): void {
  for (const pickup of PICKUPS) {
    const y = ctx.world.groundHeightAt(pickup.position[0], pickup.position[2]) + 0.9;
    placeIdempotent(ctx, PICKUP_MARKER, pickup.position[0], y, pickup.position[2], `marker-${pickup.id}`);
  }
}

export function placeExitGate(ctx: GameContext): void {
  const y = ctx.world.groundHeightAt(0, EXIT_Z);
  placeIdempotent(ctx, EXIT_GATE_ARCH, 0, y, EXIT_Z, "exit-gate");
}

export function syncPickupMarkers(ctx: GameContext, collected: ReadonlySet<string>, removed: Set<string>): void {
  for (const pickup of PICKUPS) {
    if (!collected.has(pickup.id) || removed.has(pickup.id)) continue;
    removed.add(pickup.id);
    ctx.scene.object.remove(`marker-${pickup.id}`);
  }
}

export function syncCompactorRow(ctx: GameContext, compactorZ: number, rows: readonly PropRow[], cursor: { index: number }): void {
  const margin = 6;
  while (cursor.index < rows.length && rows[cursor.index]!.z < compactorZ - margin) {
    ctx.scene.object.remove(rows[cursor.index]!.instanceId);
    cursor.index += 1;
  }
}
