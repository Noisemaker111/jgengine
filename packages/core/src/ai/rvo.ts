import { devtools } from "../devtools/devtools";

/** One agent's circular footprint and top speed; positions and velocities live in the crowd. */
export interface RvoAgentSpec {
  x: number;
  z: number;
  radius: number;
  /** World units per second; the avoidance solve never returns a longer velocity. */
  maxSpeed: number;
  vx?: number;
  vz?: number;
}

/** Serializable avoidance tuning, retunable in play through {@link RvoCrowd.retune}. */
export interface RvoTunables {
  /** Seconds of look-ahead over which the agent avoids an upcoming collision. */
  timeHorizon: number;
  /** Radial distance, in world units, at which other agents enter the solve. */
  neighborDist: number;
  /** Hard cap on agents one agent considers per tick — the bound that keeps a dense crowd linear. */
  maxNeighbors: number;
  /**
   * Radians every preferred direction is turned the same rotational way. A perfectly mirrored pair
   * (both at rest, walking straight at each other) has no side to pick and would brake to a halt;
   * this bias makes the pair pass on each other's right. Set 0 for exact mirror symmetry.
   */
  sideBias: number;
  /**
   * Fraction of any remaining overlap pushed apart after the velocity solve, `0`..`1`. The velocity
   * obstacle solve is a steering rule, not a hard guarantee; this positional pass keeps a dense
   * crowd from settling into overlaps. Set 0 for pure velocity-only avoidance.
   */
  overlapRelief: number;
}

/** One agent's live kinematics, as the crowd exposes them. */
export interface RvoAgentView {
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  maxSpeed: number;
}

/** Serializable crowd state: tuning plus every agent's position, velocity and footprint. */
export interface RvoSnapshot {
  tunables: RvoTunables;
  agents: { id: string; x: number; z: number; vx: number; vz: number; radius: number; maxSpeed: number }[];
}

/**
 * Many circular agents steering around each other. `setPreferredVelocity` states where each agent
 * wants to go; `step` turns that into reciprocal collision-free velocities and integrates them.
 * Deterministic: agents are visited in slot order, neighbours in grid and slot order, and head-on
 * ties break on slot index rather than chance.
 */
