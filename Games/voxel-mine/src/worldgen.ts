export interface Placement {
  catalogId: string;
  x: number;
  y: number;
  z: number;
}

export const WORLD_RADIUS = 6;

const TREES: readonly [number, number][] = [
  [-4, -4],
  [-3, 4],
  [5, -3],
];

const SAND_PATCH: readonly [number, number][] = [
  [-6, 5],
  [-5, 5],
  [-6, 6],
  [-5, 6],
];

export function generateWorld(): Placement[] {
  const out: Placement[] = [];
  const isSand = (x: number, z: number) => SAND_PATCH.some(([sx, sz]) => sx === x && sz === z);

  for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x += 1) {
    for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z += 1) {
      out.push({ catalogId: isSand(x, z) ? "block_sand" : "block_grass", x, y: -1, z });
      out.push({ catalogId: "block_dirt", x, y: -2, z });
      out.push({ catalogId: "block_stone", x, y: -3, z });
    }
  }

  for (let x = 3; x <= 5; x += 1) {
    for (let z = 3; z <= 5; z += 1) {
      out.push({ catalogId: "block_grass", x, y: 0, z });
    }
  }
  out.push({ catalogId: "block_grass", x: 4, y: 1, z: 4 });

  for (const [tx, tz] of TREES) {
    for (let h = 0; h <= 2; h += 1) out.push({ catalogId: "block_wood", x: tx, y: h, z: tz });
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        out.push({ catalogId: "block_leaves", x: tx + dx, y: 2, z: tz + dz });
      }
    }
    out.push({ catalogId: "block_leaves", x: tx, y: 3, z: tz });
  }

  return out;
}
