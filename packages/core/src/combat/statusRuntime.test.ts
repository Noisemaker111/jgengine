import { describe, expect, it } from "bun:test";
import { devtools } from "../devtools/devtools";
import {
  createStatusRuntime,
  UnknownStatusError,
  type StatusDamageTick,
  type StatusDef,
} from "./statusRuntime";

const statuses: StatusDef[] = [
  { id: "burn", stack: { kind: "stack", max: 3 }, durationMs: 3_000, intervalMs: 500, magnitude: 4, effect: { kind: "damage", channel: "fire" } },
  { id: "shock", stack: { kind: "refresh" }, durationMs: 2_000, intervalMs: 250, magnitude: 3, effect: { kind: "damage", channel: "shock" } },
  { id: "slow", stack: { kind: "ignore" }, durationMs: 2_500, intervalMs: 500, magnitude: -0.2, effect: { kind: "stat", stat: "moveSpeed" } },
  { id: "corrode", stack: { kind: "stack", max: 5 }, durationMs: 4_000, intervalMs: 1_000, magnitude: -40, effect: { kind: "stat", stat: "armor" } },
];

function runtime(options?: { applyDamage?: (tick: StatusDamageTick) => number; maxTicksPerCall?: number; devtoolsName?: string }) {
  return createStatusRuntime({ statuses, rng: () => 0, ...options });
}

describe("status stacking", () => {
  it("stacks two burns to two stacks and deals two magnitudes, not four", () => {
    const status = runtime();
    status.apply("raider", "burn");
    status.apply("raider", "burn");
    expect(status.statusesOf("raider")[0]?.stacks).toBe(2);
    const events = status.tick(0.5);
    const damage = events.filter((event) => event.kind === "damage");
    expect(damage.length).toBe(1);
    expect(damage[0]?.kind === "damage" ? damage[0].amount : 0).toBe(8);
  });

  it("stops at the declared stack ceiling", () => {
    const status = runtime();
    status.apply("raider", "burn");
    status.apply("raider", "burn");
    status.apply("raider", "burn");
    status.apply("raider", "burn");
    expect(status.statusesOf("raider")[0]?.stacks).toBe(3);
    const damage = status.tick(0.5).filter((event) => event.kind === "damage");
    expect(damage[0]?.kind === "damage" ? damage[0].amount : 0).toBe(12);
  });

  it("refreshes a refresh status without adding stacks", () => {
    const status = runtime();
    status.apply("raider", "shock");
    status.tick(1);
    status.apply("raider", "shock");
    const instance = status.statusesOf("raider")[0];
    expect(instance?.stacks).toBe(1);
    expect(instance?.remainingMs).toBe(2_000);
  });

  it("leaves an ignore status untouched on a second application", () => {
    const status = runtime();
    status.apply("raider", "slow", { source: "first" });
    status.tick(1);
    const before = status.statusesOf("raider")[0];
    status.apply("raider", "slow", { source: "second" });
    const after = status.statusesOf("raider")[0];
    expect(after?.remainingMs).toBe(before?.remainingMs ?? 0);
    expect(after?.source).toBe("first");
  });

  it("replaces duration and stacks for a replace status", () => {
    const status = createStatusRuntime({
      statuses: [{ id: "mark", stack: { kind: "replace" }, durationMs: 1_000, intervalMs: 500, magnitude: 1, effect: { kind: "damage", channel: "void" } }],
      rng: () => 0,
    });
    status.apply("raider", "mark");
    status.apply("raider", "mark");
    expect(status.statusesOf("raider")[0]?.stacks).toBe(1);
  });

  it("never adds stacks beyond one without a stack rule", () => {
    const status = runtime();
    status.apply("raider", "shock");
    status.apply("raider", "shock");
    status.apply("raider", "shock");
    expect(status.statusesOf("raider")[0]?.stacks).toBe(1);
  });
});

describe("status ticks", () => {
  it("applies stat ticks per stack while the status lives", () => {
    const status = runtime();
    status.apply("raider", "corrode");
    status.apply("raider", "corrode");
    expect(status.statDelta("raider", "armor")).toBe(-80);
    status.apply("raider", "slow");
    expect(status.statDelta("raider", "moveSpeed")).toBeCloseTo(-0.2, 10);
    status.clear("raider", "corrode");
    expect(status.statDelta("raider", "armor")).toBe(0);
  });

  it("routes a damage tick through the caller's pipeline", () => {
    const status = runtime({ applyDamage: (tick) => tick.amount * 2 });
    status.apply("raider", "burn");
    const damage = status.tick(0.5).filter((event) => event.kind === "damage");
    expect(damage[0]?.kind === "damage" ? damage[0].amount : 0).toBe(4);
    expect(damage[0]?.kind === "damage" ? damage[0].dealt : 0).toBe(8);
  });

  it("emits an expiry event and stops contributing", () => {
    const status = runtime();
    status.apply("raider", "burn");
    const events = status.tick(3.5);
    expect(events.filter((event) => event.kind === "damage").length).toBe(6);
    expect(events.at(-1)?.kind).toBe("expired");
    expect(status.statusesOf("raider").length).toBe(0);
  });

  it("restarts the tick clock on reapplication instead of banking instant ticks", () => {
    const status = runtime();
    status.apply("raider", "burn");
    expect(status.tick(0.4).filter((event) => event.kind === "damage").length).toBe(0);
    status.apply("raider", "burn");
    expect(status.tick(0.4).filter((event) => event.kind === "damage").length).toBe(0);
    expect(status.tick(0.2).filter((event) => event.kind === "damage").length).toBe(1);
  });

  it("bounds ticks per call and carries the rest to the next call", () => {
    const status = createStatusRuntime({
      statuses: [{ id: "ticks", stack: { kind: "refresh" }, durationMs: 10_000, intervalMs: 100, magnitude: 1, effect: { kind: "damage", channel: "void" } }],
      rng: () => 0,
      maxTicksPerCall: 4,
    });
    status.apply("raider", "ticks");
    expect(status.tick(1.0).filter((event) => event.kind === "damage").length).toBe(4);
    expect(status.tick(0.1).filter((event) => event.kind === "damage").length).toBe(4);
  });

  it("rejects an unknown status id", () => {
    expect(() => runtime().apply("raider", "plasma")).toThrow(UnknownStatusError);
  });
});

describe("state out and back", () => {
  it("continues identically after snapshot and restore", () => {
    const status = runtime();
    status.apply("raider", "burn");
    status.apply("raider", "burn");
    status.apply("raider", "corrode");
    status.tick(0.6);
    const saved = status.snapshot();
    const ahead = status.tick(1.0);
    status.restore(saved);
    const replayed = status.tick(1.0);
    expect(replayed).toEqual(ahead);
  });

  it("reports the carried state as plain data", () => {
    const status = runtime();
    status.apply("raider", "corrode");
    const saved = status.snapshot();
    expect(saved.targets[0]?.id).toBe("raider");
    expect(saved.targets[0]?.entries[0]?.instance.status).toBe("corrode");
    expect(saved.targets[0]?.entries[0]?.untilTickMs).toBe(1_000);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });

  it("exposes counters and a devtools probe line", () => {
    const status = runtime({ devtoolsName: "combat/status-test" });
    status.apply("raider", "burn");
    status.tick(0.5);
    const line = devtools.snapshot().probes["combat/status-test"];
    expect(typeof line).toBe("string");
    expect(String(line)).toContain("1 targets 1 statuses");
    expect(String(line)).toContain("1 applied");
    status.dispose();
  });
});
