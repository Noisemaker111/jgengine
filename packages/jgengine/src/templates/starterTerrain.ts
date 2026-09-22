/** A `TerraformSnapshot`-shaped sculpt, written into a new scene's `terrain` field. */
export interface StarterTerrain {
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  cellSize: number;
  cols: number;
  rows: number;
  offsets: number[];
  surfaces: null[];
}

const HALF_EXTENT = 480;
const CELL_SIZE = 16;
const AMPLITUDE = 10;
const WAVELENGTH = 150;
const OCTAVES = 4;
/** Radius around the origin kept flat so the spawn and starter props sit on level ground. */
const FLAT_RADIUS = 10;
const FLAT_BLEND = 22;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function lattice(seed: number, ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + seed) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(seed: number, x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = lattice(seed, ix, iz);
  const b = lattice(seed, ix + 1, iz);
  const c = lattice(seed, ix, iz + 1);
  const d = lattice(seed, ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Gentle rolling hills for a new 3D scene, deterministic per game id. They are scene content, not
 * world code: the editor (F2+E) re-sculpts them and `environment({ sculpt })` renders and collides
 * with them. The origin stays flat for the spawn and the edges taper to 0 into the base ground.
 */
export function starterTerrain(seedText: string): StarterTerrain {
  const seed = hashSeed(seedText);
  const cols = (HALF_EXTENT * 2) / CELL_SIZE;
  const rows = cols;
  const offsets: number[] = [];
  for (let gz = 0; gz <= rows; gz += 1) {
    for (let gx = 0; gx <= cols; gx += 1) {
      const x = -HALF_EXTENT + gx * CELL_SIZE;
      const z = -HALF_EXTENT + gz * CELL_SIZE;
      let height = 0;
      let amplitude = 1;
      let frequency = 1 / WAVELENGTH;
      let norm = 0;
      for (let octave = 0; octave < OCTAVES; octave += 1) {
        height += (valueNoise(seed + octave * 1013, x * frequency, z * frequency) - 0.5) * 2 * amplitude;
        norm += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }
      const edge = 1 - smoothstep(0.7, 1, Math.max(Math.abs(x), Math.abs(z)) / HALF_EXTENT);
      const center = smoothstep(FLAT_RADIUS, FLAT_RADIUS + FLAT_BLEND, Math.hypot(x, z));
      offsets.push(Math.round((height / norm) * AMPLITUDE * edge * center * 100) / 100);
    }
  }
  return {
    bounds: { minX: -HALF_EXTENT, minZ: -HALF_EXTENT, maxX: HALF_EXTENT, maxZ: HALF_EXTENT },
    cellSize: CELL_SIZE,
    cols,
    rows,
    offsets,
    surfaces: new Array<null>(cols * rows).fill(null),
  };
}

/** Appends `terrain` to a scene document's JSON text on one line, so the file stays readable. */
export function withStarterTerrain(sceneJson: string, seedText: string): string {
  const body = sceneJson.replace(/\n}\n?$/, "");
  return `${body},\n  "terrain": ${JSON.stringify(starterTerrain(seedText))}\n}\n`;
}
