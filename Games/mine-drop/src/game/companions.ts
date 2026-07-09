import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { outwardDir } from "./phase";
import { BOARD_N, COMPANION_IDS, FLOOR_Y, TABLE_TOP, cellWorld } from "./tuning";

const CENTER = Math.round((BOARD_N - 1) / 2);
const [CENTER_X, CENTER_Z] = cellWorld(CENTER, CENTER);

export interface CompanionHome {
  id: string;
  col: number;
  row: number;
}

export const COMPANION_HOMES: CompanionHome[] = [
  { id: COMPANION_IDS[0], col: Math.max(0, CENTER - 1), row: Math.min(BOARD_N - 1, CENTER + 2) },
  { id: COMPANION_IDS[1], col: Math.min(BOARD_N - 1, CENTER + 1), row: Math.min(BOARD_N - 1, CENTER + 2) },
];

export function spawnCompanions(ctx: GameContext): void {
  for (const home of COMPANION_HOMES) {
    const [x, z] = cellWorld(home.col, home.row);
    ctx.scene.entity.spawn(home.id, {
      id: home.id,
      position: [x, TABLE_TOP, z],
      rotationY: 0,
      role: "prop",
    });
  }
}

export function setCompanionsY(ctx: GameContext, y: number, dt: number): void {
  for (const home of COMPANION_HOMES) {
    const [x, z] = cellWorld(home.col, home.row);
    ctx.scene.entity.setPose(home.id, { position: [x, y, z], rotationY: 0, dt });
  }
}

export function scatterCompanions(ctx: GameContext, t: number, dt: number): void {
  const arc = Math.sin(Math.min(1, t) * Math.PI);
  for (const home of COMPANION_HOMES) {
    const [hx, hz] = cellWorld(home.col, home.row);
    const dir = outwardDir(hx, hz, CENTER_X, CENTER_Z);
    const x = hx + dir.dx * 40 * t;
    const z = hz + dir.dz * 40 * t;
    const y = TABLE_TOP + arc * 12 - t * (TABLE_TOP - FLOOR_Y);
    ctx.scene.entity.setPose(home.id, {
      position: [x, Math.max(FLOOR_Y, y), z],
      rotationY: t * 12,
      dt,
    });
  }
}

export function resetCompanions(ctx: GameContext): void {
  for (const home of COMPANION_HOMES) {
    const [x, z] = cellWorld(home.col, home.row);
    ctx.scene.entity.setPose(home.id, { position: [x, TABLE_TOP, z], rotationY: 0 });
  }
}
