import { describe, expect, test } from "bun:test";
import {
  createOrderQueue,
  createOrderRegistry,
  type OrderEvent,
  type OrderKind,
  type OrderQueueState,
} from "@jgengine/core/orders/orderQueue";

interface CountPayload {
  ticks: number;
}

interface CountState {
  elapsed: number;
}

interface TestCtx {
  finished: string[];
}

/** A kind that completes after `payload.ticks` ticks, tracking progress in serializable state. */
function countKind(kind = "count"): OrderKind<TestCtx, CountPayload> {
  return {
    kind,
    validate: (payload) => (payload.ticks > 0 ? null : { reason: "ticks must be positive" }),
    start(order) {
      order.state = { elapsed: 0 } satisfies CountState;
      return { ok: true };
    },
    update(order) {
      const state = order.state as CountState;
      state.elapsed += 1;
      return state.elapsed >= order.payload.ticks ? { status: "completed" } : { status: "running" };
    },
    finish(order, ctx) {
      ctx.finished.push(order.id);
    },
  };
}

function ctx(): TestCtx {
  return { finished: [] };
}

function registry() {
  const reg = createOrderRegistry<TestCtx>();
  reg.define(countKind());
  return reg;
}

describe("order registry", () => {
  test("rejects duplicate kinds", () => {
    const reg = createOrderRegistry<TestCtx>();
    reg.define(countKind("a"));
    expect(() => reg.define(countKind("a"))).toThrow(/already defined/);
    expect(reg.has("a")).toBe(true);
    expect(reg.get("missing")).toBeNull();
    expect(reg.kinds()).toEqual(["a"]);
  });
});

describe("order lifecycle", () => {
  test("issues, activates, ticks, and completes an order", () => {
    const events: OrderEvent[] = [];
    const queue = createOrderQueue(registry(), { onEvent: (e) => events.push(e) });
    const c = ctx();

    const result = queue.issue<CountPayload>({ kind: "count", payload: { ticks: 2 }, id: "o1" });
    expect(result.status).toBe("accepted");
    expect(queue.active()).toBeNull(); // activation is deferred to tick

    let report = queue.tick(c, 1); // activates + first tick
    expect(report.activated).toEqual(["o1"]);
    expect(queue.active()?.phase).toBe("active");

    report = queue.tick(c, 1); // completes on second update
    expect(report.completed).toEqual(["o1"]);
    expect(queue.isIdle()).toBe(true);
    expect(c.finished).toEqual(["o1"]);
    expect(events.map((e) => e.type)).toEqual(["issued", "activated", "completed"]);
  });

  test("rejects an invalid payload before queuing", () => {
    const queue = createOrderQueue(registry());
    const result = queue.issue<CountPayload>({ kind: "count", payload: { ticks: 0 } });
    expect(result.status).toBe("rejected");
    expect(queue.isIdle()).toBe(true);
  });

  test("rejects an unknown kind", () => {
    const queue = createOrderQueue(registry());
    const result = queue.issue({ kind: "nope", payload: {} });
    expect(result).toEqual({ status: "rejected", reason: 'Unknown order kind "nope".' });
  });

  test("generates deterministic ids when omitted", () => {
    const queue = createOrderQueue(registry());
    const a = queue.issue<CountPayload>({ kind: "count", payload: { ticks: 1 }, policy: "append" });
    const b = queue.issue<CountPayload>({ kind: "count", payload: { ticks: 1 }, policy: "append" });
    expect(a.status === "accepted" && a.order.id).toBe("order-1");
    expect(b.status === "queued" && b.order.id).toBe("order-2");
  });
});

