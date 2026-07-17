import { describe, expect, test } from "bun:test";
import {
  createOrderQueue,
  createOrderRegistry,
  type OrderRegistry,
  type OrderVec3,
} from "@jgengine/core/orders/orderQueue";
import {
  defineAttackMoveOrder,
  defineHoldOrder,
  defineMoveOrder,
  definePatrolOrder,
  defineStopOrder,
  defineTargetedOrder,
  type AttackMoveOrderPayload,
  type EngagementOrderState,
  type MoveOrderPayload,
  type OrderMover,
  type OrderTargeting,
  type PatrolOrderPayload,
  type TargetedOrderPayload,
} from "@jgengine/core/orders/orderKinds";

/** A deterministic 1-D-along-a-line mover: steps a fixed distance toward any point, snapping on arrival. */
class MockWorld implements OrderMover, OrderTargeting {
  pos: OrderVec3 | null;
  halted = 0;
  private readonly speed: number;
  private readonly targets = new Map<string, OrderVec3>();

  constructor(start: OrderVec3, speed = 2) {
    this.pos = start;
    this.speed = speed;
  }

  setTarget(id: string, pos: OrderVec3 | null): void {
    if (pos === null) this.targets.delete(id);
    else this.targets.set(id, pos);
  }

  position(): OrderVec3 | null {
    return this.pos;
  }

  moveToward(point: OrderVec3, options?: { speedScale?: number; arriveRadius?: number }): { arrived: boolean; distance: number } {
    if (this.pos === null) return { arrived: false, distance: Infinity };
    const arrive = options?.arriveRadius ?? 0.6;
    const step = this.speed * (options?.speedScale ?? 1);
    const dx = point[0] - this.pos[0];
    const dy = point[1] - this.pos[1];
    const dz = point[2] - this.pos[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= arrive) return { arrived: true, distance: dist };
    const t = Math.min(1, step / dist);
    this.pos = [this.pos[0] + dx * t, this.pos[1] + dy * t, this.pos[2] + dz * t];
    const remaining = Math.hypot(point[0] - this.pos[0], point[1] - this.pos[1], point[2] - this.pos[2]);
    return { arrived: remaining <= arrive, distance: remaining };
  }

  halt(): void {
    this.halted += 1;
  }

  acquire(radius: number): string | null {
    if (this.pos === null) return null;
    let best: string | null = null;
    let bestDist = radius;
    for (const [id, tpos] of this.targets) {
      const d = Math.hypot(tpos[0] - this.pos[0], tpos[1] - this.pos[1], tpos[2] - this.pos[2]);
      if (d <= bestDist) {
        best = id;
        bestDist = d;
      }
    }
    return best;
  }

  positionOf(id: string): OrderVec3 | null {
    return this.targets.get(id) ?? null;
  }
}

function fullRegistry(): OrderRegistry<MockWorld> {
  const reg = createOrderRegistry<MockWorld>();
  reg.define(defineMoveOrder<MockWorld>());
  reg.define(defineStopOrder<MockWorld>());
  reg.define(defineHoldOrder<MockWorld>());
  reg.define(defineAttackMoveOrder<MockWorld>());
  reg.define(defineTargetedOrder<MockWorld>());
  reg.define(definePatrolOrder<MockWorld>());
  return reg;
}

function tickUntilIdle(queue: ReturnType<typeof createOrderQueue<MockWorld>>, world: MockWorld, max = 100): number {
  let n = 0;
  while (!queue.isIdle() && n < max) {
    queue.tick(world, 1);
    n += 1;
  }
  return n;
}

describe("move order", () => {
  test("walks to the point and completes on arrival", () => {
    const world = new MockWorld([0, 0, 0], 2);
    const queue = createOrderQueue<MockWorld>(fullRegistry());
    queue.issue<MoveOrderPayload>({ kind: "move", payload: { point: [5, 0, 0] } });
    const ticks = tickUntilIdle(queue, world);
    expect(ticks).toBeGreaterThan(1);
    expect(world.pos?.[0]).toBeGreaterThan(4.4);
    expect(world.halted).toBeGreaterThan(0); // finish halted the mover
  });

  test("fails cleanly when the mover despawns", () => {
    const world = new MockWorld([0, 0, 0]);
    const queue = createOrderQueue<MockWorld>(fullRegistry());
    queue.issue<MoveOrderPayload>({ kind: "move", payload: { point: [5, 0, 0] } });
    queue.tick(world, 1); // activate + move
    world.pos = null;
    const report = queue.tick(world, 1);
    expect(report.canceled).toEqual([{ id: report.canceled[0]?.id ?? "", reason: "failed" }]);
    expect(queue.isIdle()).toBe(true);
  });
});

