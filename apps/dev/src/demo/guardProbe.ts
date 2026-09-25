import type { Blackboard, DecisionGraph } from "@jgengine/core/ai/decisionGraph";
import { createNavMeshQuery, type NavMeshData, type NavMeshQuery } from "@jgengine/core/nav/navMesh";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { behaviorControl, registerBehaviorActions, type BehaviorActionContext } from "@jgengine/core/scene/behaviorRuntime";
import { createPerception, type PerceptionPosition, type PerceptionService } from "@jgengine/core/sensor/perception";

export const GUARD_ID = "guard";
export const GUARD_ACTIONS = "guard-probe";
export const PLAYER_SPAWN: readonly [number, number, number] = [0, 0, -4];
export const GUARD_POSTS: readonly (readonly [number, number])[] = [[-9, 8], [9, 8]];
/** The one wall in the yard, XZ extents; the nav mesh, sight occlusion and the rendered block all read it. */
export const WALL = { minX: -6, maxX: 6, minZ: 2, maxZ: 3, height: 2.4 } as const;
const YARD = 20;
const PATROL_SPEED = 1.6;
const INVESTIGATE_SPEED = 3;
const ARRIVE = 0.4;
const SEARCH_SECONDS = 3;

/** Senses tuned so a sprint carries across the yard; walking is silent. */
export const GUARD_SENSES = { sightRange: 10, sightConeDeg: 100, hearingRange: 14, memorySeconds: 6 } as const;
/** Footstep noise is judged on speed averaged over this window, so frame-time jitter never reads as a sprint. */
const NOISE_INTERVAL_MS = 250;

/**
 * Patrol posts; on a fresh noise or sighting, walk to the last known position, search, give up, and go back to patrolling.
 * The perception system writes `alerted` and `lastKnownX/Z` into the guard's blackboard; the graph only reads them.
 */
export const guardGraph: DecisionGraph = {
  kind: "selector",
  children: [
    { kind: "sequence", memory: true, children: [
      { kind: "condition", key: "alerted", op: "=", value: true },
      { kind: "action", action: "investigate" },
      { kind: "wait", seconds: SEARCH_SECONDS },
      { kind: "action", action: "giveUp" },
    ] },
    { kind: "action", action: "patrol" },
  ],
};

export const guardBlackboard: Blackboard = { alerted: false, post: 0, handledAt: -1, heardAt: -1, confidence: 0 };

function insideWall(x: number, z: number, pad: number): boolean {
  return x > WALL.minX - pad && x < WALL.maxX + pad && z > WALL.minZ - pad && z < WALL.maxZ + pad;
}

/** A 1 m quad grid over the yard with the wall's footprint, padded by the guard's radius, left out. */
export function yardNavMesh(): NavMeshData {
  const cells = YARD * 2;
  const verts: number[] = [];
  for (let r = 0; r <= cells; r += 1) for (let c = 0; c <= cells; c += 1) verts.push(c - YARD, 0, r - YARD);
  const polys: number[][] = [];
  for (let r = 0; r < cells; r += 1) for (let c = 0; c < cells; c += 1) {
    if (insideWall(c - YARD + 0.5, r - YARD + 0.5, 1)) continue;
    const a = r * (cells + 1) + c;
    polys.push([a, a + 1, a + cells + 2, a + cells + 1]);
  }
  return { verts, polys, links: [] };
}

