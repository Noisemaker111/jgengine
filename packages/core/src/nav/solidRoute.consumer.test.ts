import { expect, test } from "bun:test";
import {
  createObstacleReachCache,
  resolveSourceWalkerStep,
  sourceObstacleReach,
  sourceObstaclesNear,
  type SolidObstacleSource,
} from "../movement/solidObstacles";
import { createOrderQueue, createOrderRegistry, type OrderKind } from "../orders/orderQueue";
import { defaultObjectColliders } from "../scene/colliders";
import { createObjectStore } from "../scene/objectStore";
import { createWorldSolids } from "../world/worldSolids";
import { advancePathFollow, createPathFollow, type PathFollowConfig, type PathFollowState, type Waypoint } from "./pathFollow";
import { planSolidRoute } from "./solidRoute";

test("a pure delivery order composes priced routing, caller movement and saved follower progress", () => {
  const ground = (x: number) => x * 0.02;
  const objects = createObjectStore();
  objects.place("crate", 11, 1, -2, { instanceId: "crate" });
  const solids = createWorldSolids();
  solids.set("depot", [{ center: [6, 1, 0], halfExtents: [1, 1, 2], rotationY: Math.PI / 6 }]);
  const source: SolidObstacleSource = {
    list: () => objects.list(),
    inBox: (min, max) => objects.inBox(min, max),
    collidersOf: () => defaultObjectColliders([0.5, 1, 0.8]),
    solids,
  };
  const reach = sourceObstacleReach(source, createObstacleReachCache());
  const movementCache = createObstacleReachCache();
  const start: Waypoint = [1, ground(1), 0];
  const goal: Waypoint = [15, ground(15), 0];
  let queries = 0;
  let prices = 0;
  type DeliveryState = { config: PathFollowConfig; follower: PathFollowState };
  type Courier = { position: Waypoint; delivered: string[]; positions: Waypoint[] };
  const registry = createOrderRegistry<Courier>();
  const delivery: OrderKind<Courier, { parcel: string; destination: Waypoint }> = {
    kind: "deliver",
    start(order, courier) {
      const route = planSolidRoute(courier.position, order.payload.destination, {
        bounds: { minX: 0, maxX: 16, minZ: -7, maxZ: 7 },
        cellSize: 1,
        radius: 0.25,
        sampleHeight: ground,
        canTraverse: (from, to) => Math.abs(from[2]) < 6 && Math.abs(to[2]) < 6,
        stepCost: (_from, to) => {
          prices++;
          return to[1] > 0 ? 8 : 1;
        },
        obstaclesInBounds(bounds) {
          queries++;
          return sourceObstaclesNear(source, reach, [
            (bounds.minX + bounds.maxX) / 2,
            ground((bounds.minX + bounds.maxX) / 2),
            (bounds.minZ + bounds.maxZ) / 2,
          ], (bounds.maxX - bounds.minX) / 2, (bounds.maxZ - bounds.minZ) / 2);
        },
      });
      expect(route.status).toBe("path");
      if (route.status !== "path") return { ok: false, reason: route.status };
      expect(route.waypoints[0]).toEqual(start);
      expect(route.waypoints.at(-1)).toEqual(goal);
      expect(route.waypoints.some((point) => point[2] < -2)).toBe(true);
      expect(route.waypoints.every((point) => point[2] <= 0)).toBe(true);
      expect(route.work.boxes).toBeGreaterThan(1);
      const config: PathFollowConfig = { waypoints: route.waypoints, speed: 3 };
      order.state = { config, follower: createPathFollow(config) } satisfies DeliveryState;
      return { ok: true };
    },
    update(order, courier, dt) {
      const state = order.state as DeliveryState;
      const next = advancePathFollow(state.config, state.follower, dt);
      const stepX = next.position[0] - courier.position[0];
      const stepZ = next.position[2] - courier.position[2];
      const resolved = resolveSourceWalkerStep(source, movementCache, courier.position, stepX, stepZ, { radius: 0.25 });
      expect(resolved.stepX).toBeCloseTo(stepX, 10);
      expect(resolved.stepZ).toBeCloseTo(stepZ, 10);
      courier.position = [courier.position[0] + resolved.stepX, next.position[1], courier.position[2] + resolved.stepZ];
      courier.positions.push(courier.position);
      state.follower = next;
      return next.done ? { status: "completed" } : { status: "running" };
    },
    finish(order, courier, outcome) {
      if (outcome.phase === "completed") courier.delivered.push(order.payload.parcel);
    },
  };
  registry.define(delivery);
  const queue = createOrderQueue(registry);
  const courier: Courier = { position: start, delivered: [], positions: [] };
  queue.issue({ kind: "deliver", payload: { parcel: "seed packet", destination: goal } });
  for (let tick = 0; tick < 30; tick++) queue.tick(courier, 0.05);
  expect(queue.isIdle()).toBe(false);
  expect(queries).toBe(1);
  expect(prices).toBeGreaterThan(0);
  const saved = JSON.parse(JSON.stringify({ queue: queue.serialize(), courier }));
  const resumed = createOrderQueue(registry, { initial: saved.queue });
  const restored: Courier = saved.courier;
  for (let tick = 0; !queue.isIdle() && tick < 500; tick++) queue.tick(courier, 0.05);
  for (let tick = 0; !resumed.isIdle() && tick < 500; tick++) resumed.tick(restored, 0.05);
  expect(queue.isIdle()).toBe(true);
  expect(resumed.isIdle()).toBe(true);
  expect(restored).toEqual(courier);
  expect(courier.position).toEqual(goal);
  expect(courier.delivered).toEqual(["seed packet"]);
  expect(queries).toBe(1);
});
