import { describe, expect, test } from "bun:test";
import { createFreezeMonitor, type FreezeSubject } from "@jgengine/core/sensor/freezeMonitor";

describe("createFreezeMonitor", () => {
  test("reports an immediate violation with zero grace", () => {
    const monitor = createFreezeMonitor();
    const subjects: FreezeSubject[] = [{ id: "p1", groundSpeed: 2 }];
    const violations = monitor.tick(subjects, new Set(["p1"]), 0.1);
    expect(violations).toEqual([{ id: "p1", speed: 2, movedSeconds: 0.1 }]);
  });

  test("speeds at or below tolerance never violate", () => {
    const monitor = createFreezeMonitor();
    const subjects: FreezeSubject[] = [{ id: "p1", groundSpeed: 0.05 }];
    expect(monitor.tick(subjects, new Set(["p1"]), 1)).toEqual([]);
  });

  test("a grace period suppresses brief jitters", () => {
    const monitor = createFreezeMonitor({ graceSeconds: 0.5 });
    const subjects: FreezeSubject[] = [{ id: "p1", groundSpeed: 1 }];
    const frozen = new Set(["p1"]);
    expect(monitor.tick(subjects, frozen, 0.2)).toEqual([]);
    expect(monitor.tick(subjects, frozen, 0.2)).toEqual([]);
    const third = monitor.tick(subjects, frozen, 0.2);
    expect(third).toHaveLength(1);
    expect(third[0]!.id).toBe("p1");
    expect(third[0]!.speed).toBe(1);
    expect(third[0]!.movedSeconds).toBeCloseTo(0.6, 10);
  });

  test("unfreezing resets the accumulator", () => {
    const monitor = createFreezeMonitor({ graceSeconds: 1 });
    const moving: FreezeSubject[] = [{ id: "p1", groundSpeed: 1 }];
    monitor.tick(moving, new Set(["p1"]), 0.9);
    monitor.tick(moving, new Set(), 5);
    const after = monitor.tick(moving, new Set(["p1"]), 0.9);
    expect(after).toEqual([]);
  });

  test("dropping below tolerance speed resets the accumulator", () => {
    const monitor = createFreezeMonitor({ graceSeconds: 1 });
    const frozen = new Set(["p1"]);
    monitor.tick([{ id: "p1", groundSpeed: 1 }], frozen, 0.9);
    monitor.tick([{ id: "p1", groundSpeed: 0 }], frozen, 5);
    const after = monitor.tick([{ id: "p1", groundSpeed: 1 }], frozen, 0.9);
    expect(after).toEqual([]);
  });

  test("tracks each id independently", () => {
    const monitor = createFreezeMonitor({ graceSeconds: 0.5 });
    const frozen = new Set(["a", "b"]);
    monitor.tick([{ id: "a", groundSpeed: 1 }, { id: "b", groundSpeed: 1 }], frozen, 0.3);
    const second = monitor.tick([{ id: "a", groundSpeed: 0 }, { id: "b", groundSpeed: 1 }], frozen, 0.3);
    expect(second).toEqual([{ id: "b", speed: 1, movedSeconds: 0.6 }]);
  });

  test("reset clears the accumulator for one id or all", () => {
    const monitor = createFreezeMonitor({ graceSeconds: 1 });
    const frozen = new Set(["p1"]);
    monitor.tick([{ id: "p1", groundSpeed: 1 }], frozen, 0.9);
    monitor.reset("p1");
    const after = monitor.tick([{ id: "p1", groundSpeed: 1 }], frozen, 0.9);
    expect(after).toEqual([]);
  });
});

describe("freeze monitor snapshot", () => {
  test("snapshot and restore replay bit-exactly", () => {
    const monitor = createFreezeMonitor({ graceSeconds: 0.3 });
    const frozen = new Set(["a", "b"]);
    const subjects = [{ id: "a", groundSpeed: 2 }, { id: "b", groundSpeed: 0.5 }, { id: "c", groundSpeed: 3 }];
    monitor.tick(subjects, frozen, 0.2);
    const saved = monitor.snapshot();
    const copy = JSON.parse(JSON.stringify(saved));
    const play = () => [monitor.tick(subjects, frozen, 0.2), monitor.tick(subjects.slice(1), frozen, 0.2)];
    const a = play();
    expect(saved).toEqual(copy);
    monitor.restore(saved);
    expect(play()).toEqual(a);
  });
});