/** True when the wall blocks the straight line between two points on the XZ plane. */
export function wallBlocks(from: PerceptionPosition, to: PerceptionPosition): boolean {
  let t0 = 0, t1 = 1;
  const dx = to[0] - from[0], dz = to[2] - from[2];
  for (const [p, q] of [[-dx, from[0] - WALL.minX], [dx, WALL.maxX - from[0]], [-dz, from[2] - WALL.minZ], [dz, WALL.maxZ - from[2]]] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

interface Route {
  goalX: number;
  goalZ: number;
  points: (readonly [number, number, number])[];
  next: number;
}

/** Walks one entity along nav-mesh routes, replanning only when the goal moves. */
function createWalker(query: NavMeshQuery) {
  const routes = new Map<string, Route>();
  return {
    clear(id: string): void {
      routes.delete(id);
    },
    step(ctx: GameContext, id: string, goalX: number, goalZ: number, speed: number, dt: number): "running" | "done" | "failed" {
      const entity = ctx.scene.entity.get(id);
      if (entity === null) return "failed";
      let route = routes.get(id);
      if (route === undefined || Math.hypot(route.goalX - goalX, route.goalZ - goalZ) > 0.5) {
        const path = query.findPath(entity.position, [goalX, 0, goalZ]);
        if (path === null) return "failed";
        route = { goalX, goalZ, points: path.points, next: 1 };
        routes.set(id, route);
      }
      let [x, , z] = entity.position;
      let budget = speed * dt;
      let heading = entity.rotationY;
      while (budget > 0 && route.next < route.points.length) {
        const target = route.points[route.next]!;
        const dx = target[0] - x, dz = target[2] - z;
        const distance = Math.hypot(dx, dz);
        if (distance > 1e-6) heading = Math.atan2(dx, dz);
        if (distance <= budget) {
          x = target[0]; z = target[2]; budget -= distance; route.next += 1;
        } else {
          x += (dx / distance) * budget; z += (dz / distance) * budget; budget = 0;
        }
      }
      ctx.scene.entity.setPose(id, { position: [x, 0, z], rotationY: heading, dt });
      if (Math.hypot(goalX - x, goalZ - z) <= ARRIVE) {
        routes.delete(id);
        return "done";
      }
      return "running";
    },
  };
}

/** Register the guard's actions against a nav mesh; returns the unregister. */
export function registerGuardActions(mesh: NavMeshData = yardNavMesh()): () => void {
  const walker = createWalker(createNavMeshQuery(mesh));
  return registerBehaviorActions(GUARD_ACTIONS, {
    patrol: ({ ctx, entityId, dt }: BehaviorActionContext, _params, board) => {
      const index = Number(board.post) % GUARD_POSTS.length;
      const [x, z] = GUARD_POSTS[index]!;
      if (walker.step(ctx, entityId, x, z, PATROL_SPEED, dt) === "done") board.post = index + 1;
      return "running";
    },
    investigate: ({ ctx, entityId, dt }, _params, board) =>
      walker.step(ctx, entityId, Number(board.lastKnownX), Number(board.lastKnownZ), INVESTIGATE_SPEED, dt),
    giveUp: (_ctx, _params, board) => {
      board.alerted = false;
      board.handledAt = board.heardAt ?? -1;
      return "done";
    },
  }, { onAbort: (_action, { entityId }) => walker.clear(entityId) });
}

/** The guard's senses: movement noise from the player, sight through the wall check, and the facts they leave on the blackboard. */
export interface GuardSenses {
  readonly perception: PerceptionService;
  tick(ctx: GameContext, playerId: string, dt: number): void;
  nowMs(): number;
}

export function createGuardSenses(): GuardSenses {
  const perception = createPerception({ ...GUARD_SENSES, occluded: wallBlocks });
  let now = 0;
  let lastSample = 0;
  let lastPlayer: readonly [number, number, number] | null = null;
  return {
    perception,
    nowMs: () => now,
    tick(ctx, playerId, dt) {
      now += dt * 1000;
      const player = ctx.scene.entity.get(playerId);
      const guard = ctx.scene.entity.get(GUARD_ID);
      const board = behaviorControl(ctx).blackboard(GUARD_ID);
      if (player === null || guard === null || board === null) return;
      if (lastPlayer === null) {
        lastPlayer = [...player.position];
        lastSample = now;
      } else if (now - lastSample >= NOISE_INTERVAL_MS) {
        const speed = Math.hypot(player.position[0] - lastPlayer[0], player.position[2] - lastPlayer[2]) / ((now - lastSample) / 1000);
        if (speed > (player.movement.walkSpeed ?? 3) * 1.3) {
          perception.pushStimulus({ kind: "sound", sourceId: playerId, position: player.position, at: now });
        }
        lastPlayer = [...player.position];
        lastSample = now;
      }
      perception.observe({ id: GUARD_ID, position: guard.position, yaw: guard.rotationY }, [{ id: playerId, position: player.position }], now);
      const memory = perception.memory(GUARD_ID).find((entry) => entry.targetId === playerId);
      board.confidence = memory?.confidence ?? 0;
      if (memory !== undefined && memory.lastSeenAt > Number(board.handledAt)) {
        board.alerted = true;
        board.heardAt = memory.lastSeenAt;
        board.lastKnownX = memory.lastKnownPos[0];
        board.lastKnownZ = memory.lastKnownPos[2];
      }
    },
  };
}