describe("stop and hold orders", () => {
  test("stop halts and completes immediately", () => {
    const world = new MockWorld([1, 0, 0]);
    const queue = createOrderQueue<MockWorld>(fullRegistry());
    queue.issue({ kind: "stop", payload: {} });
    const report = queue.tick(world, 1);
    expect(report.completed.length).toBe(1);
    expect(world.halted).toBe(1);
    expect(queue.isIdle()).toBe(true);
  });

  test("hold never completes on its own", () => {
    const world = new MockWorld([1, 0, 0]);
    const queue = createOrderQueue<MockWorld>(fullRegistry());
    queue.issue({ kind: "hold", payload: {} });
    for (let i = 0; i < 10; i += 1) queue.tick(world, 1);
    expect(queue.active()?.kind).toBe("hold");
    expect(world.halted).toBeGreaterThan(0);
  });
});

describe("attack-move order", () => {
  test("breaks off to engage a hostile, then resumes to the destination", () => {
    const world = new MockWorld([0, 0, 0], 2);
    world.setTarget("goblin", [3, 0, 0]);
    const queue = createOrderQueue<MockWorld>(fullRegistry());
    queue.issue<AttackMoveOrderPayload>({
      kind: "attack-move",
      payload: { point: [20, 0, 0], aggroRadius: 6, attackRange: 1 },
    });

    // Pursue the goblin until in range.
    let engagedInRange = false;
    for (let i = 0; i < 10 && !engagedInRange; i += 1) {
      queue.tick(world, 1);
      const state = queue.active()?.state as EngagementOrderState | undefined;
      if (state?.engaging === "goblin" && state.inRange) engagedInRange = true;
    }
    expect(engagedInRange).toBe(true);

    // Goblin dies -> re-acquire finds nothing -> resume toward the far destination.
    world.setTarget("goblin", null);
    queue.tick(world, 1);
    const state = queue.active()?.state as EngagementOrderState;
    expect(state.engaging).toBeNull();
    expect(world.pos?.[0]).toBeGreaterThan(3);
  });
});

describe("targeted order", () => {
  test("pursues a target and completes when it is gone", () => {
    const world = new MockWorld([0, 0, 0], 2);
    world.setTarget("boss", [4, 0, 0]);
    const queue = createOrderQueue<MockWorld>(fullRegistry());
    queue.issue<TargetedOrderPayload>({ kind: "targeted", payload: { targetId: "boss", range: 1 } });

    queue.tick(world, 1);
    queue.tick(world, 1);
    const state = queue.active()?.state as EngagementOrderState;
    expect(state.inRange).toBe(true);

    world.setTarget("boss", null);
    const report = queue.tick(world, 1);
    expect(report.completed.length).toBe(1);
    expect(queue.isIdle()).toBe(true);
  });

  test("rejects an empty target id", () => {
    const queue = createOrderQueue<MockWorld>(fullRegistry());
    const result = queue.issue<TargetedOrderPayload>({ kind: "targeted", payload: { targetId: "" } });
    expect(result.status).toBe("rejected");
  });
});

describe("patrol order", () => {
  test("cycles waypoints and advances the serialized index", () => {
    const world = new MockWorld([0, 0, 0], 5);
    const waypoints: OrderVec3[] = [
      [10, 0, 0],
      [10, 0, 10],
      [0, 0, 0],
    ];
    const queue = createOrderQueue<MockWorld>(fullRegistry());
    queue.issue<PatrolOrderPayload>({ kind: "patrol", payload: { waypoints, loop: true } });

    const seen = new Set<number>();
    for (let i = 0; i < 30; i += 1) {
      queue.tick(world, 1);
      const state = queue.active()?.state as { index: number } | undefined;
      if (state) seen.add(state.index);
    }
    expect([...seen].sort()).toEqual([0, 1, 2]); // visited every waypoint index
    expect(queue.active()?.kind).toBe("patrol"); // still looping
  });

  test("completes at the last waypoint when loop is false", () => {
    const world = new MockWorld([0, 0, 0], 5);
    const queue = createOrderQueue<MockWorld>(fullRegistry());
    queue.issue<PatrolOrderPayload>({
      kind: "patrol",
      payload: { waypoints: [[5, 0, 0]], loop: false },
    });
    const ticks = tickUntilIdle(queue, world);
    expect(ticks).toBeGreaterThan(0);
    expect(queue.isIdle()).toBe(true);
  });

  test("rejects an empty waypoint list", () => {
    const queue = createOrderQueue<MockWorld>(fullRegistry());
    const result = queue.issue<PatrolOrderPayload>({ kind: "patrol", payload: { waypoints: [] } });
    expect(result.status).toBe("rejected");
  });
});

describe("custom verb via configurable kind", () => {
  test("registers a move composition under a game-specific name", () => {
    const reg = createOrderRegistry<MockWorld>();
    reg.define(defineMoveOrder<MockWorld>({ kind: "harvest", arriveRadius: 0.5 }));
    const world = new MockWorld([0, 0, 0], 3);
    const queue = createOrderQueue<MockWorld>(reg);
    const result = queue.issue<MoveOrderPayload>({ kind: "harvest", payload: { point: [6, 0, 0] } });
    expect(result.status).toBe("accepted");
    tickUntilIdle(queue, world);
    expect(world.pos?.[0]).toBeGreaterThan(5.4);
  });
});
