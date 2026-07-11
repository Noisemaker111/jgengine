import {
  BARRIER_E,
  BUMPER_E,
  BUMPER_KICK,
  BUMPER_R,
  CX,
  DROP_BANK_COUNT,
  FLIPPER_CAP_R,
  FLIPPER_LEN,
  LEFT_ACTIVE,
  LEFT_PIVOT_X,
  LEFT_REST,
  PIVOT_Y,
  RIGHT_ACTIVE,
  RIGHT_PIVOT_X,
  RIGHT_REST,
  SLING_KICK,
  WALL_E,
} from "./config";
import type { Barrier, Bumper, DropTarget, Flipper, RolloverLane, Slingshot, Wall } from "./types";

const FIELD_REF = { x: CX, y: 200 };

function wall(ax: number, ay: number, bx: number, by: number, e: number, kick?: number, slingId?: number): Wall {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  if ((FIELD_REF.x - mx) * nx + (FIELD_REF.y - my) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { ax, ay, bx, by, nx, ny, e, kick, slingId };
}

export interface Table {
  walls: Wall[];
  barriers: Barrier[];
  bumpers: Bumper[];
  slingshots: Slingshot[];
  dropTargets: DropTarget[];
  rollovers: RolloverLane[];
  flippers: [Flipper, Flipper];
}

const SLING_FACES: ReadonlyArray<readonly [number, number, number, number]> = [
  [40, 304, 62, 276],
  [176, 304, 154, 276],
];

export function buildTable(): Table {
  const walls: Wall[] = [
    wall(8, 40, 8, 300, WALL_E),
    wall(8, 40, 150, 40, WALL_E),
    wall(150, 40, 206, 66, WALL_E),
    wall(208, 40, 208, 372, WALL_E),
    wall(SLING_FACES[0][0], SLING_FACES[0][1], SLING_FACES[0][2], SLING_FACES[0][3], WALL_E, SLING_KICK, 0),
    wall(SLING_FACES[1][0], SLING_FACES[1][1], SLING_FACES[1][2], SLING_FACES[1][3], WALL_E, SLING_KICK, 1),
  ];

  const barriers: Barrier[] = [{ ax: 189, ay: 84, bx: 189, by: 372, capR: 1.5, e: BARRIER_E }];

  const bumpers: Bumper[] = [
    { x: 70, y: 150, r: BUMPER_R, e: BUMPER_E, kick: BUMPER_KICK, id: 0, flash: 0 },
    { x: 146, y: 150, r: BUMPER_R, e: BUMPER_E, kick: BUMPER_KICK, id: 1, flash: 0 },
    { x: 108, y: 196, r: BUMPER_R, e: BUMPER_E, kick: BUMPER_KICK, id: 2, flash: 0 },
  ];

  const slingshots: Slingshot[] = SLING_FACES.map((f, id) => ({ ax: f[0], ay: f[1], bx: f[2], by: f[3], id, flash: 0 }));

  const dropTargets: DropTarget[] = [];
  for (let i = 0; i < DROP_BANK_COUNT; i += 1) {
    const cx = 40 + i * 24;
    dropTargets.push({ ax: cx - 9, ay: 118, bx: cx + 9, by: 118, capR: 2.5, up: true, flash: 0 });
  }

  const rollovers: RolloverLane[] = [
    { x0: 26, x1: 64, y0: 56, y1: 82 },
    { x0: 84, x1: 122, y0: 56, y1: 82 },
    { x0: 142, x1: 180, y0: 56, y1: 82 },
  ];

  const flippers: [Flipper, Flipper] = [
    {
      side: "left",
      px: LEFT_PIVOT_X,
      py: PIVOT_Y,
      len: FLIPPER_LEN,
      capR: FLIPPER_CAP_R,
      rest: LEFT_REST,
      active: LEFT_ACTIVE,
      angle: LEFT_REST,
      omega: 0,
      up: false,
      glow: 0,
    },
    {
      side: "right",
      px: RIGHT_PIVOT_X,
      py: PIVOT_Y,
      len: FLIPPER_LEN,
      capR: FLIPPER_CAP_R,
      rest: RIGHT_REST,
      active: RIGHT_ACTIVE,
      angle: RIGHT_REST,
      omega: 0,
      up: false,
      glow: 0,
    },
  ];

  return { walls, barriers, bumpers, slingshots, dropTargets, rollovers, flippers };
}
