import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { perpendicularOf, tangentAlong } from "./canyonMath";
import {
  BORDER_NODE_INDEX,
  canyonBranches,
  canyonEdges,
  deadendBranches,
  mainPolyline,
  shortcutBranches,
} from "./canyon";
import { OBJECT_IDS } from "../objects/catalog";

const DRESSING_SEED = "canyon-chase-dressing-v1";
const FLANK_SEGMENTS_PER_EDGE = 3;

function placeMainFlankDressing(ctx: GameContext, rng: () => number): number {
  let placed = 0;
  for (const edge of canyonEdges) {
    if (edge.kind !== "main") continue;
    const [tx, tz] = tangentAlong(edge.a, edge.b);
    const [px, pz] = perpendicularOf([tx, tz]);
    for (let i = 0; i < FLANK_SEGMENTS_PER_EDGE; i += 1) {
      for (const side of [-1, 1] as const) {
        const t = (i + 0.5) / FLANK_SEGMENTS_PER_EDGE;
        const alongX = edge.a[0] + (edge.b[0] - edge.a[0]) * t;
        const alongZ = edge.a[2] + (edge.b[2] - edge.a[2]) * t;
        const offset = edge.width + 5 + rng() * 12;
        const x = alongX + px * offset * side;
        const z = alongZ + pz * offset * side;
        const roll = rng();
        const id = roll < 0.5 ? OBJECT_IDS.boulderRedrock : roll < 0.8 ? OBJECT_IDS.scrubSage : OBJECT_IDS.driftwoodStump;
        const scale = 1 + rng() * 1.9;
        ctx.scene.object.place(id, x, 0, z, {
          rotation: rng() * Math.PI * 2,
          visual: { scale: [scale, scale * (0.6 + rng() * 0.6), scale] },
        });
        placed += 1;
      }
    }
  }
  return placed;
}

function placeSurveyMarkers(ctx: GameContext): number {
  let placed = 0;
  for (let i = 0; i < mainPolyline.length; i += 2) {
    const [x, y, z] = mainPolyline[i];
    ctx.scene.object.place(OBJECT_IDS.surveyMarker, x, y, z - 3, { visual: { scale: [0.4, 2.2, 0.4] } });
    placed += 1;
  }
  for (const branch of canyonBranches) {
    const [x, y, z] = branch.waypoints[0];
    ctx.scene.object.place(OBJECT_IDS.surveyMarker, x, y, z, { visual: { scale: [0.4, 2.2, 0.4] } });
    placed += 1;
  }
  return placed;
}

function placeShortcutDeception(ctx: GameContext, rng: () => number): number {
  let placed = 0;
  for (const branch of shortcutBranches) {
    const mouth = branch.waypoints[0];
    const gate = branch.waypoints[1];
    const [tx, tz] = tangentAlong(mouth, gate);
    const [px, pz] = perpendicularOf([tx, tz]);
    const slabCount = 3;
    for (let i = 0; i < slabCount; i += 1) {
      const lateral = (i - (slabCount - 1) / 2) * (branch.width * 0.65);
      const forward = branch.width * 0.4 + rng() * 6;
      const x = mouth[0] + tx * forward + px * lateral;
      const z = mouth[2] + tz * forward + pz * lateral;
      const roll = rng();
      const id =
        roll < 0.45 ? OBJECT_IDS.shadowWallSlab : roll < 0.8 ? OBJECT_IDS.angledDeceptionSlab : OBJECT_IDS.tumbleweedScreen;
      const height = id === OBJECT_IDS.tumbleweedScreen ? 1.4 : 4 + rng() * 3;
      ctx.scene.object.place(id, x, 0, z, {
        rotation: Math.atan2(px, pz) + (rng() - 0.5) * 0.4,
        visual: { scale: [branch.width * 0.5, height, 1.6 + rng() * 1.2] },
      });
      placed += 1;
    }
    ctx.scene.object.place(OBJECT_IDS.wreckRig, mouth[0] + px * branch.width * 1.4, 0, mouth[2] + pz * branch.width * 1.4, {
      visual: { scale: [2.6, 1.4, 4.2] },
    });
    placed += 1;
  }
  return placed;
}

