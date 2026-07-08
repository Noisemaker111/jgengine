import { describe, expect, test } from "bun:test";

import { createDataSource, type DataSourceClock, type DataSourceState } from "./dataSource";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function manualClock(): DataSourceClock & { fire(handle: unknown): void; handles(): unknown[] } {
  const handlers = new Map<number, () => void>();
  let nextId = 1;
  const cleared = new Set<number>();
  return {
    setInterval(handler) {
      const id = nextId++;
      handlers.set(id, handler);
      return id;
    },
    clearInterval(handle) {
      cleared.add(handle as number);
      handlers.delete(handle as number);
    },
    fire(handle) {
      handlers.get(handle as number)?.();
    },
    handles() {
      return Array.from(handlers.keys());
    },
  };
}

describe("createDataSource", () => {
  test("starts idle and transitions through loading to ready", async () => {
    const source = createDataSource<number>(async () => 42);
    expect(source.getState()).toEqual({ status: "idle", data: undefined, error: undefined });

    const seen: DataSourceState<number>["status"][] = [];
    source.subscribe((state) => seen.push(state.status));

    await source.refresh();

    expect(seen).toEqual(["loading", "ready"]);
    expect(source.getState()).toEqual({ status: "ready", data: 42, error: undefined });
  });

  test("non-2xx style rejection surfaces as error status and keeps previous data", async () => {
    let callCount = 0;
    const source = createDataSource<string>(async () => {
      callCount += 1;
      if (callCount === 1) return "first";
      throw new Error("HTTP 500 Internal Server Error");
    });

    await source.refresh();
    expect(source.getState().status).toBe("ready");

    await source.refresh({ force: true });

    const state = source.getState();
    expect(state.status).toBe("error");
    expect(state.data).toBe("first");
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error?.message).toBe("HTTP 500 Internal Server Error");
  });

  test("refresh dedupes concurrent calls into a single load invocation", async () => {
    let callCount = 0;
    const gate = deferred<void>();
    const source = createDataSource<number>(async () => {
      callCount += 1;
      await gate.promise;
      return 7;
    });

    const first = source.refresh();
    const second = source.refresh();
    expect(first).toBe(second);
    expect(callCount).toBe(1);

    gate.resolve();
    await first;

    expect(callCount).toBe(1);
    expect(source.getState()).toEqual({ status: "ready", data: 7, error: undefined });
  });

  test("force refresh aborts the stale in-flight load before starting a new one", async () => {
    const signals: AbortSignal[] = [];
    const gates = [deferred<number>(), deferred<number>()];
    let callIndex = -1;
    const source = createDataSource<number>(async (signal) => {
      callIndex += 1;
      signals.push(signal);
      return gates[callIndex]!.promise;
    });

    const staleRefresh = source.refresh();
    expect(signals[0]!.aborted).toBe(false);

    const freshRefresh = source.refresh({ force: true });
    expect(signals[0]!.aborted).toBe(true);
    expect(freshRefresh).not.toBe(staleRefresh);

    gates[0]!.resolve(-1);
    gates[1]!.resolve(99);
    await Promise.all([staleRefresh, freshRefresh]);

    expect(source.getState()).toEqual({ status: "ready", data: 99, error: undefined });
  });

  test("subscribe notifies on every transition and stops after unsubscribe", async () => {
    const source = createDataSource<number>(async () => 1);
    const events: string[] = [];
    const unsubscribe = source.subscribe((state) => events.push(state.status));

    await source.refresh();
    unsubscribe();
    await source.refresh({ force: true });

    expect(events).toEqual(["loading", "ready"]);
  });

  test("startPolling loads immediately and again on every clock tick; stopPolling ends it", async () => {
    const clock = manualClock();
    let callCount = 0;
    const source = createDataSource<number>(
      async () => {
        callCount += 1;
        return callCount;
      },
      { clock },
    );

    source.startPolling(1000);
    expect(clock.handles().length).toBe(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);

    const handle = clock.handles()[0]!;
    clock.fire(handle);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(2);

    source.stopPolling();
    expect(clock.handles().length).toBe(0);
    clock.fire(handle);
    await Promise.resolve();
    expect(callCount).toBe(2);
  });

  test("startPolling without an intervalMs anywhere throws", () => {
    const source = createDataSource<number>(async () => 1);
    expect(() => source.startPolling()).toThrow();
  });

  test("creating with options.intervalMs starts polling immediately", async () => {
    const clock = manualClock();
    let callCount = 0;
    createDataSource<number>(
      async () => {
        callCount += 1;
        return callCount;
      },
      { intervalMs: 500, clock },
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
    expect(clock.handles().length).toBe(1);
  });

  test("dispose stops polling, aborts in-flight work, and clears listeners", async () => {
    const clock = manualClock();
    const gate = deferred<number>();
    let signal: AbortSignal | undefined;
    const source = createDataSource<number>(
      async (abortSignal) => {
        signal = abortSignal;
        return gate.promise;
      },
      { intervalMs: 100, clock },
    );

    let notifications = 0;
    source.subscribe(() => {
      notifications += 1;
    });

    source.dispose();

    expect(clock.handles().length).toBe(0);
    expect(signal?.aborted).toBe(true);

    await source.refresh();
    expect(notifications).toBe(0);
    expect(source.getState().status).toBe("loading");
  });
});
