import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { outwardDir } from "./phase";
import { BOARD_N, COMPANION_IDS, FLOOR_Y, TABLE_TOP } from "./tuning";

const CENTER = Math.round((BOARD_N - 1) / 2);

export interface CompanionHome {
  id: string;
  col: number;
  row: number;
}

// The crew stands two rows ahead of the player (+Z) so they read as little
// figures out on the board rather than looming at the camera.
export const COMPANION_HOMES: CompanionHome[] = [
  { id: COMPANION_IDS[0], col: Math.max(0, CENTER - 1), row: Math.min(BOARD_N - 1, CENTER + 2) },
  { id: COMPANION_IDS[1], col: Math.min(BOARD_N - 1, CENTER + 1), row: Math.min(BOARD_N - 1, CENTER + 2) },
];

export function spawnCompanions(ctx: GameContext): void {
  for (const home of COMPANION_HOMES) {
    ctx.scene.entity.spawn(home.id, {
      id: home.id,
      position: [home.col, TABLE_TOP, home.row],
      rotationY: 0,
      role: "prop",
    });
  }
}

/** Drop or lift the whole crew straight down/up beside their cells. */
export function setCompanionsY(ctx: GameContext, y: number, dt: number): void {
  for (const home of COMPANION_HOMES) {
    ctx.scene.entity.setPose(home.id, { position: [home.col, y, home.row], rotationY: 0, dt });
  }
}

/** Fling the crew off the tabletop when the board detonates. `t` runs 0 -> 1. */
export function scatterCompanions(ctx: GameContext, t: number, dt: number): void {
  const arc = Math.sin(Math.min(1, t) * Math.PI);
  for (const home of COMPANION_HOMES) {
    const dir = outwardDir(home.col, home.row, CENTER, CENTER);
    const x = home.col + dir.dx * 16 * t;
    const z = home.row + dir.dz * 16 * t;
    const y = TABLE_TOP + arc * 6 - t * (TABLE_TOP - FLOOR_Y);
    ctx.scene.entity.setPose(home.id, {
      position: [x, Math.max(FLOOR_Y, y), z],
      rotationY: t * 12,
      dt,
    });
  }
}

export function resetCompanions(ctx: GameContext): void {
  for (const home of COMPANION_HOMES) {
    ctx.scene.entity.setPose(home.id, { position: [home.col, TABLE_TOP, home.row], rotationY: 0 });
  }
}
