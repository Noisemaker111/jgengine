import { describe, expect, test } from "bun:test";

import { createPerception } from "../sensor/perception";
import type { ThresholdBoundary } from "../threshold/thresholds";
import {
  alertSearchArea,
  createAlertLevel,
  type AlertLevel,
  type AlertSighting,
  type AlertStep,
  type AlertTuning,
  type AlertWitness,
} from "./alertLevel";

const TIERS: readonly ThresholdBoundary<string>[] = [
  { at: 20, id: "watch" },
  { at: 60, id: "chase" },
  { at: 120, id: "cordon" },
];

const TUNING: AlertTuning<string> = {
  tiers: TIERS,
  decayPerSecond: 10,
  decayDelaySeconds: 0,
  escapeSeconds: 6,
  sightGraceSeconds: 0.25,
  standDownSeconds: 6,
  hiddenRate: 3,
};

/** A stand-in sight seam: observers remember whatever a test tells them to. */
function looking() {
  const memories = new Map<string, AlertSighting>();
  let tick = 0;
  const witness: AlertWitness = { memoryOf: (observerId) => memories.get(observerId) ?? null };
  return {
    witness,
    /** Record that `observerId` holds the target at `[x, z]` on `nowMs`. */
    see(observerId: string, nowMs: number, x = 0, z = 0): void {
      tick += 1;
      memories.set(observerId, {
        lastKnownPos: [x, 0, z],
        lastSeenAt: nowMs,
        confidence: 1,
        sourceId: observerId,
        sourceTick: tick,
      });
    },
  };
}

type Seam = { witness: AlertWitness };

function alert(sight: Seam, tuning: Partial<AlertTuning<string>> = {}): AlertLevel<string> {
  return createAlertLevel<string>({
    witness: sight.witness,
    observers: () => ["eye"],
    targetId: "target",
    tuning: { ...TUNING, ...tuning },
  });
}

/** One tick with the target seen and `amount` reported just before it. */
function seenTick(
  sight: ReturnType<typeof looking>,
  level: AlertLevel<string>,
  nowMs: number,
  amount = 0,
  x = 0,
  z = 0,
): AlertStep<string> {
  sight.see("eye", nowMs, x, z);
  if (amount > 0) level.report(amount);
  return level.tick(1 / 60, { nowMs, activeUnits: 0 });
}

describe("alertLevel value", () => {
  test("a report nobody sees raises no value and leaves no tier", () => {
    const sight = looking();
    const level = alert(sight);

    level.report(80);
    const step = level.tick(1 / 60, { nowMs: 0, activeUnits: 0 });

    expect(step.value).toBe(0);
    expect(step.tier).toBeNull();
    expect(step.anchor).toBeNull();
    expect(step.escaped).toBe(false);
    expect(level.stats().seen).toBe(0);
    expect(level.stats().reported).toBe(1);
  });

  test("a seen report raises the value, resolves its tier and anchors on the sighting", () => {
    const sight = looking();
    const level = alert(sight);

    const step = seenTick(sight, level, 0, 30, 10, 0);

    expect(step.value).toBe(30);
    expect(step.tier).toBe("watch");
    expect(step.tierChanged).toBe(true);
    expect(step.anchor).not.toBeNull();
    expect(step.anchor?.at).toEqual([10, 0]);
    expect(step.anchor?.lastSeenAt).toBe(0);
    expect(step.anchor?.sourceId).toBe("eye");
    expect(step.anchor?.sourceTick).toBe(1);
    expect(level.stats().seen).toBe(1);
  });

  test("a report made out of sight while the alert is up adds nothing", () => {
    const sight = looking();
    const level = alert(sight);
    seenTick(sight, level, 0, 80);

    level.report(200);
    const step = level.tick(1 / 60, { nowMs: 5_000, activeUnits: 1 });

    expect(step.value).toBe(80);
    expect(level.stats().seen).toBe(1);
    expect(level.stats().reported).toBe(2);
  });

  test("the anchor follows each new sighting and keeps whose eyes it was", () => {
    const sight = looking();
    const level = alert(sight);
    seenTick(sight, level, 0, 80, 10, 0);

    const step = seenTick(sight, level, 500, 0, 30, 20);

    expect(step.anchor?.at).toEqual([30, 20]);
    expect(step.anchor?.lastSeenAt).toBe(500);
    expect(step.anchor?.sourceTick).toBe(2);
    expect(level.stats().sightings).toBe(2);
  });

  test("the value is capped at maxValue", () => {
    const sight = looking();
    const level = alert(sight, { maxValue: 100 });

    const step = seenTick(sight, level, 0, 500);

    expect(step.value).toBe(100);
  });

  test("bad numbers are refused", () => {
    const sight = looking();
    const level = alert(sight);

    expect(() => level.report(0)).toThrow();
    expect(() => level.report(-5)).toThrow();
    expect(() => level.tick(-1, { nowMs: 0, activeUnits: 0 })).toThrow();
    expect(() => level.tick(1, { nowMs: Number.NaN, activeUnits: 0 })).toThrow();
  });
});

