export type FlockVec3 = readonly [number, number, number];

export interface FlockAgent {
  position: FlockVec3;
  velocity: FlockVec3;
}

export interface FlockConfig {
  maxSpeed: number;
  /** How hard steering can change velocity (units/s²); default `maxSpeed * 2`. */
  accel?: number;
  separationRadius: number;
  separationWeight?: number;
  /** Neighbors inside this radius pull toward the local centroid and average heading. */
  neighborRadius: number;
  cohesionWeight?: number;
  alignmentWeight?: number;
  /** Pull toward the seek target; default `1`. */
  seekWeight?: number;
  /** Beyond this distance from the flock centroid an agent's cohesion is boosted so stragglers rejoin. */
  stragglerRadius?: number;
  /** Cohesion multiplier applied to stragglers; default `3`. */
  stragglerBoost?: number;
}

/**
 * Classic per-agent boid steering — seek + separation + cohesion + alignment with a straggler
 * rescue radius — the many-agents-to-*each-other* primitive `ai/crowd`'s navmesh flow field
 * (many-agents-to-POI) deliberately isn't. Pure: returns the desired acceleration for one agent;
 * `stepFlock` is the convenience integrator. O(neighbors) per agent — pre-filter with a spatial
 * grid past a few hundred agents.
  * @internal
  */
export function flockSteer(
  agent: FlockAgent,
  neighbors: readonly FlockAgent[],
  config: FlockConfig,
  target?: FlockVec3,
): FlockVec3 {
  const separationWeight = config.separationWeight ?? 1.5;
  const cohesionWeight = config.cohesionWeight ?? 1;
  const alignmentWeight = config.alignmentWeight ?? 1;
  const seekWeight = config.seekWeight ?? 1;
  const accel = config.accel ?? config.maxSpeed * 2;

  let sepX = 0;
  let sepY = 0;
  let sepZ = 0;
  let cohX = 0;
  let cohY = 0;
  let cohZ = 0;
  let alignX = 0;
  let alignY = 0;
  let alignZ = 0;
  let flockmates = 0;

  for (const other of neighbors) {
    if (other === agent) continue;
    const dx = other.position[0] - agent.position[0];
    const dy = other.position[1] - agent.position[1];
    const dz = other.position[2] - agent.position[2];
    const distance = Math.hypot(dx, dy, dz);
    if (distance > config.neighborRadius) continue;
    flockmates += 1;
    cohX += other.position[0];
    cohY += other.position[1];
    cohZ += other.position[2];
    alignX += other.velocity[0];
    alignY += other.velocity[1];
    alignZ += other.velocity[2];
    if (distance < config.separationRadius && distance > 1e-9) {
      const push = (config.separationRadius - distance) / config.separationRadius / distance;
      sepX -= dx * push;
      sepY -= dy * push;
      sepZ -= dz * push;
    }
  }

  let steerX = sepX * separationWeight;
  let steerY = sepY * separationWeight;
  let steerZ = sepZ * separationWeight;

  if (flockmates > 0) {
    const centroidX = cohX / flockmates;
    const centroidY = cohY / flockmates;
    const centroidZ = cohZ / flockmates;
    const toCentroidX = centroidX - agent.position[0];
    const toCentroidY = centroidY - agent.position[1];
    const toCentroidZ = centroidZ - agent.position[2];
    const centroidDistance = Math.hypot(toCentroidX, toCentroidY, toCentroidZ);
    const straggling =
      config.stragglerRadius !== undefined && centroidDistance > config.stragglerRadius;
    const cohesion = cohesionWeight * (straggling ? config.stragglerBoost ?? 3 : 1);
    if (centroidDistance > 1e-9) {
      steerX += (toCentroidX / centroidDistance) * cohesion;
      steerY += (toCentroidY / centroidDistance) * cohesion;
      steerZ += (toCentroidZ / centroidDistance) * cohesion;
    }
    const alignMagnitude = Math.hypot(alignX, alignY, alignZ);
    if (alignMagnitude > 1e-9) {
      steerX += (alignX / alignMagnitude) * alignmentWeight;
      steerY += (alignY / alignMagnitude) * alignmentWeight;
      steerZ += (alignZ / alignMagnitude) * alignmentWeight;
    }
  }

  if (target !== undefined) {
    const toTargetX = target[0] - agent.position[0];
    const toTargetY = target[1] - agent.position[1];
    const toTargetZ = target[2] - agent.position[2];
    const targetDistance = Math.hypot(toTargetX, toTargetY, toTargetZ);
    if (targetDistance > 1e-9) {
      steerX += (toTargetX / targetDistance) * seekWeight;
      steerY += (toTargetY / targetDistance) * seekWeight;
      steerZ += (toTargetZ / targetDistance) * seekWeight;
    }
  }

  const magnitude = Math.hypot(steerX, steerY, steerZ);
  if (magnitude <= 1e-9) return [0, 0, 0];
  const scale = accel / magnitude;
  return [steerX * scale, steerY * scale, steerZ * scale];
}

