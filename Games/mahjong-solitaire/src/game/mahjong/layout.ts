// The classic 144-tile turtle, authored as data. Coordinates are in half-tile
// units; every tile footprint spans [x, x+2) x [y, y+2). Layers z=0 (base) to 4
// (crown). Layer distribution: 87 / 36 / 16 / 4 / 1.

export interface Slot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function buildSlots(): Slot[] {
  const raw: Array<{ x: number; y: number; z: number }> = [];
  const add = (x: number, y: number, z: number): void => {
    raw.push({ x, y, z });
  };

  const rows: Record<number, readonly number[]> = {
    0: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
    2: [6, 8, 10, 12, 14, 16, 18, 20],
    4: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
    6: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
    8: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
    10: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
    12: [6, 8, 10, 12, 14, 16, 18, 20],
    14: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
  };
  for (const key of Object.keys(rows)) {
    const y = Number(key);
    for (const x of rows[y]) add(x, y, 0);
  }
  // Turtle tail (far left) and head + nose (far right), on the base layer.
  add(0, 7, 0);
  add(26, 7, 0);
  add(28, 7, 0);

  // Stacked shell, each layer centered on the board so it rests on the one below.
  for (const x of [8, 10, 12, 14, 16, 18]) for (const y of [2, 4, 6, 8, 10, 12]) add(x, y, 1);
  for (const x of [10, 12, 14, 16]) for (const y of [4, 6, 8, 10]) add(x, y, 2);
  for (const x of [12, 14]) for (const y of [6, 8]) add(x, y, 3);
  add(13, 7, 4);

  return raw.map((s, id) => ({ id, x: s.x, y: s.y, z: s.z }));
}

export const TURTLE: readonly Slot[] = buildSlots();
export const SLOT_COUNT = TURTLE.length;

const overlaps = (ax: number, ay: number, bx: number, by: number): boolean =>
  Math.abs(ax - bx) < 2 && Math.abs(ay - by) < 2;

interface Adjacency {
  readonly above: readonly number[];
  readonly left: readonly number[];
  readonly right: readonly number[];
}

function buildAdjacency(): readonly Adjacency[] {
  return TURTLE.map((s) => {
    const above: number[] = [];
    const left: number[] = [];
    const right: number[] = [];
    for (const t of TURTLE) {
      if (t.id === s.id) continue;
      if (t.z === s.z + 1 && overlaps(t.x, t.y, s.x, s.y)) above.push(t.id);
      if (t.z === s.z && overlaps(t.x, t.y, s.x - 2, s.y)) left.push(t.id);
      if (t.z === s.z && overlaps(t.x, t.y, s.x + 2, s.y)) right.push(t.id);
    }
    return { above, left, right };
  });
}

const ADJ: readonly Adjacency[] = buildAdjacency();

// A tile is FREE when nothing rests on top of it AND at least one long side
// (left or right) is fully open at its own layer.
export function isFree(id: number, present: ReadonlySet<number>): boolean {
  const adj = ADJ[id];
  for (const t of adj.above) if (present.has(t)) return false;
  const leftBlocked = adj.left.some((t) => present.has(t));
  const rightBlocked = adj.right.some((t) => present.has(t));
  return !leftBlocked || !rightBlocked;
}

export function isCovered(id: number, present: ReadonlySet<number>): boolean {
  return ADJ[id].above.some((t) => present.has(t));
}

export function sideOpen(id: number, present: ReadonlySet<number>, side: "left" | "right"): boolean {
  return !ADJ[id][side].some((t) => present.has(t));
}

export function freeSlots(present: ReadonlySet<number>): number[] {
  const out: number[] = [];
  for (const id of present) if (isFree(id, present)) out.push(id);
  return out;
}

// Every non-base tile must rest on a fully covered 2x2 footprint of the layer
// below — the layout-integrity invariant the world test asserts.
export function isFullySupported(id: number): boolean {
  const s = TURTLE[id];
  if (s.z === 0) return true;
  const quads: ReadonlyArray<readonly [number, number]> = [
    [s.x + 0.5, s.y + 0.5],
    [s.x + 1.5, s.y + 0.5],
    [s.x + 0.5, s.y + 1.5],
    [s.x + 1.5, s.y + 1.5],
  ];
  return quads.every(([qx, qy]) =>
    TURTLE.some((t) => t.z === s.z - 1 && qx > t.x && qx < t.x + 2 && qy > t.y && qy < t.y + 2),
  );
}

export function slotIdAt(x: number, y: number, z: number): number | null {
  const s = TURTLE.find((t) => t.x === x && t.y === y && t.z === z);
  return s === undefined ? null : s.id;
}

export interface LayoutBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly maxZ: number;
}

export function layoutBounds(): LayoutBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxZ = 0;
  for (const s of TURTLE) {
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x + 2);
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y + 2);
    maxZ = Math.max(maxZ, s.z);
  }
  return { minX, maxX, minY, maxY, maxZ };
}