describe("alertLevel sight clock", () => {
  test("standing in view keeps the value and never starts the out-of-sight clock", () => {
    const sight = looking();
    const level = alert(sight);
    seenTick(sight, level, 0, 80);

    let step: AlertStep<string> | null = null;
    for (let i = 1; i <= 60; i += 1) {
      step = seenTick(sight, level, i * 50, 0, 30, 20);
      expect(step.outOfSightSeconds).toBe(0);
      expect(step.escaped).toBe(false);
      expect(step.value).toBe(80);
    }
    expect(step?.anchor?.at).toEqual([30, 20]);
  });

  test("leaving view for escapeSeconds starts the bleeding, and only then", () => {
    const sight = looking();
    const level = alert(sight);
    seenTick(sight, level, 0, 80);

    const ctx = (nowMs: number) => ({ nowMs, activeUnits: 1 });
    let step = level.tick(0.1, ctx(100));
    for (let i = 2; i <= 20; i += 1) step = level.tick(0.1, ctx(i * 100));
    expect(step.escaped).toBe(false);
    expect(step.value).toBe(80);

    for (let i = 21; i <= 100; i += 1) step = level.tick(0.1, ctx(i * 100));
    expect(step.escaped).toBe(true);
    expect(step.outOfSightSeconds).toBeGreaterThanOrEqual(TUNING.escapeSeconds);
    expect(step.value).toBeLessThan(80);
    expect(level.stats().escapes).toBe(1);
  });

  test("a delay after the last gain holds the value before it bleeds", () => {
    const sight = looking();
    const level = alert(sight, { decayDelaySeconds: 2, decayPerSecond: 4, escapeSeconds: 1 });
    seenTick(sight, level, 0, 100);

    let step = level.tick(1, { nowMs: 1_000, activeUnits: 0 });
    expect(step.escaped).toBe(true);
    expect(step.value).toBe(100);

    step = level.tick(0.5, { nowMs: 1_500, activeUnits: 0 });
    expect(step.value).toBe(100);

    step = level.tick(0.5, { nowMs: 2_000, activeUnits: 0 });
    expect(step.value).toBe(98);
  });

  test("the value bleeds at decayPerSecond until nothing is left", () => {
    const sight = looking();
    const level = alert(sight, { decayPerSecond: 4, escapeSeconds: 1 });
    seenTick(sight, level, 0, 100);

    let step = level.tick(1, { nowMs: 1_000, activeUnits: 0 });
    expect(step.value).toBe(96);
    step = level.tick(1, { nowMs: 2_000, activeUnits: 0 });
    expect(step.value).toBe(92);

    for (let i = 3; i <= 40; i += 1) step = level.tick(1, { nowMs: i * 1_000, activeUnits: 0 });
    expect(step.value).toBe(0);
    expect(step.tier).toBeNull();
    expect(step.anchor).not.toBeNull();
    expect(step.escaped).toBe(true);
  });

  test("being seen again clears the escape and raises the value once more", () => {
    const sight = looking();
    const level = alert(sight);
    seenTick(sight, level, 0, 80);
    const ctx = (nowMs: number) => ({ nowMs, activeUnits: 1 });
    let cold = level.tick(0.1, ctx(100));
    for (let i = 2; i <= 100; i += 1) cold = level.tick(0.1, ctx(i * 100));
    expect(cold.escaped).toBe(true);

    const step = seenTick(sight, level, 10_100, 30, 12, 0);

    expect(step.escaped).toBe(false);
    expect(step.outOfSightSeconds).toBe(0);
    expect(step.value).toBeGreaterThan(cold.value);
  });

  test("hiding ignores sightings and runs the cold trail hiddenRate times faster", () => {
    const sight = looking();
    const open = alert(sight, { escapeSeconds: 6 });
    const hid = alert(sight, { escapeSeconds: 6, hiddenRate: 3 });
    seenTick(sight, open, 0, 120);
    seenTick(sight, hid, 0, 120);

    let openStep: AlertStep<string> | null = null;
    let hidStep: AlertStep<string> | null = null;
    for (let i = 1; i <= 150; i += 1) {
      const nowMs = i * (1000 / 60);
      sight.see("eye", nowMs);
      openStep = open.tick(1 / 60, { nowMs, activeUnits: 0 });
      hidStep = hid.tick(1 / 60, { nowMs, activeUnits: 0, hidden: true });
    }
    expect(openStep?.outOfSightSeconds).toBe(0);
    expect(openStep?.value).toBe(120);
    expect(hidStep?.escaped).toBe(true);
    expect(hidStep?.outOfSightSeconds).toBeCloseTo(7.5, 5);
    expect(hidStep?.value).toBeLessThan(120);
  });

  test("a report made while hidden goes unseen", () => {
    const sight = looking();
    const level = alert(sight);
    sight.see("eye", 0);
    level.report(80);
    const step = level.tick(1 / 60, { nowMs: 0, activeUnits: 0, hidden: true });

    expect(step.value).toBe(0);
    expect(level.stats().seen).toBe(0);
  });
});