describe("queue policies and preemption", () => {
  test("append runs orders in order", () => {
    const queue = createOrderQueue(registry());
    const c = ctx();
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 1 }, id: "a", policy: "append" });
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 1 }, id: "b", policy: "append" });
    expect(queue.pending().map((o) => o.id)).toEqual(["a", "b"]);

    const first = queue.tick(c, 1);
    expect(first.completed).toEqual(["a"]);
    expect(first.activated).toEqual(["a", "b"]); // completing 'a' activates 'b' same tick
    const second = queue.tick(c, 1);
    expect(second.completed).toEqual(["b"]);
  });

  test("replace preempts the active order and clears pending", () => {
    const events: OrderEvent[] = [];
    const queue = createOrderQueue(registry(), { onEvent: (e) => events.push(e) });
    const c = ctx();
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 5 }, id: "a" });
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 5 }, id: "queued", policy: "append" });
    queue.tick(c, 1); // 'a' active

    const result = queue.issue<CountPayload>({ kind: "count", payload: { ticks: 1 }, id: "b" });
    expect(result.status).toBe("accepted");
    // 'a' canceled(replaced), 'queued' canceled(replaced), 'b' pending
    const canceled = events.filter((e) => e.type === "canceled");
    expect(canceled.map((e) => e.orderId).sort()).toEqual(["a", "queued"]);
    expect(canceled.every((e) => e.reason === "replaced")).toBe(true);
    expect(queue.pending().map((o) => o.id)).toEqual(["b"]);

    const report = queue.tick(c, 1);
    expect(report.completed).toEqual(["b"]);
  });

  test("front inserts ahead without canceling the active order", () => {
    const queue = createOrderQueue(registry());
    const c = ctx();
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 3 }, id: "a" });
    queue.tick(c, 1); // 'a' active
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 1 }, id: "b", policy: "append" });
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 1 }, id: "c", policy: "front" });
    expect(queue.active()?.id).toBe("a");
    expect(queue.pending().map((o) => o.id)).toEqual(["c", "b"]);
  });

  test("reject refuses while the queue is busy", () => {
    const queue = createOrderQueue(registry());
    const c = ctx();
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 3 }, id: "a" });
    queue.tick(c, 1);
    const result = queue.issue<CountPayload>({ kind: "count", payload: { ticks: 1 }, policy: "reject" });
    expect(result.status).toBe("rejected");
  });

  test("uninterruptible active order defers a replacing order", () => {
    const queue = createOrderQueue(registry());
    const c = ctx();
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 2 }, id: "a", uninterruptible: true });
    queue.tick(c, 1); // 'a' active, elapsed 1

    const result = queue.issue<CountPayload>({ kind: "count", payload: { ticks: 1 }, id: "b" });
    expect(result.status).toBe("queued"); // 'a' protected, 'b' waits
    expect(queue.active()?.id).toBe("a");
    expect(queue.pending().map((o) => o.id)).toEqual(["b"]);

    queue.tick(c, 1); // 'a' completes
    expect(queue.active()?.id).toBe("b");
  });
});

describe("cancellation", () => {
  test("cancelActive force-cancels even an uninterruptible order", () => {
    const queue = createOrderQueue(registry());
    const c = ctx();
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 9 }, id: "a", uninterruptible: true });
    queue.tick(c, 1);
    queue.cancelActive(c, "requested");
    expect(queue.isIdle()).toBe(true);
    expect(queue.active()).toBeNull();
    expect(c.finished).toEqual(["a"]); // finish ran
  });

  test("cancelAll clears active and pending", () => {
    const queue = createOrderQueue(registry());
    const c = ctx();
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 9 }, id: "a" });
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 9 }, id: "b", policy: "append" });
    queue.tick(c, 1);
    queue.cancelAll(c);
    expect(queue.isIdle()).toBe(true);
  });

  test("clear cancels everything with reason cleared", () => {
    const events: OrderEvent[] = [];
    const queue = createOrderQueue(registry(), { onEvent: (e) => events.push(e) });
    const c = ctx();
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 9 }, id: "a" });
    queue.tick(c, 1);
    queue.clear(c);
    expect(events.at(-1)).toMatchObject({ type: "canceled", orderId: "a", reason: "cleared" });
  });
});

describe("serialization", () => {
  test("round-trips mid-flight state and resumes identically", () => {
    const reg = registry();
    const c = ctx();
    const queue = createOrderQueue(reg);
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 3 }, id: "a" });
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 2 }, id: "b", policy: "append" });
    queue.tick(c, 1); // 'a' active, elapsed 1

    const snapshot: OrderQueueState<CountPayload> = JSON.parse(JSON.stringify(queue.serialize()));
    expect(snapshot.active?.id).toBe("a");
    expect((snapshot.active?.state as { elapsed: number }).elapsed).toBe(1);
    expect(snapshot.pending.map((o) => o.id)).toEqual(["b"]);

    const restored = createOrderQueue<TestCtx, CountPayload>(reg, { initial: snapshot });
    const c2 = ctx();
    restored.tick(c2, 1); // elapsed 2, still running
    const done = restored.tick(c2, 1); // elapsed 3 -> completes 'a', activates 'b' same tick
    expect(done.completed).toEqual(["a"]);
    expect(done.activated).toEqual(["b"]);
    expect(restored.active()?.id).toBe("b");
  });

  test("serialize returns an independent copy", () => {
    const queue = createOrderQueue(registry());
    const c = ctx();
    queue.issue<CountPayload>({ kind: "count", payload: { ticks: 5 }, id: "a" });
    queue.tick(c, 1);
    const snap = queue.serialize();
    queue.tick(c, 1); // mutate live state
    expect((snap.active?.state as { elapsed: number }).elapsed).toBe(1); // snapshot unchanged
  });
});