function placeDeadendInvitation(ctx: GameContext, rng: () => number): number {
  let placed = 0;
  for (const branch of deadendBranches) {
    const mouth = branch.waypoints[0];
    const [tx, tz] = tangentAlong(mouth, branch.waypoints[1]);
    const [px, pz] = perpendicularOf([tx, tz]);
    for (const side of [-1, 1] as const) {
      const x = mouth[0] + px * (branch.width + 6) * side + tx * 6;
      const z = mouth[2] + pz * (branch.width + 6) * side + tz * 6;
      ctx.scene.object.place(OBJECT_IDS.scrubSage, x, 0, z, { visual: { scale: [1.6, 1.1, 1.6] } });
      placed += 1;
    }
    ctx.scene.object.place(OBJECT_IDS.wreckRig, mouth[0] - tx * 4, 0, mouth[2] - tz * 4, {
      rotation: rng() * Math.PI * 2,
      visual: { scale: [2.2, 1.2, 3.4] },
    });
    placed += 1;
  }
  return placed;
}

function placeForkDressing(ctx: GameContext, rng: () => number): number {
  let placed = 0;
  for (const branch of canyonBranches) {
    if (branch.kind !== "fork") continue;
    const mouth = branch.waypoints[0];
    const [tx, tz] = tangentAlong(mouth, branch.waypoints[1]);
    const [px, pz] = perpendicularOf([tx, tz]);
    for (const side of [-1, 1] as const) {
      const x = mouth[0] + px * (branch.width + 8) * side;
      const z = mouth[2] + pz * (branch.width + 8) * side;
      ctx.scene.object.place(OBJECT_IDS.boulderRedrock, x, 0, z, {
        rotation: rng() * Math.PI * 2,
        visual: { scale: [2.4, 1.9, 2.4] },
      });
      placed += 1;
    }
  }
  return placed;
}

function placeBorderArch(ctx: GameContext): number {
  const [x, y, z] = mainPolyline[BORDER_NODE_INDEX];
  ctx.scene.object.place(OBJECT_IDS.borderPost, x - 9, y, z, { visual: { scale: [1.4, 9, 1.4] } });
  ctx.scene.object.place(OBJECT_IDS.borderPost, x + 9, y, z, { visual: { scale: [1.4, 9, 1.4] } });
  ctx.scene.object.place(OBJECT_IDS.borderBeam, x, y + 9, z, { visual: { scale: [20, 1.4, 1.4] } });
  return 3;
}

function placeOutpostCrates(ctx: GameContext, rng: () => number): number {
  let placed = 0;
  const outpostCenters: readonly [number, number][] = [
    [mainPolyline[4][0] + 40, mainPolyline[4][2]],
    [mainPolyline[11][0] - 40, mainPolyline[11][2]],
  ];
  for (const [cx, cz] of outpostCenters) {
    for (let i = 0; i < 5; i += 1) {
      const x = cx + (rng() - 0.5) * 12;
      const z = cz + (rng() - 0.5) * 12;
      ctx.scene.object.place(OBJECT_IDS.outpostCrate, x, 0, z, {
        rotation: rng() * Math.PI * 2,
        visual: { scale: [1.2 + rng() * 0.6, 1.2 + rng() * 0.6, 1.2 + rng() * 0.6] },
      });
      placed += 1;
    }
  }
  return placed;
}

export function setupWorld(ctx: GameContext): number {
  const rng = seededRng(DRESSING_SEED);
  let total = 0;
  total += placeMainFlankDressing(ctx, rng);
  total += placeSurveyMarkers(ctx);
  total += placeShortcutDeception(ctx, rng);
  total += placeDeadendInvitation(ctx, rng);
  total += placeForkDressing(ctx, rng);
  total += placeBorderArch(ctx);
  total += placeOutpostCrates(ctx, rng);
  return total;
}