describe("alertLevel tiers", () => {
  test("the value walks its cut points up and down", () => {
    const sight = looking();
    const level = alert(sight);

    const low = seenTick(sight, level, 0, 30, 5, 5);
    expect(low.tier).toBe("watch");
    expect(low.crossings.map((crossing) => crossing.id)).toEqual(["watch"]);

    const high = seenTick(sight, level, 100, 70, 5, 5);
    expect(high.tier).toBe("chase");
    expect(high.tierChanged).toBe(true);
    expect(high.crossings.map((crossing) => crossing.id)).toEqual(["chase"]);

    const top = seenTick(sight, level, 200, 60, 5, 5);
    expect(top.value).toBe(160);
    expect(top.tier).toBe("cordon");
    expect(top.crossings.map((crossing) => crossing.id)).toEqual(["cordon"]);
  });

  test("a fall reports its crossings from the top down", () => {
    const sight = looking();
    const level = alert(sight, { decayPerSecond: 100, escapeSeconds: 1 });
    seenTick(sight, level, 0, 130);

    const step = level.tick(1, { nowMs: 1_000, activeUnits: 0 });

    expect(step.value).toBe(30);
    expect(step.tier).toBe("watch");
    expect(step.crossings.map((crossing) => crossing.direction)).toEqual(["down", "down"]);
    expect(step.crossings.map((crossing) => crossing.id)).toEqual(["cordon", "chase"]);
  });

  test("the stand-down beat fires once the units have lingered with no tier", () => {
    const sight = looking();
    const level = alert(sight, { standDownSeconds: 2 });

    let step = level.tick(1, { nowMs: 1_000, activeUnits: 3 });
    expect(step.standDown).toBe(false);
    step = level.tick(1, { nowMs: 2_000, activeUnits: 3 });
    expect(step.standDown).toBe(true);
    step = level.tick(1, { nowMs: 3_000, activeUnits: 3 });
    expect(step.standDown).toBe(false);
    step = level.tick(1, { nowMs: 4_000, activeUnits: 0 });
    expect(step.standDown).toBe(false);
  });

  test("a higher tier stops the stand-down beat", () => {
    const sight = looking();
    const level = alert(sight, { standDownSeconds: 2 });

    level.tick(1, { nowMs: 1_000, activeUnits: 3 });
    const seen = seenTick(sight, level, 2_000, 30);

    expect(seen.standDown).toBe(false);
    expect(seen.tier).toBe("watch");
  });

  test("forgive takes value off at once, never below zero, and the tier follows", () => {
    const sight = looking();
    const level = alert(sight);
    seenTick(sight, level, 0, 150);
    expect(level.current().tier).toBe("cordon");

    expect(level.forgive(100)).toBe(50);
    expect(level.current()).toEqual({ value: 50, tier: "watch" });
    expect(level.forgive(500)).toBe(0);
    expect(level.current().tier).toBeNull();
    expect(() => level.forgive(-1)).toThrow();
  });

  test("retune changes the ladder and the curve without losing the value", () => {
    const sight = looking();
    const level = alert(sight);
    seenTick(sight, level, 0, 80);

    level.retune({
      tiers: [{ at: 40, id: "alone" }],
      decayPerSecond: 1,
      escapeSeconds: 1,
    });
    const first = level.tick(0.1, { nowMs: 100, activeUnits: 0 });
    expect(first.value).toBe(80);
    expect(first.tier).toBe("alone");

    let step = first;
    for (let i = 2; i <= 30; i += 1) step = level.tick(0.1, { nowMs: i * 100, activeUnits: 0 });
    expect(step.escaped).toBe(true);
    expect(step.value).toBeLessThan(80);
    expect(step.value).toBeGreaterThan(70);
  });

  test("a ladder that does not ascend is refused", () => {
    const sight = looking();
    const level = alert(sight);
    expect(() => level.retune({ tiers: [{ at: 40, id: "a" }, { at: 40, id: "b" }] })).toThrow();
    expect(() => level.retune({ tiers: [{ at: -1, id: "a" }] })).toThrow();
  });
});

