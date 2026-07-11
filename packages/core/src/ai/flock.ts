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
const gridCells = new Map<number, number[]>();
const freeBuckets: number[][] = [];
const neighborScratch: FlockAgent[] = [];
let steerScratch = new Float64Array(0);

function cellKey(cx: number, cz: number): number {
  return cx * CELL_KEY_STRIDE + cz;
}

function takeBucket(): number[] {
  return freeBuckets.pop() ?? [];
}

function ensureSteerCapacity(agentCount: number): void {
  const needed = agentCount * 3;
  if (steerScratch.length < needed) {
    steerScratch = new Float64Array(needed);
  }
}

function buildAgentGrid(agents: readonly FlockStepAgent[], invCell: number): void {
  for (const bucket of gridCells.values()) {
    bucket.length = 0;
    freeBuckets.push(bucket);
  }
  gridCells.clear();

  for (let i = 0; i < agents.length; i += 1) {
    const position = agents[i]!.position;
    const key = cellKey(Math.floor(position[0] * invCell), Math.floor(position[2] * invCell));
    let bucket = gridCells.get(key);
    if (bucket === undefined) {
      bucket = takeBucket();
      gridCells.set(key, bucket);
    }
    bucket.push(i);
  }
}

function fillNeighbors(
  agents: readonly FlockStepAgent[],
  agentIndex: number,
  invCell: number,
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

/** Integrate one tick in place: steer every agent, clamp to `maxSpeed`, advance positions. */
export function stepFlock(
  agents: FlockStepAgent[],
  config: FlockConfig,
  dt: number,
  target?: FlockVec3,
): void {
  const count = agents.length;
  if (count === 0) return;

  const cellSize = config.neighborRadius > 1e-6 ? config.neighborRadius : 1;
  const invCell = 1 / cellSize;
  buildAgentGrid(agents, invCell);
  ensureSteerCapacity(count);

  for (let i = 0; i < count; i += 1) {
    fillNeighbors(agents, i, invCell);
    const steer = flockSteer(agents[i]!, neighborScratch, config, target);
    const base = i * 3;
    steerScratch[base] = steer[0];
    steerScratch[base + 1] = steer[1];
    steerScratch[base + 2] = steer[2];
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
