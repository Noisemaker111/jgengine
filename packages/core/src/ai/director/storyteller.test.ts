import { describe, expect, test } from "bun:test";

import { createStoryteller, type StoryIncident } from "./storyteller";

function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

const BOON: StoryIncident = { id: "boon", cost: 0 };
const SMALL: StoryIncident = { id: "small", cost: 10 };
const BIG: StoryIncident = { id: "big", cost: 60 };

describe("createStoryteller", () => {
  test("nothing fires before the first gap, then one incident per gap", () => {
    const teller = createStoryteller({ incidents: [BOON], pointsPerSecond: 0, gap: { min: 10, max: 10 } });
    expect(teller.advance(9, null, seq(0))).toBeNull();
    expect(teller.advance(1, null, seq(0))?.incident.id).toBe("boon");
    expect(teller.advance(9, null, seq(0))).toBeNull();
    expect(teller.advance(1, null, seq(0))?.incident.id).toBe("boon");
    expect(teller.view().fired).toBe(2);
  });

  test("threats wait until points can afford them, and spend what they cost", () => {
    const teller = createStoryteller({ incidents: [BIG], pointsPerSecond: 1, gap: { min: 20, max: 20 } });
    expect(teller.advance(20, null, seq(0))).toBeNull();
    expect(teller.view().points).toBe(20);
    let beat = null;
    for (let i = 0; i < 60 && beat === null; i++) beat = teller.advance(1, null, seq(0));
    expect(beat?.incident.id).toBe("big");
    expect(beat!.pointsBefore).toBeGreaterThanOrEqual(60);
    expect(teller.view().points).toBeLessThan(beat!.pointsBefore);
  });

  test("scale makes a richer target build points faster", () => {
    const poor = createStoryteller<number>({ incidents: [], pointsPerSecond: 1, scale: (wealth) => wealth, gap: { min: 99, max: 99 } });
    const rich = createStoryteller<number>({ incidents: [], pointsPerSecond: 1, scale: (wealth) => wealth, gap: { min: 99, max: 99 } });
    poor.advance(10, 1, seq(0));
    rich.advance(10, 2.5, seq(0));
    expect(rich.view().points).toBe(25);
    expect(poor.view().points).toBe(10);
  });

  test("a big threat buys rest; cooldown and conditions gate repeats", () => {
    const teller = createStoryteller<{ broken: boolean }>({
      incidents: [{ id: "fix", cost: 0, when: (r) => r.broken }, { id: "raid", cost: 50, cooldownSeconds: 100 }],
      pointsPerSecond: 0, startPoints: 200, gap: { min: 5, max: 5 }, restPerPoint: 1,
    });
    const beat = teller.advance(5, { broken: false }, seq(0));
    expect(beat?.incident.id).toBe("raid");
    expect(teller.view().secondsToNext).toBe(55);
    expect(teller.eligible({ broken: false })).toEqual([]);
    expect(teller.eligible({ broken: true })).toEqual(["fix"]);
  });

  test("repeat damping and spend lean shape the weighted pick", () => {
    const teller = createStoryteller({ incidents: [BOON, SMALL], pointsPerSecond: 0, startPoints: 10, gap: { min: 1, max: 1 }, repeatPenalty: 0, preferSpend: 0 });
    const first = teller.advance(1, null, seq(0.1, 0));
    expect(first?.incident.id).toBe("boon");
    expect(teller.advance(1, null, seq(0, 0))?.incident.id).toBe("small");
  });

  test("snapshot and restore carry the clock, points and history", () => {
    const a = createStoryteller({ incidents: [BOON, SMALL], pointsPerSecond: 2, gap: { min: 8, max: 12 } });
    const rng = seq(0.3, 0.7, 0.1);
    for (let i = 0; i < 40; i++) a.advance(1, null, rng);
    const b = createStoryteller({ incidents: [BOON, SMALL], pointsPerSecond: 2, gap: { min: 8, max: 12 } });
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    expect(b.snapshot()).toEqual(a.snapshot());
    const ra = seq(0.5);
    const rb = seq(0.5);
    for (let i = 0; i < 30; i++) expect(b.advance(1, null, rb)?.incident.id).toBe(a.advance(1, null, ra)?.incident.id);
  });

  test("restore drops malformed fields instead of trusting them", () => {
    const teller = createStoryteller({ incidents: [BOON], pointsPerSecond: 1, gap: { min: 1, max: 1 } });
    teller.restore({ elapsed: Number.NaN, points: -4, nextAt: 3, lastFiredAt: { boon: Number.NaN }, recent: [7 as never, "boon"], fired: 2.6 });
    expect(teller.snapshot()).toEqual({ elapsed: 0, points: 0, nextAt: 3, lastFiredAt: {}, recent: ["boon"], fired: 3 });
  });

  test("retune keeps state and changes pacing", () => {
    const teller = createStoryteller({ incidents: [BOON], pointsPerSecond: 1, gap: { min: 50, max: 50 } });
    teller.advance(10, null, seq(0));
    teller.retune({ incidents: [BOON], pointsPerSecond: 3, gap: { min: 50, max: 50 } });
    teller.advance(10, null, seq(0));
    expect(teller.view().points).toBe(40);
  });
});
