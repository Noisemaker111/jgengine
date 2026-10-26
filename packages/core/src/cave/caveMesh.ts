import type { CaveGround, CaveLayout } from "./caveLayout";

/** One triangle mesh: xyz per vertex and three vertex indices per triangle. */
export interface CaveMeshPart {
  positions: Float32Array;
  indices: Uint32Array;
}

/** A cave's rock: the inside surface you walk through, the outside hill it sits in, and the floor laid over the ground. */
export interface CaveMesh {
  inner: CaveMeshPart;
  outer: CaveMeshPart;
  floor: CaveMeshPart;
}

/** Points across the tunnel's arch, from the right wall's foot over the roof to the left wall's foot. */
const ARCH = 12;
/** Rings up the chamber's dome and slices round it. */
const DOME_RINGS = 7;
const DOME_SLICES = 36;
/** How far the walls reach below the floor line, so a sloping floor never shows a gap under them. */
const SKIRT = 2;
/** The floor lies this far above the ground it follows, so the terrain's grass never shows through. */
const FLOOR_LIFT = 0.04;
/** Points across the tunnel floor, and rings and slices of the chamber floor. */
const FLOOR_ACROSS = 5;
const FLOOR_RINGS = 5;
const FLOOR_SLICES = 28;

function hash(seed: number, a: number, b: number): number {
  let h = (seed * 374761393 + a * 668265263 + b * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Where on the arch point `j` of {@link ARCH} sits: sideways share (-1 right .. 1 left) and height share (0..1). */
function archPoint(j: number): [number, number] {
  const theta = (Math.PI * j) / ARCH;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // Squarer than a half circle: steep walls, a flatter roof.
  return [Math.sign(c) * Math.abs(c) ** 0.55, s ** 0.7];
}

class Builder {
  positions: number[] = [];
  indices: number[] = [];
  vertex(x: number, y: number, z: number): number {
    this.positions.push(x, y, z);
    return this.positions.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }
  done(): CaveMeshPart {
    return { positions: new Float32Array(this.positions), indices: new Uint32Array(this.indices) };
  }
}

/**
 * The rock of a cave laid out by `caveLayout`: an arched tunnel swept down its centreline into a domed chamber,
 * inside and out, with a rock face round the mouth, and a floor that follows the ground under both. Lumpy by the layout's seed.
 * @capability cave-mesh triangle meshes for a cave's inside and the hill around it, from its layout
 */
export function caveMesh(layout: CaveLayout, ground: CaveGround): CaveMesh {
  const inner = new Builder();
  const outer = new Builder();
  const { path, width, height, cover, seed } = layout;
  const { center, radius } = layout.chamber;
  const half = width / 2;
  const domeHeight = height * 1.5;

  // The tunnel runs until it is well inside the dome.
  const tunnel = path.filter((point, i) => i === 0 || Math.hypot(point[0] - center[0], point[1] - center[1]) > radius * 0.75);
  const rings = (builder: Builder, wide: number, tall: number, lump: number, salt: number): number[][] =>
    tunnel.map((point, i) => {
      const a = tunnel[Math.max(0, i - 1)]!;
      const b = tunnel[Math.min(tunnel.length - 1, i + 1)]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const right: [number, number] = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
      const floor = ground(point[0], point[1]);
      return Array.from({ length: ARCH + 1 }, (_, j) => {
        const [side, up] = archPoint(j);
        const bump = 1 + (hash(seed + salt, i, j) - 0.5) * lump;
        const x = side * wide * bump;
        const y = j === 0 || j === ARCH ? -SKIRT : up * tall * bump;
        return builder.vertex(point[0] + right[0] * x, floor + y, point[1] + right[1] * x);
      });
    });
  const innerRings = rings(inner, half, height, 0.18, 0);
  const outerRings = rings(outer, half + cover, height + cover * 0.8, 0.6, 1);
  for (const [builder, list] of [[inner, innerRings], [outer, outerRings]] as const) {
    for (let i = 1; i < list.length; i += 1) {
      for (let j = 1; j <= ARCH; j += 1) builder.quad(list[i - 1]![j - 1]!, list[i]![j - 1]!, list[i]![j]!, list[i - 1]![j]!);
    }
  }
  // The rock face round the mouth, from the inside arch out to the hill's.
  const mouthInner = innerRings[0]!.map((index) => outer.vertex(inner.positions[index * 3]!, inner.positions[index * 3 + 1]!, inner.positions[index * 3 + 2]!));
  for (let j = 1; j <= ARCH; j += 1) outer.quad(mouthInner[j - 1]!, mouthInner[j]!, outerRings[0]![j]!, outerRings[0]![j - 1]!);

  // The chamber's dome, open where the tunnel comes in.
  const last = tunnel[tunnel.length - 1]!;
  const entry = Math.atan2(last[1] - center[1], last[0] - center[0]);
  const floor = ground(center[0], center[1]);
  const dome = (builder: Builder, r: number, tall: number, open: number, openHeight: number, lump: number) => {
    const grid: number[][] = [];
    for (let k = 0; k <= DOME_RINGS; k += 1) {
      const phi = (k / DOME_RINGS) * (Math.PI / 2);
      const row: number[] = [];
      for (let s = 0; s <= DOME_SLICES; s += 1) {
        const lon = (s / DOME_SLICES) * Math.PI * 2;
        const bump = k === DOME_RINGS ? 1 : 1 + (hash(seed, 1000 + k, s % DOME_SLICES) - 0.5) * lump;
        const x = center[0] + Math.cos(lon) * r * Math.cos(phi) * bump;
        const z = center[1] + Math.sin(lon) * r * Math.cos(phi) * bump;
        const y = k === 0 ? floor - SKIRT : floor + Math.sin(phi) * tall * bump;
        row.push(builder.vertex(x, y, z));
      }
      grid.push(row);
    }
    for (let k = 1; k <= DOME_RINGS; k += 1) {
      const y = Math.sin(((k - 0.5) / DOME_RINGS) * (Math.PI / 2)) * tall;
      for (let s = 1; s <= DOME_SLICES; s += 1) {
        const lon = ((s - 0.5) / DOME_SLICES) * Math.PI * 2;
        const off = Math.abs(Math.atan2(Math.sin(lon - entry), Math.cos(lon - entry)));
        if (off < open && y < openHeight) continue;
        builder.quad(grid[k - 1]![s - 1]!, grid[k - 1]![s]!, grid[k]![s]!, grid[k]![s - 1]!);
      }
    }
  };
  dome(inner, radius, domeHeight, Math.asin(Math.min(1, half / radius)) + 0.05, height, 0.15);
  dome(outer, radius + cover, domeHeight + cover, Math.asin(Math.min(1, (half + cover) / (radius + cover))) + 0.05, height + cover * 0.8, 0.35);

  // The floor: a strip down the whole path into the chamber, then a disc filling the chamber, each point on the ground.
  const ground_ = new Builder();
  const lay = (x: number, z: number) => ground_.vertex(x, ground(x, z) + FLOOR_LIFT, z);
  const strip = path.map((point, i) => {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(path.length - 1, i + 1)]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const right: [number, number] = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
    return Array.from({ length: FLOOR_ACROSS }, (_, k) => {
      const x = (k / (FLOOR_ACROSS - 1) - 0.5) * width;
      return lay(point[0] + right[0] * x, point[1] + right[1] * x);
    });
  });
  for (let i = 1; i < strip.length; i += 1) {
    for (let k = 1; k < FLOOR_ACROSS; k += 1) ground_.quad(strip[i - 1]![k - 1]!, strip[i - 1]![k]!, strip[i]![k]!, strip[i]![k - 1]!);
  }
  const middle = lay(center[0], center[1]);
  const discs = Array.from({ length: FLOOR_RINGS }, (_, k) =>
    Array.from({ length: FLOOR_SLICES }, (_, s) => {
      const r = (radius * (k + 1)) / FLOOR_RINGS;
      const lon = (s / FLOOR_SLICES) * Math.PI * 2;
      return lay(center[0] + Math.cos(lon) * r, center[1] + Math.sin(lon) * r);
    }),
  );
  for (let s = 0; s < FLOOR_SLICES; s += 1) {
    const t = (s + 1) % FLOOR_SLICES;
    ground_.indices.push(middle, discs[0]![t]!, discs[0]![s]!);
    for (let k = 1; k < FLOOR_RINGS; k += 1) ground_.quad(discs[k - 1]![s]!, discs[k - 1]![t]!, discs[k]![t]!, discs[k]![s]!);
  }
  return { inner: inner.done(), outer: outer.done(), floor: ground_.done() };
}
