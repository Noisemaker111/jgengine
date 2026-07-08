export const COLS = 19;
export const ROWS = 21;
export const XMIN = -(COLS - 1) / 2;
export const ZMIN = -(ROWS - 1) / 2;

export interface Cell {
  c: number;
  r: number;
}

const PEN = { c0: 7, c1: 11, r0: 9, r1: 12 } as const;
const DOOR: Cell = { c: 9, r: 9 };

export const PLAYER_START: Cell = { c: 9, r: 19 };
export const PEN_CENTER: Cell = { c: 9, r: 10 };

export function cellKey(c: number, r: number): string {
  return `${c},${r}`;
}

function onPenPerimeter(c: number, r: number): boolean {
  const inside = c >= PEN.c0 && c <= PEN.c1 && r >= PEN.r0 && r <= PEN.r1;
  if (!inside) return false;
  return c === PEN.c0 || c === PEN.c1 || r === PEN.r0 || r === PEN.r1;
}

function inPenInterior(c: number, r: number): boolean {
  return c > PEN.c0 && c < PEN.c1 && r > PEN.r0 && r < PEN.r1;
}

function computeWall(c: number, r: number): boolean {
  if (c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1) return true;
  if (c === DOOR.c && r === DOOR.r) return false;
  if (onPenPerimeter(c, r)) return true;
  if (inPenInterior(c, r)) return false;
  const tooth = c % 2 === 0 && c >= 2 && c <= COLS - 3;
  if (tooth && r >= 2 && r <= 7) return true;
  if (tooth && r >= 13 && r <= 18) return true;
  return false;
}

const wallSet = new Set<string>();
export const wallCells: readonly Cell[] = (() => {
  const cells: Cell[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (computeWall(c, r)) {
        wallSet.add(cellKey(c, r));
        cells.push({ c, r });
      }
    }
  }
  return cells;
})();

export function isWall(c: number, r: number): boolean {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
  return wallSet.has(cellKey(c, r));
}

export const powerCells: readonly Cell[] = [
  { c: 1, r: 1 },
  { c: COLS - 2, r: 1 },
  { c: 1, r: ROWS - 2 },
  { c: COLS - 2, r: ROWS - 2 },
];

const powerSet = new Set(powerCells.map((cell) => cellKey(cell.c, cell.r)));

export type PowerupKind = "forcefield" | "doublebarrel" | "lantern";

export interface PowerupSpawn extends Cell {
  kind: PowerupKind;
}

export const POWERUP_SPAWNS: readonly PowerupSpawn[] = [
  { c: 3, r: 3, kind: "forcefield" },
  { c: COLS - 4, r: 3, kind: "doublebarrel" },
  { c: 9, r: 3, kind: "lantern" },
  { c: 3, r: ROWS - 4, kind: "doublebarrel" },
  { c: COLS - 4, r: ROWS - 4, kind: "forcefield" },
  { c: 9, r: ROWS - 4, kind: "lantern" },
];

const powerupSet = new Set(POWERUP_SPAWNS.map((cell) => cellKey(cell.c, cell.r)));

export const pelletCells: readonly Cell[] = (() => {
  const cells: Cell[] = [];
  for (let r = 1; r < ROWS - 1; r += 1) {
    for (let c = 1; c < COLS - 1; c += 1) {
      if (isWall(c, r)) continue;
      if (inPenInterior(c, r)) continue;
      if (c === DOOR.c && r === DOOR.r) continue;
      if (c === PLAYER_START.c && r === PLAYER_START.r) continue;
      if (powerSet.has(cellKey(c, r))) continue;
      if (powerupSet.has(cellKey(c, r))) continue;
      cells.push({ c, r });
    }
  }
  return cells;
})();

const PLAYER_RADIUS = 0.34;

function cellBlocked(x: number, z: number): boolean {
  const cell = worldToCell(x, z);
  return isWall(cell.c, cell.r);
}

export function collideSlide(ox: number, oz: number, nx: number, nz: number): [number, number] {
  const r = PLAYER_RADIUS;
  const free = (x: number, z: number): boolean =>
    !cellBlocked(x - r, z - r) &&
    !cellBlocked(x + r, z - r) &&
    !cellBlocked(x - r, z + r) &&
    !cellBlocked(x + r, z + r);
  if (free(nx, nz)) return [nx, nz];
  if (free(nx, oz)) return [nx, oz];
  if (free(ox, nz)) return [ox, nz];
  return [ox, oz];
}

export const CORNERS: readonly Cell[] = [
  { c: 1, r: 1 },
  { c: COLS - 2, r: 1 },
  { c: 1, r: ROWS - 2 },
  { c: COLS - 2, r: ROWS - 2 },
];

export interface GhostDef {
  id: string;
  kind: string;
  color: string;
  start: Cell;
  scatter: Cell;
  leash: boolean;
  ahead: number;
}

export const GHOSTS: readonly GhostDef[] = [
  { id: "hunter", kind: "hunter", color: "#ff2d2d", start: { c: 9, r: 10 }, scatter: { c: COLS - 2, r: 1 }, leash: false, ahead: 0 },
  { id: "ambush", kind: "ambush", color: "#ffb0e6", start: { c: 8, r: 10 }, scatter: { c: 1, r: 1 }, leash: false, ahead: 4 },
  { id: "flank", kind: "flank", color: "#3df0f0", start: { c: 10, r: 10 }, scatter: { c: COLS - 2, r: ROWS - 2 }, leash: false, ahead: 2 },
  { id: "shy", kind: "shy", color: "#ffa63d", start: { c: 9, r: 11 }, scatter: { c: 1, r: ROWS - 2 }, leash: true, ahead: 0 },
];

export function cellToWorld(c: number, r: number): [number, number, number] {
  return [XMIN + c, 0, ZMIN + r];
}

export function worldToCell(x: number, z: number): Cell {
  return { c: Math.round(x - XMIN), r: Math.round(z - ZMIN) };
}

export function isWalkableWorld(x: number, z: number): boolean {
  const cell = worldToCell(x, z);
  return !isWall(cell.c, cell.r);
}

export const NAV_BOUNDS = {
  minX: XMIN - 0.5,
  maxX: XMIN + (COLS - 1) + 0.5,
  minZ: ZMIN - 0.5,
  maxZ: ZMIN + (ROWS - 1) + 0.5,
};

export function reachableFrom(start: Cell): Set<string> {
  const seen = new Set<string>();
  const stack: Cell[] = [start];
  while (stack.length > 0) {
    const cell = stack.pop()!;
    const k = cellKey(cell.c, cell.r);
    if (seen.has(k) || isWall(cell.c, cell.r)) continue;
    seen.add(k);
    stack.push({ c: cell.c + 1, r: cell.r });
    stack.push({ c: cell.c - 1, r: cell.r });
    stack.push({ c: cell.c, r: cell.r + 1 });
    stack.push({ c: cell.c, r: cell.r - 1 });
  }
  return seen;
}

(function assertConnected(): void {
  const seen = reachableFrom(PLAYER_START);
  for (const cell of [...pelletCells, ...powerCells]) {
    if (!seen.has(cellKey(cell.c, cell.r))) {
      throw new Error(`maze: pellet at ${cell.c},${cell.r} is unreachable`);
    }
  }
})();