describe("alertLevel determinism and budget", () => {
  test("a restored state carries on exactly like a run that never saved", () => {
    const sight = looking();
    const continuous = alert(sight);
    const resumed = alert(sight);

    seenTick(sight, continuous, 0, 90, 10, 0);
    resumed.restore(continuous.state());

    const ctx = (nowMs: number) => ({ nowMs, activeUnits: 1 });
    let a = continuous.tick(0.1, ctx(100));
    let b = resumed.tick(0.1, ctx(100));
    expect(b).toEqual(a);
    for (let i = 2; i <= 40; i += 1) {
      a = continuous.tick(0.1, ctx(i * 100));
      b = resumed.tick(0.1, ctx(i * 100));
      expect(b).toEqual(a);
    }
    expect(a.escaped).toBe(b.escaped);
    expect(resumed.state()).toEqual(continuous.state());
  });

  test("a state round-trips through JSON as save data", () => {
    const sight = looking();
    const level = alert(sight);
    seenTick(sight, level, 0, 140, 8, -3);
    level.tick(0.5, { nowMs: 900, activeUnits: 2 });

    const saved = level.state();

    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });

  test("per-tick work stays bounded by the roster", () => {
    const sight = looking();
    const roster = Array.from({ length: 40 }, (_, i) => `eye_${i}`);
    const level = createAlertLevel<string>({
      witness: sight.witness,
      observers: () => roster,
      targetId: "target",
      tuning: { ...TUNING, standDownSeconds: 2 },
    });

    for (let i = 0; i <= 400; i += 1) {
      for (const id of roster) sight.see(id, i * 50, 20, 0);
      if (i === 0) level.report(60);
      level.tick(0.05, { nowMs: i * 50, activeUnits: 2 });
    }

    const stats = level.stats();
    expect(stats.observersChecked).toBe(roster.length);
    expect(stats.ticks).toBe(401);
    expect(Number.isFinite(stats.slowestTickMs)).toBe(true);
  });

  test("a perception service is a sight seam", () => {
    const perception = createPerception({ sightRange: 40, sightConeDeg: 360, hearingRange: 0, memorySeconds: 5 });
    const level = createAlertLevel<string>({
      witness: perception,
      observers: () => ["eye"],
      targetId: "target",
      tuning: TUNING,
    });

    level.report(30);
    const unseen = level.tick(1 / 60, { nowMs: 0, activeUnits: 0 });
    expect(unseen.value).toBe(0);

    perception.observe({ id: "eye", position: [0, 0, 0], yaw: 0 }, [{ id: "target", position: [10, 0, 0] }], 0);
    level.report(30);
    const seen = level.tick(1 / 60, { nowMs: 0, activeUnits: 0 });
    expect(seen.value).toBe(30);
    expect(seen.anchor?.at).toEqual([10, 0]);
  });
});

describe("alertSearchArea", () => {
  const tuning = { radius: (tier: string) => (tier === "high" ? 40 : 20), growPerSecond: 2, maxRadius: 45 };
  const anchor = { at: [3, 4] as const, lastSeenAt: 100, sourceId: "w", sourceTick: 1 };

  test("no tier or no sighting means no search", () => {
    expect(alertSearchArea({ tier: null, anchor, outOfSightSeconds: 0 }, tuning)).toBeNull();
    expect(alertSearchArea({ tier: "low", anchor: null, outOfSightSeconds: 0 }, tuning)).toBeNull();
  });

  test("starts at the tier's radius on the sighting and widens while cold, up to the cap", () => {
    expect(alertSearchArea({ tier: "low", anchor, outOfSightSeconds: 0 }, tuning)).toEqual({ center: [3, 4], radius: 20, lastSeenAt: 100 });
    expect(alertSearchArea({ tier: "low", anchor, outOfSightSeconds: 5 }, tuning)?.radius).toBe(30);
    expect(alertSearchArea({ tier: "high", anchor, outOfSightSeconds: 10 }, tuning)?.radius).toBe(45);
  });
});