export interface FlockStepAgent {
  position: FlockVec3;
  velocity: FlockVec3;
}

const CELL_KEY_STRIDE = 1_048_576;

function cellKey(cx: number, cz: number): number {
  return cx * CELL_KEY_STRIDE + cz;
}

/**
 * Per-call spatial index + scratch — never module-global.
 * Two `stepFlock` worlds in one process must not share a grid (#1545 / sdk remediation Phase 3a).
 */
function buildAgentGrid(agents: readonly FlockStepAgent[], invCell: number): Map<number, number[]> {
  const gridCells = new Map<number, number[]>();
  for (let i = 0; i < agents.length; i += 1) {
    const position = agents[i]!.position;
    const key = cellKey(Math.floor(position[0] * invCell), Math.floor(position[2] * invCell));
    let bucket = gridCells.get(key);
    if (bucket === undefined) {
      bucket = [];
      gridCells.set(key, bucket);
    }
    bucket.push(i);
  }
  return gridCells;
}

function fillNeighbors(
  agents: readonly FlockStepAgent[],
  agentIndex: number,
  invCell: number,
  gridCells: Map<number, number[]>,
  neighborScratch: FlockAgent[],
): number {
  const agent = agents[agentIndex]!;
  const cx = Math.floor(agent.position[0] * invCell);
  const cz = Math.floor(agent.position[2] * invCell);
  let count = 0;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const bucket = gridCells.get(cellKey(cx + dx, cz + dz));
      if (bucket === undefined) continue;
      for (let b = 0; b < bucket.length; b += 1) {
        const otherIndex = bucket[b]!;
        if (otherIndex === agentIndex) continue;
        neighborScratch[count] = agents[otherIndex]!;
        count += 1;
      }
    }
  }
  neighborScratch.length = count;
  return count;
}

/** Integrate one tick in place: steer every agent, clamp to `maxSpeed`, advance positions.
 * @internal
 */
export function stepFlock(
  agents: FlockStepAgent[],
  config: FlockConfig,
  dt: number,
  target?: FlockVec3,
  acceleration?: (agent: Readonly<FlockStepAgent>, index: number) => FlockVec3,
): void {
  const count = agents.length;
  if (count === 0) return;

  const cellSize = config.neighborRadius > 1e-6 ? config.neighborRadius : 1;
  const invCell = 1 / cellSize;
  // All scratch is call-local so concurrent worlds (or re-entrant steps) never share a grid.
  const gridCells = buildAgentGrid(agents, invCell);
  const neighborScratch: FlockAgent[] = [];
  const steerScratch = new Float64Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    fillNeighbors(agents, i, invCell, gridCells, neighborScratch);
    const steer = flockSteer(agents[i]!, neighborScratch, config, target);
    const base = i * 3;
    const external = acceleration?.(agents[i]!, i);
    if (external !== undefined && (external.length !== 3 || external.some((axis) => !Number.isFinite(axis)))) throw new Error("flock acceleration must contain three finite components");
    steerScratch[base] = steer[0] + (external?.[0] ?? 0);
    steerScratch[base + 1] = steer[1] + (external?.[1] ?? 0);
    steerScratch[base + 2] = steer[2] + (external?.[2] ?? 0);
  }

  for (let i = 0; i < count; i += 1) {
    const agent = agents[i]!;
    const base = i * 3;
    let vx = agent.velocity[0] + steerScratch[base]! * dt;
    let vy = agent.velocity[1] + steerScratch[base + 1]! * dt;
    let vz = agent.velocity[2] + steerScratch[base + 2]! * dt;
    const speed = Math.hypot(vx, vy, vz);
    if (speed > config.maxSpeed) {
      const clamp = config.maxSpeed / speed;
      vx *= clamp;
      vy *= clamp;
      vz *= clamp;
    }
    agent.velocity = [vx, vy, vz];
    agent.position = [
      agent.position[0] + vx * dt,
      agent.position[1] + vy * dt,
      agent.position[2] + vz * dt,
    ];
  }
}

