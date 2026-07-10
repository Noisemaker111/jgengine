import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededStreams } from "@jgengine/core/random/rng";

import { COURSE_LENGTH, SEED } from "../course/catalog";
import { OBJECT_IDS } from "../objects/catalog";
import { worldZ } from "../../world";

const FENCE_SPACING = 70;
const FENCE_OFFSET = 23;
const WRECK_COUNT = 16;

export function placeProps(ctx: GameContext): void {
  const streams = seededStreams(SEED);
  const jitterRng = streams("props-fences");
  const wreckRng = streams("props-wrecks");

  for (let progress = 40; progress < COURSE_LENGTH - 40; progress += FENCE_SPACING) {
    const z = worldZ(progress + (jitterRng() - 0.5) * 8);
    ctx.scene.object.place(OBJECT_IDS.fencePost, -FENCE_OFFSET + (jitterRng() - 0.5) * 3, 0, z);
    ctx.scene.object.place(OBJECT_IDS.fencePost, FENCE_OFFSET + (jitterRng() - 0.5) * 3, 0, z);
  }

  for (let i = 0; i < WRECK_COUNT; i += 1) {
    const progress = 80 + wreckRng() * (COURSE_LENGTH - 160);
    const x = -72 + wreckRng() * 58;
    const kind = wreckRng() < 0.55 ? OBJECT_IDS.wreckTruck : OBJECT_IDS.wreckSilo;
    ctx.scene.object.place(kind, x, 0, worldZ(progress));
  }
}
