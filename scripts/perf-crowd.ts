// `bun run perf crowd`: one crowd step through the engine's entity store and spatial index, beside the same step over flat typed arrays.
import { seededRng } from "../packages/core/src/random/rng";
import { createEntityStore, type EntityStore } from "../packages/core/src/scene/entityStore";
import { createSpatialIndex, type SpatialIndex } from "../packages/core/src/spatial/spatialIndex";
import type { RenderBounds } from "../packages/core/src/visibility/bounds";
import { printHelpIfAsked } from "./script-help";

/** Agents per square metre; the square world grows with the count so density stays fixed. */
export const CROWD_DENSITY = 0.5;
/** Neighbours closer than this push each other apart. */
export const CROWD_RADIUS = 1.5;
const BODY_RADIUS = 0.3;
const MAX_SPEED = 1.5;
const PUSH = 4;
const DT = 1 / 30;
const CELL_SIZE = 2;

export interface Crowd {
  readonly count: number;
  readonly side: number;
  step(): void;
  /** Every agent's x and z, in spawn order, for checks. */
  positions(): Float64Array;
}

function startState(count: number, seed: string): { side: number; xs: Float64Array; zs: Float64Array; vxs: Float64Array; vzs: Float64Array } {
  const side = Math.sqrt(count / CROWD_DENSITY);
  const rng = seededRng(seed);
  const xs = new Float64Array(count), zs = new Float64Array(count), vxs = new Float64Array(count), vzs = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    xs[i] = rng() * side;
    zs[i] = rng() * side;
    vxs[i] = (rng() - 0.5) * MAX_SPEED;
    vzs[i] = (rng() - 0.5) * MAX_SPEED;
  }
  return { side, xs, zs, vxs, vzs };
}

function clampSpeed(vx: number, vz: number): [number, number] {
  const speed = Math.hypot(vx, vz);
  if (speed <= MAX_SPEED) return [vx, vz];
  const scale = MAX_SPEED / speed;
  return [vx * scale, vz * scale];
}

function boundsAt(x: number, z: number): RenderBounds {
  return {
    centerX: x, centerY: 0, centerZ: z, radius: BODY_RADIUS,
    minX: x - BODY_RADIUS, minY: -BODY_RADIUS, minZ: z - BODY_RADIUS,
    maxX: x + BODY_RADIUS, maxY: BODY_RADIUS, maxZ: z + BODY_RADIUS,
  };
}

/** The crowd written the way game code writes it: ids, `store.get`, `index.querySphere`, `setPose`, `setVelocity`, `index.update`. */
export function createEngineCrowd(count: number, seed = "crowd"): Crowd {
  const start = startState(count, seed);
  const { side } = start;
  const store: EntityStore = createEntityStore();
  const index: SpatialIndex = createSpatialIndex({ cellSize: CELL_SIZE });
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = start.xs[i]!, z = start.zs[i]!;
    const id = store.spawn("agent", { position: [x, 0, z], role: "npc" });
    store.setVelocity(id, [start.vxs[i]!, 0, start.vzs[i]!]);
    index.insert(id, boundsAt(x, z), true);
    ids.push(id);
  }
  const near: string[] = [];
  const radiusSq = CROWD_RADIUS * CROWD_RADIUS;
  return {
    count,
    side,
    step() {
      for (const id of ids) {
        const agent = store.get(id);
        if (agent === null) continue;
        const [x, , z] = agent.position;
        index.querySphere(x, 0, z, CROWD_RADIUS, near);
        let pushX = 0, pushZ = 0;
        for (const otherId of near) {
          if (otherId === id) continue;
          const other = store.get(otherId);
          if (other === null) continue;
          const dx = x - other.position[0], dz = z - other.position[2];
          const distSq = dx * dx + dz * dz;
          if (distSq >= radiusSq || distSq === 0) continue;
          const dist = Math.sqrt(distSq);
          const strength = (CROWD_RADIUS - dist) / CROWD_RADIUS;
          pushX += (dx / dist) * strength;
          pushZ += (dz / dist) * strength;
        }
        const [vx, vz] = clampSpeed(agent.velocity[0] + pushX * PUSH * DT, agent.velocity[2] + pushZ * PUSH * DT);
        const nx = Math.min(side, Math.max(0, x + vx * DT));
        const nz = Math.min(side, Math.max(0, z + vz * DT));
        store.setVelocity(id, [vx, 0, vz]);
        store.setPose(id, { position: [nx, 0, nz] });
        index.update(id, boundsAt(nx, nz));
      }
    },
    positions() {
      const out = new Float64Array(count * 2);
      ids.forEach((id, i) => {
        const position = store.get(id)?.position;
        out[i * 2] = position?.[0] ?? Number.NaN;
        out[i * 2 + 1] = position?.[2] ?? Number.NaN;
      });
      return out;
    },
  };
}

