import { createMarkerSet, type MarkerSet } from "@jgengine/core/world/markers";
import { createSpawnPoints, type SpawnPoints } from "@jgengine/core/game/spawnPoints";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { ROOF_BRIDGE_AWNING, ROOF_BRIDGE_PLANK, ROOF_MATERIAL_COLORS, ROOF_TILE } from "../objects/catalog";
import { RUNNERS, runnerByLegIndex } from "../runners/catalog";
import { allCheckpoints, ROUTE, type Route } from "../route/legs";
import { ROOF_PROPS } from "../route/props";

export function placeRoute(ctx: GameContext, route: Route = ROUTE): void {
  for (const leg of route.legs) {
    for (const platform of leg.platforms) {
      const [w, d] = platform.footprint;
      const halfW = (w - 1) / 2;
      const halfD = (d - 1) / 2;
      const color = ROOF_MATERIAL_COLORS[platform.material];
      const [cx, cz] = platform.center;
      const tileY = platform.roofY - 1;
      for (let lx = -halfW; lx <= halfW; lx += 1) {
        for (let lz = -halfD; lz <= halfD; lz += 1) {
          ctx.scene.object.place(ROOF_TILE, cx + lx, tileY, cz + lz, {
            instanceId: `tile-${platform.id}-${lx},${lz}`,
            visual: { color },
          });
        }
      }
    }

    for (const gap of leg.gaps) {
      if (gap.bridge === undefined) continue;
      const catalogId = gap.bridge === "plank" ? ROOF_BRIDGE_PLANK : ROOF_BRIDGE_AWNING;
      const [mx, mz] = gap.midpoint;
      const tileY = gap.roofY - 1;
      const midZ = Math.round(mz);
      for (let i = -1; i <= 1; i += 1) {
        ctx.scene.object.place(catalogId, Math.round(mx), tileY, midZ + i, {
          instanceId: `bridge-${leg.spec.id}-${gap.gapIndex}-${i}`,
        });
      }
    }
  }

  for (const prop of ROOF_PROPS) {
    ctx.scene.object.place(prop.catalogId, prop.position[0], prop.position[1], prop.position[2], {
      instanceId: prop.id,
    });
  }
}

export function recordCheckpoints(route: Route = ROUTE): SpawnPoints {
  const points = createSpawnPoints();
  for (const cp of allCheckpoints(route)) {
    points.record(cp.id, { x: cp.position[0], y: cp.position[1], z: cp.position[2] });
  }
  return points;
}

export function buildRouteMarkers(route: Route = ROUTE): MarkerSet {
  const markers = createMarkerSet();
  for (const leg of route.legs) {
    markers.add({
      id: `${leg.spec.id}-start-marker`,
      kind: "location",
      position: leg.startCheckpoint.position,
      label: `${leg.spec.name} start`,
    });
    markers.add({
      id: `${leg.spec.id}-handoff-marker`,
      kind: "objective",
      position: leg.handoffCheckpoint.position,
      label: `${leg.spec.name} handoff`,
    });
  }
  return markers;
}

export function spawnRunners(ctx: GameContext, route: Route = ROUTE): void {
  for (const runner of RUNNERS) {
    const leg = route.legs[runner.legIndex]!;
    const [x, y, z] = leg.startCheckpoint.position;
    ctx.scene.entity.spawn(runner.id, {
      id: runner.legIndex === 0 ? ctx.player.userId : runner.id,
      position: [x, y, z],
      role: runner.legIndex === 0 ? "player" : "npc",
    });
    if (runner.legIndex > 0) ctx.player.possession.own(ctx.player.userId, runner.id);
  }
}

export function respawnRunnersAtLegStarts(ctx: GameContext, route: Route = ROUTE): void {
  for (const runner of RUNNERS) {
    const leg = route.legs[runner.legIndex]!;
    const [x, y, z] = leg.startCheckpoint.position;
    const entityId = runner.legIndex === 0 ? ctx.player.userId : runner.id;
    ctx.scene.entity.setPose(entityId, { position: [x, y, z] });
    if (runner.legIndex > 0) ctx.player.possession.own(ctx.player.userId, runner.id);
  }
  ctx.player.possession.possess(ctx.player.userId, ctx.player.userId);
}

export function possessRunnerForLeg(ctx: GameContext, legIndex: number): void {
  const runner = runnerByLegIndex(legIndex);
  const entityId = legIndex === 0 ? ctx.player.userId : runner.id;
  ctx.player.possession.possess(ctx.player.userId, entityId);
}