export interface RvoCrowd {
  /** Add an agent; returns false when the id is already present. */
  add(id: string, spec: RvoAgentSpec): boolean;
  remove(id: string): boolean;
  has(id: string): boolean;
  count(): number;
  /** Agent ids in slot order. */
  ids(): readonly string[];
  agent(id: string): RvoAgentView | null;
  /** Copy one agent's kinematics into a caller-owned record, for hot loops that must not allocate. */
  readInto(id: string, out: { x: number; z: number; vx: number; vz: number }): boolean;
  /** Where the agent wants to go this tick; `step` consumes and clears it. */
  setPreferredVelocity(id: string, vx: number, vz: number): boolean;
  /** Overwrite kinematics, e.g. after a teleport or an external controller. */
  setKinematics(id: string, position: { x: number; z: number; vx?: number; vz?: number }): boolean;
  /** Solve avoidance for every agent and integrate positions by `dt` seconds. */
  step(dt: number): void;
  retune(patch: Partial<RvoTunables>): void;
  snapshot(): RvoSnapshot;
  restore(next: RvoSnapshot): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

/** Options for {@link createRvoCrowd}. */
export interface RvoCrowdOptions extends Partial<RvoTunables> {
  /** Register a devtools probe under this name so the perf overlay shows crowd counters. */
  devtoolsName?: string;
}

const DEFAULT_TUNABLES: RvoTunables = { timeHorizon: 2, neighborDist: 3, maxNeighbors: 6, sideBias: 0.035, overlapRelief: 1 };
const EPSILON = 1e-9;
const LINE_STRIDE = 4;

interface Slot {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  maxSpeed: number;
  prefX: number;
  prefZ: number;
}

function det(ax: number, az: number, bx: number, bz: number): number {
  return ax * bz - az * bx;
}

/** Point on line `lineNo` at parameter `t`, stored into `out`. */
function linePointAt(buffer: Float64Array, lineNo: number, t: number, out: [number, number]): void {
  out[0] = buffer[lineNo * LINE_STRIDE]! + buffer[lineNo * LINE_STRIDE + 2]! * t;
  out[1] = buffer[lineNo * LINE_STRIDE + 1]! + buffer[lineNo * LINE_STRIDE + 3]! * t;
}

/**
 * Furthest point toward `opt` on line `lineNo` that also satisfies lines `0..lineNo-1`.
 * Returns `false` when the line makes the set infeasible. Result lands in `solution`.
 */
function linearProgram1(
  buffer: Float64Array,
  lineNo: number,
  radius: number,
  optX: number,
  optZ: number,
  directionOpt: boolean,
  solution: [number, number],
): boolean {
  const px = buffer[lineNo * LINE_STRIDE]!;
  const pz = buffer[lineNo * LINE_STRIDE + 1]!;
  const dx = buffer[lineNo * LINE_STRIDE + 2]!;
  const dz = buffer[lineNo * LINE_STRIDE + 3]!;
  const dotProduct = px * dx + pz * dz;
  const discriminant = dotProduct * dotProduct + radius * radius - (px * px + pz * pz);
  if (discriminant < 0) return false;
  const root = Math.sqrt(discriminant);
  let tLeft = -dotProduct - root;
  let tRight = -dotProduct + root;
  for (let i = 0; i < lineNo; i += 1) {
    const qx = buffer[i * LINE_STRIDE]!;
    const qz = buffer[i * LINE_STRIDE + 1]!;
    const ex = buffer[i * LINE_STRIDE + 2]!;
    const ez = buffer[i * LINE_STRIDE + 3]!;
    const denominator = det(dx, dz, ex, ez);
    const numerator = det(ex, ez, px - qx, pz - qz);
    if (Math.abs(denominator) <= EPSILON) {
      if (numerator < 0) return false;
      continue;
    }
    const t = numerator / denominator;
    if (denominator >= 0) tRight = Math.min(tRight, t);
    else tLeft = Math.max(tLeft, t);
    if (tLeft > tRight) return false;
  }
  if (directionOpt) {
    linePointAt(buffer, lineNo, dotProduct > 0 ? tRight : tLeft, solution);
  } else {
    const t = dx * (optX - px) + dz * (optZ - pz);
    linePointAt(buffer, lineNo, t < tLeft ? tLeft : t > tRight ? tRight : t, solution);
  }
  return true;
}

/** Velocity closest to `opt` inside every line in `buffer`; returns the violated line index, or `lineCount`. */
function linearProgram2(
  buffer: Float64Array,
  lineCount: number,
  radius: number,
  optX: number,
  optZ: number,
  directionOpt: boolean,
  solution: [number, number],
): number {
  if (directionOpt) {
    solution[0] = optX * radius;
    solution[1] = optZ * radius;
  } else {
    const lengthSq = optX * optX + optZ * optZ;
    if (lengthSq > radius * radius) {
      const scale = radius / Math.sqrt(lengthSq);
      solution[0] = optX * scale;
      solution[1] = optZ * scale;
    } else {
      solution[0] = optX;
      solution[1] = optZ;
    }
  }
  for (let i = 0; i < lineCount; i += 1) {
    const px = buffer[i * LINE_STRIDE]!;
    const pz = buffer[i * LINE_STRIDE + 1]!;
    const dx = buffer[i * LINE_STRIDE + 2]!;
    const dz = buffer[i * LINE_STRIDE + 3]!;
    if (det(dx, dz, px - solution[0], pz - solution[1]) <= 0) continue;
    const keepX = solution[0];
    const keepZ = solution[1];
    if (!linearProgram1(buffer, i, radius, optX, optZ, directionOpt, solution)) {
      solution[0] = keepX;
      solution[1] = keepZ;
      return i;
    }
  }
  return lineCount;
}

/**
 * Reciprocal velocity obstacle avoidance over circular agents. Each nearby pair contributes one or
 * two half-plane constraints on the agent's velocity, and a small linear program picks the velocity
 * closest to the preferred one that satisfies them all. The neighbour search is a uniform grid
 * capped at `maxNeighbors`, so a tick costs the same for 50 agents and 5,000.
 *
 * @capability rvo-avoidance reciprocal collision avoidance between many steering agents
 */
export function createRvoCrowd(options: RvoCrowdOptions = {}): RvoCrowd {
  let tunables: RvoTunables = {
    timeHorizon: Math.max(EPSILON, options.timeHorizon ?? DEFAULT_TUNABLES.timeHorizon),
    neighborDist: Math.max(EPSILON, options.neighborDist ?? DEFAULT_TUNABLES.neighborDist),
    maxNeighbors: Math.max(1, Math.floor(options.maxNeighbors ?? DEFAULT_TUNABLES.maxNeighbors)),
    sideBias: Number.isFinite(options.sideBias) ? options.sideBias! : DEFAULT_TUNABLES.sideBias,
    overlapRelief: Number.isFinite(options.overlapRelief) ? options.overlapRelief! : DEFAULT_TUNABLES.overlapRelief,
  };
  const slots: Slot[] = [];
  const slotOf = new Map<string, number>();
  let biasTurn = 0;
  let biasKeep = 1;

  function refreshBias(): void {
    biasTurn = tunables.sideBias === 0 ? 0 : Math.sin(tunables.sideBias);
    biasKeep = tunables.sideBias === 0 ? 1 : Math.cos(tunables.sideBias);
  }
  refreshBias();
  let tickCount = 0;
  let solveCount = 0;
  let slowestStepMs = 0;

  let candidates = new Int32Array(tunables.maxNeighbors);
  let candidateSq = new Float64Array(tunables.maxNeighbors);
  let nextVX = new Float64Array(64);
  let nextVZ = new Float64Array(64);
  let lines = new Float64Array(tunables.maxNeighbors * 2 * LINE_STRIDE);
  let projection = new Float64Array(tunables.maxNeighbors * 2 * LINE_STRIDE);
  let nextInCell = new Int32Array(64);
  let cells = new Int32Array(64);
  const solution: [number, number] = [0, 0];

  function resizeBuffers(): void {
    const width = tunables.maxNeighbors;
    if (candidates.length < width) candidates = new Int32Array(width);
    if (candidateSq.length < width) candidateSq = new Float64Array(width);
    if (lines.length < width * 2 * LINE_STRIDE) lines = new Float64Array(width * 2 * LINE_STRIDE);
    if (projection.length < width * 2 * LINE_STRIDE) projection = new Float64Array(width * 2 * LINE_STRIDE);
  }

  function growInt32(buffer: Int32Array<ArrayBuffer>, needed: number): Int32Array<ArrayBuffer> {
    if (buffer.length >= needed) return buffer;
    let size = buffer.length;
    while (size < needed) size *= 2;
    return new Int32Array(size);
  }

  function slotIndexOf(id: string): number | undefined {
    return slotOf.get(id);
  }

  function probeLine(): string {
    return `${slots.length} agents ${tickCount} ticks ${solveCount} solves ${slowestStepMs.toFixed(2)} ms slowest`;
  }

  /** Fill `lines` with this agent's constraints; returns the line count. */
  function buildLines(agentIndex: number, dt: number, candidateCount: number): number {
    const agent = slots[agentIndex]!;
    const invHorizon = 1 / tunables.timeHorizon;
    const invStep = dt > EPSILON ? 1 / dt : 0;
    let count = 0;
    for (let c = 0; c < candidateCount; c += 1) {
      const otherIndex = candidates[c]!;
      const other = slots[otherIndex]!;
      const relX = other.x - agent.x;
      const relZ = other.z - agent.z;
      const relVX = agent.vx - other.vx;
      const relVZ = agent.vz - other.vz;
      const distanceSq = relX * relX + relZ * relZ;
      const combined = agent.radius + other.radius;
      const combinedSq = combined * combined;
      let pointX: number;
      let pointZ: number;
      let dirX: number;
      let dirZ: number;
      if (distanceSq > combinedSq) {
        const wx = relVX - invHorizon * relX;
        const wz = relVZ - invHorizon * relZ;
        const wSq = wx * wx + wz * wz;
        const dot1 = wx * relX + wz * relZ;
        if (dot1 < 0 && dot1 * dot1 > combinedSq * wSq) {
          const wLength = Math.sqrt(wSq);
          const unitX = wLength > EPSILON ? wx / wLength : 1;
          const unitZ = wLength > EPSILON ? wz / wLength : 0;
          dirX = unitZ;
          dirZ = -unitX;
          const scale = combined * invHorizon - wLength;
          pointX = agent.vx + 0.5 * scale * unitX;
          pointZ = agent.vz + 0.5 * scale * unitZ;
        } else {
          const leg = Math.sqrt(Math.max(0, distanceSq - combinedSq));
          // A perfectly mirrored pair has no geometric side to pick; taking the canonical branch for
          // both is what makes each agent yield to its own right, so the pair passes instead of stalling.
          const cross = det(relX, relZ, wx, wz);
          if (cross > 0 || Math.abs(cross) <= EPSILON) {
            dirX = (relX * leg - relZ * combined) / distanceSq;
            dirZ = (relX * combined + relZ * leg) / distanceSq;
          } else {
            dirX = -(relX * leg + relZ * combined) / distanceSq;
            dirZ = -(-relX * combined + relZ * leg) / distanceSq;
          }
          const dot2 = relVX * dirX + relVZ * dirZ;
          pointX = agent.vx + (dot2 * dirX - relVX) * 0.5;
          pointZ = agent.vz + (dot2 * dirZ - relVZ) * 0.5;
        }
      } else {
        const wx = relVX - invStep * relX;
        const wz = relVZ - invStep * relZ;
        const wLength = Math.hypot(wx, wz);
        let unitX = 1;
        let unitZ = 0;
        if (wLength > EPSILON) {
          unitX = wx / wLength;
          unitZ = wz / wLength;
        } else if (Math.abs(relX) > EPSILON || Math.abs(relZ) > EPSILON) {
          const length = Math.hypot(relX, relZ);
          unitX = relZ / length;
          unitZ = -relX / length;
        }
        dirX = unitZ;
        dirZ = -unitX;
        const scale = combined * invStep - wLength;
        pointX = agent.vx + 0.5 * scale * unitX;
        pointZ = agent.vz + 0.5 * scale * unitZ;
      }
      lines[count * LINE_STRIDE] = pointX;
      lines[count * LINE_STRIDE + 1] = pointZ;
      lines[count * LINE_STRIDE + 2] = dirX;
      lines[count * LINE_STRIDE + 3] = dirZ;
      count += 1;
    }
    return count;
  }

  /**
   * Preferred direction unreachable: relax the constraints by the smallest common margin, as RVO2's
   * third program does. `lines` stays intact — the projected set lives in `projection`.
   */
  function relaxConstraints(lineCount: number, radius: number, optX: number, optZ: number): void {
    let distance = 0;
    for (let i = 0; i < lineCount; i += 1) {
      const px = lines[i * LINE_STRIDE]!;
      const pz = lines[i * LINE_STRIDE + 1]!;
      const dx = lines[i * LINE_STRIDE + 2]!;
      const dz = lines[i * LINE_STRIDE + 3]!;
      if (det(dx, dz, px - solution[0], pz - solution[1]) <= distance) continue;
      let projected = 0;
      for (let j = 0; j < i; j += 1) {
        const qx = lines[j * LINE_STRIDE]!;
        const qz = lines[j * LINE_STRIDE + 1]!;
        const ex = lines[j * LINE_STRIDE + 2]!;
        const ez = lines[j * LINE_STRIDE + 3]!;
        const determinant = det(dx, dz, ex, ez);
        let pointX: number;
        let pointZ: number;
        if (Math.abs(determinant) <= EPSILON) {
          if (dx * ex + dz * ez > 0) continue;
          pointX = 0.5 * (px + qx);
          pointZ = 0.5 * (pz + qz);
        } else {
          const along = det(ex, ez, px - qx, pz - qz) / determinant;
          pointX = px + dx * along;
          pointZ = pz + dz * along;
        }
        const rawX = ex - dx;
        const rawZ = ez - dz;
        const length = Math.hypot(rawX, rawZ);
        if (length <= EPSILON) continue;
        projection[projected * LINE_STRIDE] = pointX;
        projection[projected * LINE_STRIDE + 1] = pointZ;
        projection[projected * LINE_STRIDE + 2] = rawX / length;
        projection[projected * LINE_STRIDE + 3] = rawZ / length;
        projected += 1;
      }
      const keepX = solution[0];
      const keepZ = solution[1];
      if (linearProgram2(projection, projected, radius, optX, optZ, false, solution) < 0) {
        solution[0] = keepX;
        solution[1] = keepZ;
      }
      distance = det(dx, dz, px - solution[0], pz - solution[1]);
    }
  }

  const unregister = options.devtoolsName === undefined ? null : devtools.probes.register(options.devtoolsName, () => probeLine());

  /**
   * Push apart every pair still overlapping after the velocity solve. The grid built for this tick
   * is reused: one tick moves an agent a small fraction of a cell. Pairs are visited in slot order
   * so the result is reproducible.
   */
  function relieveOverlap(cols: number, rows: number, minX: number, minZ: number, reach: number): void {
    const reachSq = reach * reach;
    for (let i = 0; i < slots.length; i += 1) {
      const agent = slots[i]!;
      const col = Math.min(cols - 1, Math.max(0, Math.floor((agent.x - minX) / reach)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor((agent.z - minZ) / reach)));
      for (let dz = -1; dz <= 1; dz += 1) {
        const r = row + dz;
        if (r < 0 || r >= rows) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const c = col + dx;
          if (c < 0 || c >= cols) continue;
          for (let j = cells[r * cols + c]!; j >= 0; j = nextInCell[j]!) {
            if (j <= i) continue;
            const other = slots[j]!;
            const deltaX = other.x - agent.x;
            const deltaZ = other.z - agent.z;
            const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
            if (distanceSq > reachSq) continue;
            const combined = agent.radius + other.radius;
            if (distanceSq >= combined * combined) continue;
            const distance = Math.sqrt(distanceSq);
            const normalX = distance > EPSILON ? deltaX / distance : i % 2 === 0 ? 1 : 0;
            const normalZ = distance > EPSILON ? deltaZ / distance : i % 2 === 0 ? 0 : 1;
            const push = 0.5 * (combined - distance) * tunables.overlapRelief;
            agent.x -= normalX * push;
            agent.z -= normalZ * push;
            other.x += normalX * push;
            other.z += normalZ * push;
          }
        }
      }
    }
  }