/** The same step over Float32Array columns and a counting-sort grid rebuilt each tick: the floor the engine path is measured against. */
export function createFlatCrowd(count: number, seed = "crowd"): Crowd {
  const start = startState(count, seed);
  const { side } = start;
  const xs = Float32Array.from(start.xs), zs = Float32Array.from(start.zs);
  const vxs = Float32Array.from(start.vxs), vzs = Float32Array.from(start.vzs);
  const cols = Math.max(1, Math.ceil(side / CELL_SIZE));
  const cellStart = new Int32Array(cols * cols + 1);
  const cellOf = new Int32Array(count);
  const sorted = new Int32Array(count);
  const radiusSq = CROWD_RADIUS * CROWD_RADIUS;
  const cellIndex = (value: number): number => Math.min(cols - 1, Math.max(0, Math.floor(value / CELL_SIZE)));
  function rebuild(): void {
    cellStart.fill(0);
    for (let i = 0; i < count; i += 1) {
      const cell = cellIndex(zs[i]!) * cols + cellIndex(xs[i]!);
      cellOf[i] = cell;
      cellStart[cell + 1]! += 1;
    }
    for (let c = 0; c < cols * cols; c += 1) cellStart[c + 1]! += cellStart[c]!;
    const fill = cellStart.slice(0, cols * cols);
    for (let i = 0; i < count; i += 1) sorted[fill[cellOf[i]!]!++] = i;
  }
  return {
    count,
    side,
    step() {
      rebuild();
      for (let i = 0; i < count; i += 1) {
        const x = xs[i]!, z = zs[i]!;
        const cx0 = cellIndex(x - CROWD_RADIUS), cx1 = cellIndex(x + CROWD_RADIUS);
        const cz0 = cellIndex(z - CROWD_RADIUS), cz1 = cellIndex(z + CROWD_RADIUS);
        let pushX = 0, pushZ = 0;
        for (let cz = cz0; cz <= cz1; cz += 1) {
          for (let cx = cx0; cx <= cx1; cx += 1) {
            const cell = cz * cols + cx;
            for (let k = cellStart[cell]!, end = cellStart[cell + 1]!; k < end; k += 1) {
              const j = sorted[k]!;
              if (j === i) continue;
              const dx = x - xs[j]!, dz = z - zs[j]!;
              const distSq = dx * dx + dz * dz;
              if (distSq >= radiusSq || distSq === 0) continue;
              const dist = Math.sqrt(distSq);
              const strength = (CROWD_RADIUS - dist) / CROWD_RADIUS;
              pushX += (dx / dist) * strength;
              pushZ += (dz / dist) * strength;
            }
          }
        }
        let vx = vxs[i]! + pushX * PUSH * DT, vz = vzs[i]! + pushZ * PUSH * DT;
        const speed = Math.sqrt(vx * vx + vz * vz);
        if (speed > MAX_SPEED) {
          vx *= MAX_SPEED / speed;
          vz *= MAX_SPEED / speed;
        }
        vxs[i] = vx;
        vzs[i] = vz;
        xs[i] = Math.min(side, Math.max(0, x + vx * DT));
        zs[i] = Math.min(side, Math.max(0, z + vz * DT));
      }
    },
    positions() {
      const out = new Float64Array(count * 2);
      for (let i = 0; i < count; i += 1) {
        out[i * 2] = xs[i]!;
        out[i * 2 + 1] = zs[i]!;
      }
      return out;
    },
  };
}

