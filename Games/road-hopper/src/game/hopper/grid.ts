import {
  BAY_COLS,
  COLS,
  HOME_ROW,
  HOME_TOLERANCE,
  MEDIAN_ROW,
  OFF_MAX,
  OFF_MIN,
  RIVER_ROWS,
  ROAD_ROWS,
  START_ROW,
} from "./constants";

export type HopDir = "up" | "down" | "left" | "right";

export interface GridPos {
  readonly col: number;
  readonly row: number;
}

export function isRoadRow(row: number): boolean {
  return ROAD_ROWS.includes(row);
}

export function isRiverRow(row: number): boolean {
  return RIVER_ROWS.includes(row);
}

export function isSafeRow(row: number): boolean {
  return row === START_ROW || row === MEDIAN_ROW;
}

export function clampCol(col: number): number {
  return Math.max(0, Math.min(COLS - 1, col));
}

export function snapCol(col: number): number {
  return clampCol(Math.round(col));
}

/** Resolve a discrete hop against field bounds. Returns null when the hop is blocked by an edge. */
export function resolveHop(pos: GridPos, dir: HopDir): GridPos | null {
  switch (dir) {
    case "up":
      return pos.row >= HOME_ROW ? null : { col: pos.col, row: pos.row + 1 };
    case "down":
      return pos.row <= START_ROW ? null : { col: pos.col, row: pos.row - 1 };
    case "left": {
      const col = pos.col - 1;
      return col < 0 ? null : { col, row: pos.row };
    }
    case "right": {
      const col = pos.col + 1;
      return col > COLS - 1 ? null : { col, row: pos.row };
    }
  }
}

export function isOffField(col: number): boolean {
  return col < OFF_MIN || col > OFF_MAX;
}

export interface BayTarget {
  readonly index: number;
  readonly col: number;
  readonly distance: number;
}

/** Nearest home bay to a (possibly fractional) column, with the distance to its centre. */
export function nearestBay(col: number): BayTarget {
  let best: BayTarget = { index: 0, col: BAY_COLS[0]!, distance: Math.abs(col - BAY_COLS[0]!) };
  for (let i = 1; i < BAY_COLS.length; i += 1) {
    const bayCol = BAY_COLS[i]!;
    const distance = Math.abs(col - bayCol);
    if (distance < best.distance) best = { index: i, col: bayCol, distance };
  }
  return best;
}

export function isBayAligned(col: number): boolean {
  return nearestBay(col).distance <= HOME_TOLERANCE;
}

/** 1-D axis-aligned overlap of the unit hopper footprint [col, col+1] against a body [x, x+len]. */
export function footprintsOverlap(col: number, bodyX: number, bodyLen: number): boolean {
  return bodyX < col + 1 && bodyX + bodyLen > col;
}

/** Whether a body [x, x+len] spans the hopper's centre (used for riding a log/turtle). */
export function bodyCoversCentre(col: number, bodyX: number, bodyLen: number): boolean {
  const centre = col + 0.5;
  return bodyX <= centre && centre <= bodyX + bodyLen;
}
