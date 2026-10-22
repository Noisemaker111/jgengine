import { devtools } from "../devtools/devtools";
import type { Vec3 } from "../world/geometry";
import type { NavMeshPath } from "./navMesh";
import type { NavRebuildStats, NavRegion, NavRuntime } from "./navRuntime";
import { createRvoCrowd, type RvoCrowd, type RvoTunables } from "../ai/rvo";
import { spreadOffset } from "../ai/crowd";

/** How one crowd agent was configured when it joined. */
export interface NavCrowdAgentSpec {
  position: Vec3;
  goal: Vec3;
  /** World units per second; defaults to the crowd's `speed`. */
  speed?: number;
  /** Avoidance radius; defaults to the crowd's `radius`. */
  radius?: number;
}

/** One crowd agent's live state, as a game or the devtools overlay reads it. */
export interface NavCrowdAgentView {
  id: string;
  position: Vec3;
  velocity: readonly [number, number];
  goal: Vec3;
  /** Index of the waypoint it is steering toward; equals the waypoint count once the route is done. */
  waypoint: number;
  waypoints: number;
  arrived: boolean;
  /** True while the agent waits for its turn in the bounded re-plan budget. */
  waitingForPlan: boolean;
}

/** Result of telling the crowd the nav mesh changed. */
export interface NavCrowdRevalidate {
  /** Agents whose remaining route crossed replaced polygons and were queued for a new plan. */
  queued: number;
  /** Agents whose route stayed entirely on kept polygons and was left alone. */
  untouched: number;
}

/** Counters a devtools probe or test reads. */
export interface NavCrowdStats {
  agents: number;
  arrived: number;
  waitingForPlan: number;
  /** Path searches run since creation — add, setGoal, queued plans and repaths. */
  plans: number;
  /** Path searches that returned no route. */
  unroutable: number;
  ticks: number;
  /** Slowest single `tick` seen so far, in milliseconds. */
  slowestTickMs: number;
}

/** Serializable crowd state: agents, their routes, and the avoidance tuning they run under. */
export interface NavCrowdSnapshot {
  tunables: {
    speed: number;
    radius: number;
    goalRadius: number;
    spread: number;
    waypointRadius: number;
    replanBudget: number;
    replanMs: number;
    avoid: RvoTunables;
  };
  agents: {
    id: string;
    position: Vec3;
    velocity: readonly [number, number];
    goal: Vec3;
    offsetX: number;
    offsetZ: number;
    speed: number;
    radius: number;
    waypoints: Vec3[];
    waypoint: number;
    arrived: boolean;
    polys: number[];
    waitingForPlan: boolean;
  }[];
}

/** Tunables for {@link createNavCrowd}, every one retunable in play. */
export interface NavCrowdOptions {
  /** Default walking speed for agents that do not set their own. */
  speed?: number;
  radius?: number;
  /** Distance to the goal that counts as arrived. Default 0.5. */
  goalRadius?: number;
  /**
   * Radius, in world units, over which agents targeting the same goal fan out onto distinct spots
   * (`ai/crowd`'s stable per-id `spreadOffset`). `0` walks every agent to the exact goal. Default 0.
   */
  spread?: number;
  /** Distance to a waypoint that advances to the next one. Default 0.6. */
  waypointRadius?: number;
  /** Most path searches one `tick` may run for queued agents. Default 8. */
  replanBudget?: number;
  /** Milliseconds of path searching one `tick` may spend, whatever the budget. Default 1.5. */
  replanMs?: number;
  /** Avoidance tuning for the internal {@link RvoCrowd}. */
  avoid?: Partial<RvoTunables>;
  /** Register a devtools probe under this name so the perf overlay shows crowd counters. */
  devtoolsName?: string;
}

/**
 * Agents that cross an editor-baked nav mesh: each one plans a corridor with {@link NavRuntime},
 * walks the funnel-smoothed waypoints, and keeps its distance through reciprocal velocity obstacle
 * avoidance. Goals, arrivals and replans are serializable; a mesh edit only re-plans the agents
 * whose remaining route actually crossed the rebuilt region.
 */