export interface CrowdTiming {
  readonly ticks: number;
  readonly medianMs: number;
  readonly minMs: number;
}

function summarize(samples: number[]): CrowdTiming {
  const sorted = [...samples].sort((x, y) => x - y);
  return { ticks: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)]!, minMs: sorted[0]! };
}

/**
 * Warm both crowds up, then alternate their ticks until `budgetMs` of stepping has run (at least
 * `minTicks` each), so a busy machine slows both sides alike and the ratio stays meaningful.
 */
export function timeCrowds(engine: Crowd, flat: Crowd, budgetMs: number, minTicks = 3, warmup = 3): { engine: CrowdTiming; flat: CrowdTiming } {
  for (let i = 0; i < warmup; i += 1) {
    engine.step();
    flat.step();
  }
  const engineSamples: number[] = [];
  const flatSamples: number[] = [];
  let spent = 0;
  while ((engineSamples.length < minTicks || spent < budgetMs) && engineSamples.length < 200) {
    for (const [crowd, samples] of [[engine, engineSamples], [flat, flatSamples]] as const) {
      const t0 = performance.now();
      crowd.step();
      const ms = performance.now() - t0;
      samples.push(ms);
      spent += ms;
    }
  }
  return { engine: summarize(engineSamples), flat: summarize(flatSamples) };
}

function parseCounts(argv: readonly string[]): number[] {
  const flag = argv.indexOf("--counts");
  const raw = flag >= 0 ? argv[flag + 1] : undefined;
  if (raw === undefined) return [1_000, 10_000, 100_000];
  return raw.split(",").map((value) => Number(value.replace(/k$/i, "000")));
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (
    printHelpIfAsked("perf-crowd", {
      summary: "time one crowd tick (neighbours within 1.5 m, separation push, speed clamp, move, stay in bounds; 0.5 agents per m²) through createEntityStore + createSpatialIndex, beside the same step over Float32Array columns and a counting-sort grid",
      usage: "bun run perf crowd [--counts 1000,10000,100000] [--budget <ms per row>]",
      flags: [
        { flag: "--counts <n,...>", detail: "agent counts to run (default 1000,10000,100000; 10k is accepted)" },
        { flag: "--budget <ms>", detail: "stepping time per row after warmup, both sides together (default 3000)" },
      ],
      example: "bun run perf crowd --counts 10k",
    })
  ) {
    process.exit(0);
  }
  const budgetFlag = argv.indexOf("--budget");
  const budget = budgetFlag >= 0 ? Number(argv[budgetFlag + 1]) : 3000;
  console.log(`crowd step, Bun ${Bun.version}: engine and flat ticks alternate; median (min) ms per tick after warmup`);
  console.log("agents        engine ms/tick          flat ms/tick   engine/flat median (min)");
  const cell = (timing: CrowdTiming) => `${timing.medianMs.toFixed(2)} (${timing.minMs.toFixed(2)})`.padStart(20);
  for (const count of parseCounts(argv)) {
    const { engine, flat } = timeCrowds(createEngineCrowd(count), createFlatCrowd(count), budget);
    const ratio = `${(engine.medianMs / flat.medianMs).toFixed(1)}x (${(engine.minMs / flat.minMs).toFixed(1)}x)`;
    console.log(`${String(count).padStart(6)}  ${cell(engine)}  ${cell(flat)}   ${ratio.padStart(22)}`);
  }
}
