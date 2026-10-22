import { describe, expect, test } from "bun:test";

import { createLogBus, LOG_BUS_CAPACITY } from "./logBus";

/**
 * The log bus is what makes a report trustworthy after a failure: it must stay
 * bounded under flood, keep an error that arrived before hundreds of info lines,
 * and reuse its slots instead of growing.
 */
describe("log bus", () => {
  test("keeps the newest lines in order and reports evictions instead of growing", () => {
    const bus = createLogBus({ capacity: 4, severeCapacity: 2 });
    for (let index = 0; index < 10; index += 1) bus.write("info", "nav", `line ${index}`);
    const entries = bus.list();
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.message)).toEqual(["line 6", "line 7", "line 8", "line 9"]);
    expect(bus.dropped()).toBe(6);
    expect(bus.counts()).toEqual({ log: 0, info: 10, warn: 0, error: 0 });
    expect(entries[0]!.system).toBe("nav");
  });

  test("a warning or error survives a flood of info lines", () => {
    const bus = createLogBus({ capacity: 4, severeCapacity: 2 });
    bus.write("warn", "needs", "hunger drained without a bed");
    bus.write("error", "nav", "no path to target");
    for (let index = 0; index < 50; index += 1) bus.write("log", "render", `frame ${index}`);
    expect(bus.list().some((entry) => entry.message === "no path to target")).toBe(false);
    expect(bus.severe().map((entry) => `${entry.level}:${entry.system}:${entry.message}`)).toEqual([
      "warn:needs:hunger drained without a bed",
      "error:nav:no path to target",
    ]);
  });

  test("truncates a long message once, at write time", () => {
    const bus = createLogBus({ capacity: 2, severeCapacity: 2 });
    bus.write("error", "runtime", "x".repeat(2_000));
    const [entry] = bus.severe();
    expect(entry!.message).toHaveLength(401);
    expect(entry!.message.endsWith("…")).toBe(true);
  });

  test("snapshot carries entries, severe ring, counts and capacity as plain JSON", () => {
    const bus = createLogBus({ capacity: 8, severeCapacity: 3, now: () => 1_000 });
    bus.write("error", "runtime", "webgl context lost");
    const snapshot = bus.snapshot();
    expect(snapshot.capacity).toBe(8);
    expect(snapshot.counts.error).toBe(1);
    expect(snapshot.entries[0]!.at).toBe(1_000);
    expect(JSON.parse(JSON.stringify(snapshot)).severe[0].message).toBe("webgl context lost");
  });

  test("reset empties every ring and counter but keeps the ring allocated", () => {
    const bus = createLogBus({ capacity: 4, severeCapacity: 2 });
    bus.write("error", "runtime", "boom");
    bus.reset();
    expect(bus.list()).toHaveLength(0);
    expect(bus.severe()).toHaveLength(0);
    expect(bus.dropped()).toBe(0);
    expect(bus.counts()).toEqual({ log: 0, info: 0, warn: 0, error: 0 });
    bus.write("info", "nav", "after reset");
    expect(bus.list().map((entry) => entry.message)).toEqual(["after reset"]);
  });

  test("default capacity is the documented window, not unbounded", () => {
    const bus = createLogBus();
    for (let index = 0; index < LOG_BUS_CAPACITY + 25; index += 1) bus.write("log", "console", `entry ${index}`);
    expect(bus.list()).toHaveLength(LOG_BUS_CAPACITY);
    expect(bus.dropped()).toBe(25);
  });
});