  return {
    add(id, spec) {
      if (slotOf.has(id)) return false;
      slots.push({
        id,
        x: spec.x,
        z: spec.z,
        vx: spec.vx ?? 0,
        vz: spec.vz ?? 0,
        radius: Math.max(0, spec.radius),
        maxSpeed: Math.max(0, spec.maxSpeed),
        prefX: 0,
        prefZ: 0,
      });
      slotOf.set(id, slots.length - 1);
      return true;
    },
    remove(id) {
      const at = slotIndexOf(id);
      if (at === undefined) return false;
      const last = slots.pop()!;
      slotOf.delete(id);
      if (at < slots.length) {
        slots[at] = last;
        slotOf.set(last.id, at);
      }
      return true;
    },
    has: (id) => slotOf.has(id),
    count: () => slots.length,
    ids: () => slots.map((agent) => agent.id),
    agent(id) {
      const at = slotIndexOf(id);
      if (at === undefined) return null;
      const agent = slots[at]!;
      return { x: agent.x, z: agent.z, vx: agent.vx, vz: agent.vz, radius: agent.radius, maxSpeed: agent.maxSpeed };
    },
    readInto(id, out) {
      const at = slotIndexOf(id);
      if (at === undefined) return false;
      const agent = slots[at]!;
      out.x = agent.x;
      out.z = agent.z;
      out.vx = agent.vx;
      out.vz = agent.vz;
      return true;
    },
    setPreferredVelocity(id, vx, vz) {
      const at = slotIndexOf(id);
      if (at === undefined) return false;
      const agent = slots[at]!;
      const speed = Math.hypot(vx, vz);
      const scale = speed > agent.maxSpeed && speed > EPSILON ? agent.maxSpeed / speed : 1;
      agent.prefX = (vx * biasKeep + vz * biasTurn) * scale;
      agent.prefZ = (-vx * biasTurn + vz * biasKeep) * scale;
      return true;
    },
    setKinematics(id, position) {
      const at = slotIndexOf(id);
      if (at === undefined) return false;
      const agent = slots[at]!;
      agent.x = position.x;
      agent.z = position.z;
      if (position.vx !== undefined) agent.vx = position.vx;
      if (position.vz !== undefined) agent.vz = position.vz;
      return true;
    },
    step(dt) {
      if (!(dt > 0) || slots.length === 0) return;
      const started = performance.now();
      const reach = tunables.neighborDist;
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < slots.length; i += 1) {
        const agent = slots[i]!;
        if (agent.x < minX) minX = agent.x;
        if (agent.x > maxX) maxX = agent.x;
        if (agent.z < minZ) minZ = agent.z;
        if (agent.z > maxZ) maxZ = agent.z;
      }
      const cols = Math.max(1, Math.floor((maxX - minX) / reach) + 1);
      const rows = Math.max(1, Math.floor((maxZ - minZ) / reach) + 1);
      const cellCount = cols * rows;
      cells = growInt32(cells, cellCount);
      nextInCell = growInt32(nextInCell, slots.length);
      if (nextVX.length < slots.length) {
        nextVX = new Float64Array(slots.length);
        nextVZ = new Float64Array(slots.length);
      }
      cells.fill(-1, 0, cellCount);
      const reachSq = reach * reach;
      for (let i = 0; i < slots.length; i += 1) {
        const agent = slots[i]!;
        const col = Math.min(cols - 1, Math.max(0, Math.floor((agent.x - minX) / reach)));
        const row = Math.min(rows - 1, Math.max(0, Math.floor((agent.z - minZ) / reach)));
        const cell = row * cols + col;
        nextInCell[i] = cells[cell]!;
        cells[cell] = i;
      }
      for (let i = 0; i < slots.length; i += 1) {
        const agent = slots[i]!;
        const col = Math.min(cols - 1, Math.max(0, Math.floor((agent.x - minX) / reach)));
        const row = Math.min(rows - 1, Math.max(0, Math.floor((agent.z - minZ) / reach)));
        let found = 0;
        for (let dz = -1; dz <= 1; dz += 1) {
          const r = row + dz;
          if (r < 0 || r >= rows) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const c = col + dx;
            if (c < 0 || c >= cols) continue;
            for (let j = cells[r * cols + c]!; j >= 0; j = nextInCell[j]!) {
              if (j === i) continue;
              const other = slots[j]!;
              const ddx = other.x - agent.x;
              const ddz = other.z - agent.z;
              const distanceSq = ddx * ddx + ddz * ddz;
              if (distanceSq > reachSq) continue;
              // Keep the nearest `maxNeighbors`: skipping a close agent because far ones filled
              // the slots is what lets a dense crossing stream walk through itself.
              let at = found < tunables.maxNeighbors ? found : tunables.maxNeighbors - 1;
              if (found === tunables.maxNeighbors && distanceSq >= candidateSq[at]!) continue;
              while (at > 0 && candidateSq[at - 1]! > distanceSq) {
                candidates[at] = candidates[at - 1]!;
                candidateSq[at] = candidateSq[at - 1]!;
                at -= 1;
              }
              candidates[at] = j;
              candidateSq[at] = distanceSq;
              if (found < tunables.maxNeighbors) found += 1;
            }
          }
        }
        const lineCount = buildLines(i, dt, found);
        const solved = linearProgram2(lines, lineCount, agent.maxSpeed, agent.prefX, agent.prefZ, false, solution);
        if (solved < lineCount) {
          const keepX = solution[0];
          const keepZ = solution[1];
          relaxConstraints(lineCount, agent.maxSpeed, agent.prefX, agent.prefZ);
          if (!Number.isFinite(solution[0]) || !Number.isFinite(solution[1])) {
            solution[0] = keepX;
            solution[1] = keepZ;
          }
        }
        if (!Number.isFinite(solution[0]) || !Number.isFinite(solution[1])) {
          solution[0] = agent.prefX;
          solution[1] = agent.prefZ;
        }
        const solvedSpeed = Math.hypot(solution[0], solution[1]);
        const preferredSpeed = Math.hypot(agent.prefX, agent.prefZ);
        if (preferredSpeed > EPSILON && solvedSpeed < 0.25 * preferredSpeed) {
          // A tight cluster can leave the constraints with no way forward. Creeping at a fraction of
          // the asked speed keeps a jam resolving instead of freezing every agent in it.
          solution[0] = agent.prefX * 0.35;
          solution[1] = agent.prefZ * 0.35;
        }
        nextVX[i] = solution[0];
        nextVZ[i] = solution[1];
      }
      for (let i = 0; i < slots.length; i += 1) {
        const agent = slots[i]!;
        agent.vx = nextVX[i]!;
        agent.vz = nextVZ[i]!;
        agent.x += agent.vx * dt;
        agent.z += agent.vz * dt;
        agent.prefX = 0;
        agent.prefZ = 0;
      }
      if (tunables.overlapRelief > 0) relieveOverlap(cols, rows, minX, minZ, reach);
      const elapsed = performance.now() - started;
      slowestStepMs = Math.max(slowestStepMs, elapsed);
      tickCount += 1;
      solveCount += slots.length;
    },
    retune(patch) {
      if (patch.timeHorizon !== undefined) tunables.timeHorizon = Math.max(EPSILON, patch.timeHorizon);
      if (patch.neighborDist !== undefined) tunables.neighborDist = Math.max(EPSILON, patch.neighborDist);
      if (patch.maxNeighbors !== undefined) tunables.maxNeighbors = Math.max(1, Math.floor(patch.maxNeighbors));
      if (patch.sideBias !== undefined && Number.isFinite(patch.sideBias)) {
        tunables.sideBias = patch.sideBias;
        refreshBias();
      }
      if (patch.overlapRelief !== undefined && Number.isFinite(patch.overlapRelief)) {
        tunables.overlapRelief = Math.max(0, Math.min(1, patch.overlapRelief));
      }
      resizeBuffers();
    },
    snapshot() {
      return {
        tunables: { ...tunables },
        agents: slots.map((agent) => ({
          id: agent.id,
          x: agent.x,
          z: agent.z,
          vx: agent.vx,
          vz: agent.vz,
          radius: agent.radius,
          maxSpeed: agent.maxSpeed,
        })),
      };
    },
    restore(next) {
      slots.length = 0;
      slotOf.clear();
      tunables = {
        timeHorizon: Math.max(EPSILON, next.tunables.timeHorizon),
        neighborDist: Math.max(EPSILON, next.tunables.neighborDist),
        maxNeighbors: Math.max(1, Math.floor(next.tunables.maxNeighbors)),
        sideBias: Number.isFinite(next.tunables.sideBias) ? next.tunables.sideBias : DEFAULT_TUNABLES.sideBias,
        overlapRelief: Number.isFinite(next.tunables.overlapRelief) ? next.tunables.overlapRelief : DEFAULT_TUNABLES.overlapRelief,
      };
      resizeBuffers();
      refreshBias();
      for (const saved of next.agents) {
        slots.push({ ...saved, prefX: 0, prefZ: 0 });
        slotOf.set(saved.id, slots.length - 1);
      }
    },
    dispose() {
      unregister?.();
    },
  };
}