/** Typed-array agents for {@link createFlockStepper}: `position` and `velocity` hold x,y,z per agent. */
export interface FlockBuffers {
  position: Float32Array;
  velocity: Float32Array;
}

/** Allocation-free flock stepping over typed arrays, sized once for `capacity` agents. */
export interface FlockStepper {
  readonly capacity: number;
  /**
   * Steer and integrate the first `count` agents by `dt`; same seek + separation + cohesion + alignment
   * terms as {@link flockSteer}. `targets` (x,y,z per agent) gives each agent its own seek point and
   * overrides `target` (one shared point). Visits at most `maxNeighbors` flockmates per agent. Allocates nothing.
   */
  step(buffers: FlockBuffers, count: number, config: FlockConfig, dt: number, target?: FlockVec3 | null, targets?: Float32Array | null): void;
}

/** Flockmates one agent considers per step in {@link createFlockStepper} unless `maxNeighbors` says otherwise. */
export const FLOCK_MAX_NEIGHBORS = 12;

/**
 * Build a {@link FlockStepper}: the hot-path form of {@link stepFlock} for hundreds to thousands of
 * agents. The grid is a fixed hash table over `neighborRadius` cells, so a step touches only
 * nearby agents and creates no objects.
 * @internal
 */
export function createFlockStepper(capacity: number, maxNeighbors = FLOCK_MAX_NEIGHBORS): FlockStepper {
  const size = Math.max(1, Math.floor(capacity));
  let table = 64;
  while (table < size * 2) table *= 2;
  const mask = table - 1;
  const head = new Int32Array(table);
  const next = new Int32Array(size);
  const cell = new Int32Array(size);
  const steer = new Float32Array(size * 3);

  function slot(cx: number, cz: number): number {
    return (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & mask;
  }

  function step(buffers: FlockBuffers, count: number, config: FlockConfig, dt: number, target?: FlockVec3 | null, targets?: Float32Array | null): void {
    const n = Math.min(size, count);
    if (n === 0) return;
    const { position: pos, velocity: vel } = buffers;
    const radius = config.neighborRadius > 1e-6 ? config.neighborRadius : 1;
    const inv = 1 / radius;
    const separationRadius = config.separationRadius;
    const separationWeight = config.separationWeight ?? 1.5;
    const cohesionWeight = config.cohesionWeight ?? 1;
    const alignmentWeight = config.alignmentWeight ?? 1;
    const seekWeight = config.seekWeight ?? 1;
    const accel = config.accel ?? config.maxSpeed * 2;
    const straggler = config.stragglerRadius;
    const stragglerBoost = config.stragglerBoost ?? 3;

    head.fill(-1);
    for (let i = 0; i < n; i += 1) {
      const c = slot(Math.floor((pos[i * 3] ?? 0) * inv), Math.floor((pos[i * 3 + 2] ?? 0) * inv));
      cell[i] = c;
      next[i] = (head[c] ?? 0);
      head[c] = i;
    }

    for (let i = 0; i < n; i += 1) {
      const b = i * 3;
      const px = (pos[b] ?? 0);
      const py = (pos[b + 1] ?? 0);
      const pz = (pos[b + 2] ?? 0);
      const cx = Math.floor(px * inv);
      const cz = Math.floor(pz * inv);
      let sepX = 0, sepY = 0, sepZ = 0, cohX = 0, cohY = 0, cohZ = 0, alX = 0, alY = 0, alZ = 0;
      let mates = 0;
      let seen = 0;
      scan: for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let j = (head[slot(cx + dx, cz + dz)] ?? 0); j >= 0; j = (next[j] ?? 0)) {
            if (j === i) continue;
            if (seen >= maxNeighbors) break scan;
            const o = j * 3;
            const ox = (pos[o] ?? 0) - px;
            const oy = (pos[o + 1] ?? 0) - py;
            const oz = (pos[o + 2] ?? 0) - pz;
            const distance = Math.hypot(ox, oy, oz);
            if (distance > config.neighborRadius) continue;
            seen += 1;
            mates += 1;
            cohX += (pos[o] ?? 0); cohY += (pos[o + 1] ?? 0); cohZ += (pos[o + 2] ?? 0);
            alX += (vel[o] ?? 0); alY += (vel[o + 1] ?? 0); alZ += (vel[o + 2] ?? 0);
            if (distance < separationRadius && distance > 1e-9) {
              const push = (separationRadius - distance) / separationRadius / distance;
              sepX -= ox * push; sepY -= oy * push; sepZ -= oz * push;
            }
          }
        }
      }
      let sx = sepX * separationWeight, sy = sepY * separationWeight, sz = sepZ * separationWeight;
      if (mates > 0) {
        const tx = cohX / mates - px, ty = cohY / mates - py, tz = cohZ / mates - pz;
        const centroid = Math.hypot(tx, ty, tz);
        const cohesion = cohesionWeight * (straggler !== undefined && centroid > straggler ? stragglerBoost : 1);
        if (centroid > 1e-9) { sx += (tx / centroid) * cohesion; sy += (ty / centroid) * cohesion; sz += (tz / centroid) * cohesion; }
        const align = Math.hypot(alX, alY, alZ);
        if (align > 1e-9) { sx += (alX / align) * alignmentWeight; sy += (alY / align) * alignmentWeight; sz += (alZ / align) * alignmentWeight; }
      }
      let gx: number, gy: number, gz: number, seeking = true;
      if (targets != null) { gx = (targets[b] ?? 0); gy = (targets[b + 1] ?? 0); gz = (targets[b + 2] ?? 0); }
      else if (target != null) { gx = target[0]; gy = target[1]; gz = target[2]; }
      else { gx = gy = gz = 0; seeking = false; }
      if (seeking) {
        const tx = gx - px, ty = gy - py, tz = gz - pz;
        const distance = Math.hypot(tx, ty, tz);
        if (distance > 1e-9) { sx += (tx / distance) * seekWeight; sy += (ty / distance) * seekWeight; sz += (tz / distance) * seekWeight; }
      }
      const magnitude = Math.hypot(sx, sy, sz);
      const scale = magnitude <= 1e-9 ? 0 : accel / magnitude;
      steer[b] = sx * scale; steer[b + 1] = sy * scale; steer[b + 2] = sz * scale;
    }

    for (let i = 0; i < n; i += 1) {
      const b = i * 3;
      let vx = (vel[b] ?? 0) + (steer[b] ?? 0) * dt;
      let vy = (vel[b + 1] ?? 0) + (steer[b + 1] ?? 0) * dt;
      let vz = (vel[b + 2] ?? 0) + (steer[b + 2] ?? 0) * dt;
      const speed = Math.hypot(vx, vy, vz);
      if (speed > config.maxSpeed) { const clamp = config.maxSpeed / speed; vx *= clamp; vy *= clamp; vz *= clamp; }
      vel[b] = vx; vel[b + 1] = vy; vel[b + 2] = vz;
      pos[b] = (pos[b] ?? 0) + vx * dt; pos[b + 1] = (pos[b + 1] ?? 0) + vy * dt; pos[b + 2] = (pos[b + 2] ?? 0) + vz * dt;
    }
  }

  return { capacity: size, step };
}