export interface NavCrowd {
  /** Add an agent and plan its first route; false when the id is already present. */
  add(id: string, spec: NavCrowdAgentSpec): boolean;
  remove(id: string): boolean;
  has(id: string): boolean;
  count(): number;
  ids(): readonly string[];
  /** Send an agent somewhere new; it re-plans on the next tick within the re-plan budget. */
  setGoal(id: string, goal: Vec3): boolean;
  /** Plan one agent now, ignoring the budget. Returns false when no route exists. */
  plan(id: string): boolean;
  agent(id: string): NavCrowdAgentView | null;
  /** Advance every agent by `dt` seconds. */
  tick(dt: number): void;
  /**
   * Queue a re-plan for agents whose remaining route crossed polygons the last
   * {@link NavRuntime.applyMesh} replaced or moved; routes on kept polygons are left intact.
   */
  revalidate(stats: NavRebuildStats, region?: NavRegion): NavCrowdRevalidate;
  stats(): NavCrowdStats;
  retune(patch: NavCrowdOptions): void;
  snapshot(): NavCrowdSnapshot;
  restore(next: NavCrowdSnapshot): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

interface CrowdAgent {
  id: string;
  goal: Vec3;
  offsetX: number;
  offsetZ: number;
  speed: number;
  radius: number;
  waypoints: Vec3[];
  waypoint: number;
  polys: number[];
  arrived: boolean;
  waitingForPlan: boolean;
  x: number;
  y: number;
  z: number;
  velocity: [number, number];
}

/** Scratch record the avoidance solve writes into, so a tick allocates nothing per agent. */
interface MotionOut {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

const EPSILON = 1e-9;

function sameVec(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * Compose {@link createNavRuntime} and {@link createRvoCrowd} into a moving crowd: plan on the mesh,
 * follow the smoothed corridor, avoid each other. Deterministic — agents advance in insertion order
 * and the avoidance solve breaks ties by slot, not chance.
 *
 * @capability nav-crowd move many agents across an editor-baked nav mesh with avoidance
 */
export function createNavCrowd(options: NavCrowdOptions & { nav: NavRuntime }): NavCrowd {
  const nav = options.nav;
  let speed = Math.max(0, options.speed ?? 3);
  let radius = Math.max(0, options.radius ?? 0.4);
  let goalRadius = Math.max(0, options.goalRadius ?? 0.5);
  let spread = Math.max(0, options.spread ?? 0);
  let waypointRadius = Math.max(0, options.waypointRadius ?? 0.6);
  let replanBudget = Math.max(1, Math.floor(options.replanBudget ?? 8));
  let replanMs = Math.max(0, options.replanMs ?? 1.5);
  const agents: CrowdAgent[] = [];
  const agentOf = new Map<string, number>();
  const avoid: RvoCrowd = createRvoCrowd({ devtoolsName: undefined, ...options.avoid });
  let ticks = 0;
  let plans = 0;
  let unroutable = 0;
  let slowestTickMs = 0;
  const motion: MotionOut = { x: 0, z: 0, vx: 0, vz: 0 };

  let cachedBounds: [number, number, number, number] = [0, 0, 0, 0];
  let cachedRebuilds = -1;

  /** Whole-mesh XZ bounds, recomputed only after the runtime exchanged the mesh. */
  function meshBounds(): [number, number, number, number] {
    const rebuilds = nav.rebuilds();
    if (rebuilds === cachedRebuilds) return cachedBounds;
    const verts = nav.mesh.verts;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < verts.length; i += 3) {
      const x = verts[i]!;
      const z = verts[i + 2]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    cachedBounds = Number.isFinite(minX) ? [minX, minZ, maxX, maxZ] : [0, 0, 0, 0];
    cachedRebuilds = rebuilds;
    return cachedBounds;
  }

  function probeLine(): string {
    let arrived = 0;
    let waiting = 0;
    for (const agent of agents) {
      if (agent.arrived) arrived += 1;
      if (agent.waitingForPlan) waiting += 1;
    }
    return `${agents.length} agents ${arrived} arrived ${waiting} waiting ${plans} plans ${unroutable} unroutable ${ticks} ticks ${slowestTickMs.toFixed(2)} ms slowest`;
  }

  const unregister = options.devtoolsName === undefined ? null : devtools.probes.register(options.devtoolsName, () => probeLine());

  function applyPath(agent: CrowdAgent, path: NavMeshPath | null): boolean {
    plans += 1;
    if (path === null || path.points.length === 0) {
      agent.waypoints = [];
      agent.waypoint = 0;
      agent.polys = [];
      agent.arrived = false;
      agent.waitingForPlan = false;
      unroutable += 1;
      return false;
    }
    agent.waypoints = path.points.map((point) => [point[0], point[1], point[2]] as Vec3);
    agent.waypoint = agent.waypoints.length > 1 ? 1 : 0;
    agent.polys = [...path.polys];
    agent.arrived = false;
    agent.waitingForPlan = false;
    return true;
  }

  function aim(agent: CrowdAgent): Vec3 {
    return [agent.goal[0] + agent.offsetX, agent.goal[1], agent.goal[2] + agent.offsetZ];
  }

  function replan(agent: CrowdAgent): boolean {
    return applyPath(agent, nav.plan([agent.x, agent.y, agent.z], aim(agent)));
  }

  function index(id: string): number | undefined {
    return agentOf.get(id);
  }

  return {
    add(id, spec) {
      if (agentOf.has(id)) return false;
      const [offsetX, offsetZ] = spread > 0 ? spreadOffset(id, spread) : [0, 0];
      const agent: CrowdAgent = {
        id,
        goal: spec.goal,
        offsetX,
        offsetZ,
        speed: Math.max(0, spec.speed ?? speed),
        radius: Math.max(0, spec.radius ?? radius),
        waypoints: [],
        waypoint: 0,
        polys: [],
        arrived: false,
        waitingForPlan: false,
        x: spec.position[0],
        y: spec.position[1],
        z: spec.position[2],
        velocity: [0, 0],
      };
      agents.push(agent);
      agentOf.set(id, agents.length - 1);
      avoid.add(id, { x: spec.position[0], z: spec.position[2], radius: agent.radius, maxSpeed: agent.speed });
      replan(agent);
      return true;
    },
    remove(id) {
      const at = index(id);
      if (at === undefined) return false;
      const last = agents.pop()!;
      agentOf.delete(id);
      if (at < agents.length) {
        agents[at] = last;
        agentOf.set(last.id, at);
      }
      avoid.remove(id);
      return true;
    },
    has: (id) => agentOf.has(id),
    count: () => agents.length,
    ids: () => agents.map((agent) => agent.id),
    setGoal(id, goal) {
      const at = index(id);
      if (at === undefined) return false;
      const agent = agents[at]!;
      if (agent.arrived && sameVec(agent.goal, goal)) return true;
      agent.goal = goal;
      agent.arrived = false;
      agent.waitingForPlan = true;
      return true;
    },
    plan(id) {
      const at = index(id);
      if (at === undefined) return false;
      return replan(agents[at]!);
    },
    agent(id) {
      const at = index(id);
      if (at === undefined) return null;
      const agent = agents[at]!;
      return {
        id: agent.id,
        position: [agent.x, agent.y, agent.z],
        velocity: agent.velocity,
        goal: agent.goal,
        waypoint: agent.waypoint,
        waypoints: agent.waypoints.length,
        arrived: agent.arrived,
        waitingForPlan: agent.waitingForPlan,
      };
    },
    tick(dt) {
      if (!(dt > 0) || agents.length === 0) return;
      const started = performance.now();
      let budget = replanBudget;
      const replanDeadline = started + replanMs;
      for (const agent of agents) {
        if (!agent.waitingForPlan) continue;
        if (budget <= 0) break;
        if (performance.now() > replanDeadline) break;
        budget -= 1;
        replan(agent);
      }
      for (const agent of agents) {
        const target = agent.arrived ? null : agent.waypoints[agent.waypoint];
        if (target === null || target === undefined) {
          // A route that ended short of the goal (congestion pushed it away) needs a new plan, or the
          // agent would stand there with no target forever.
          if (!agent.arrived && !agent.waitingForPlan && agent.waypoints.length > 0) agent.waitingForPlan = true;
          avoid.setPreferredVelocity(agent.id, 0, 0);
          continue;
        }
        const dx = target[0] - agent.x;
        const dz = target[2] - agent.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= EPSILON) {
          avoid.setPreferredVelocity(agent.id, 0, 0);
          continue;
        }
        const want = Math.min(agent.speed, distance / dt);
        avoid.setPreferredVelocity(agent.id, (dx / distance) * want, (dz / distance) * want);
      }
      avoid.step(dt);
      const bounds = meshBounds();
      for (const agent of agents) {
        if (!avoid.readInto(agent.id, motion)) continue;
        agent.velocity[0] = motion.vx;
        agent.velocity[1] = motion.vz;
        let x = motion.x;
        let z = motion.z;
        let y = agent.y;
        // Avoidance pushes agents apart with no idea where the walls are; keep each one inside the
        // baked mesh's bounds so a shove cannot walk it off the walkable surface. Interior walls stay
        // the game's collision layer: this seam has the outer bound, not a baked obstacle field.
        if (x < bounds[0] - 0.01 || x > bounds[2] + 0.01 || z < bounds[1] - 0.01 || z > bounds[3] + 0.01) {
          const snapped = nav.closestPoint([x, y, z]);
          if (snapped !== null) {
            x = snapped[0];
            y = snapped[1];
            z = snapped[2];
            avoid.setKinematics(agent.id, { x, z });
          }
        }
        let advanced = true;
        for (let guard = agent.waypoints.length + 1; advanced && guard > 0; guard -= 1) {
          advanced = false;
          const target = agent.waypoints[agent.waypoint];
          if (target === undefined) break;
          if (Math.hypot(target[0] - x, target[2] - z) <= waypointRadius) {
            y = target[1];
            agent.waypoint += 1;
            advanced = true;
          }
        }
        agent.x = x;
        agent.y = y;
        agent.z = z;
        const goalDistance = Math.hypot(agent.goal[0] + agent.offsetX - x, agent.goal[2] + agent.offsetZ - z);
        if (agent.waypoint >= agent.waypoints.length && goalDistance <= Math.max(goalRadius, waypointRadius)) {
          agent.arrived = true;
          agent.waypoints = [];
          agent.waypoint = 0;
          agent.polys = [];
        } else if (agent.arrived && goalDistance > Math.max(goalRadius, waypointRadius)) {
          agent.arrived = false;
          agent.waitingForPlan = true;
        }
      }
      ticks += 1;
      slowestTickMs = Math.max(slowestTickMs, performance.now() - started);
    },
    revalidate(stats, region) {
      let queued = 0;
      let untouched = 0;
      for (const agent of agents) {
        if (agent.waitingForPlan) {
          queued += 1;
          continue;
        }
        if (agent.waypoints.length === 0) {
          untouched += 1;
          continue;
        }
        let crossed = false;
        for (const poly of agent.polys) {
          if (poly < 0 || poly >= stats.remap.length || stats.remap[poly] === -1) {
            crossed = true;
            break;
          }
        }
        if (!crossed && region !== undefined) {
          for (let i = agent.waypoint; i < agent.waypoints.length && !crossed; i += 1) {
            const point = agent.waypoints[i]!;
            crossed = point[0] >= region.min[0] && point[0] <= region.max[0] && point[2] >= region.min[1] && point[2] <= region.max[1];
          }
        }
        if (crossed) {
          agent.waitingForPlan = true;
          queued += 1;
        } else {
          untouched += 1;
        }
      }
      return { queued, untouched };
    },
    stats() {
      let arrived = 0;
      let waiting = 0;
      for (const agent of agents) {
        if (agent.arrived) arrived += 1;
        if (agent.waitingForPlan) waiting += 1;
      }
      return { agents: agents.length, arrived, waitingForPlan: waiting, plans, unroutable, ticks, slowestTickMs };
    },
    retune(patch) {
      if (patch.speed !== undefined) speed = Math.max(0, patch.speed);
      if (patch.radius !== undefined) radius = Math.max(0, patch.radius);
      if (patch.goalRadius !== undefined) goalRadius = Math.max(0, patch.goalRadius);
      if (patch.spread !== undefined) {
        spread = Math.max(0, patch.spread);
        for (const agent of agents) {
          const [offsetX, offsetZ] = spread > 0 ? spreadOffset(agent.id, spread) : [0, 0];
          agent.offsetX = offsetX;
          agent.offsetZ = offsetZ;
          agent.arrived = false;
          agent.waitingForPlan = true;
        }
      }
      if (patch.waypointRadius !== undefined) waypointRadius = Math.max(0, patch.waypointRadius);
      if (patch.replanBudget !== undefined) replanBudget = Math.max(1, Math.floor(patch.replanBudget));
      if (patch.replanMs !== undefined) replanMs = Math.max(0, patch.replanMs);
      if (patch.avoid !== undefined) avoid.retune(patch.avoid);
    },
    snapshot() {
      const avoidState = avoid.snapshot();
      return {
        tunables: {
          speed,
          radius,
          goalRadius,
          spread,
          waypointRadius,
          replanBudget,
          replanMs,
          avoid: { ...avoidState.tunables },
        },
        agents: agents.map((agent) => ({
          id: agent.id,
          position: [agent.x, agent.y, agent.z],
          velocity: [agent.velocity[0], agent.velocity[1]] as const,
          goal: agent.goal,
          offsetX: agent.offsetX,
          offsetZ: agent.offsetZ,
          speed: agent.speed,
          radius: agent.radius,
          waypoints: agent.waypoints.map((point) => [point[0], point[1], point[2]] as Vec3),
          waypoint: agent.waypoint,
          arrived: agent.arrived,
          polys: [...agent.polys],
          waitingForPlan: agent.waitingForPlan,
        })),
      };
    },
    restore(next) {
      agents.length = 0;
      agentOf.clear();
      speed = next.tunables.speed;
      radius = next.tunables.radius;
      goalRadius = next.tunables.goalRadius;
      spread = Math.max(0, next.tunables.spread ?? 0);
      waypointRadius = next.tunables.waypointRadius;
      replanBudget = next.tunables.replanBudget;
      replanMs = next.tunables.replanMs ?? 1.5;
      avoid.restore({ tunables: { ...next.tunables.avoid }, agents: [] });
      for (const saved of next.agents) {
        const agent: CrowdAgent = {
          id: saved.id,
          goal: saved.goal,
          offsetX: saved.offsetX,
          offsetZ: saved.offsetZ,
          speed: saved.speed,
          radius: saved.radius,
          waypoints: saved.waypoints.map((point) => [point[0], point[1], point[2]] as Vec3),
          waypoint: saved.waypoint,
          polys: [...saved.polys],
          arrived: saved.arrived,
          waitingForPlan: saved.waitingForPlan,
          x: saved.position[0],
          y: saved.position[1],
          z: saved.position[2],
          velocity: [saved.velocity[0], saved.velocity[1]],
        };
        agents.push(agent);
        agentOf.set(agent.id, agents.length - 1);
        avoid.add(agent.id, {
          x: saved.position[0],
          z: saved.position[2],
          radius: saved.radius,
          maxSpeed: saved.speed,
          vx: saved.velocity[0],
          vz: saved.velocity[1],
        });
      }
    },
    dispose() {
      unregister?.();
    },
  };
}
