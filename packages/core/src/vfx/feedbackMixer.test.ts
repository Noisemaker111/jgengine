import { describe, expect, test } from "bun:test";

import { createFeedbackMixer, sampleFeedbackCurve } from "./feedbackMixer";

type Signal = "rpm" | "slip" | "speed" | "landing";
type Target = "engineRate" | "engineGain" | "squeal" | "rumble" | "fov";

function carMixer() {
  return createFeedbackMixer<Signal, Target>({
    routes: [
      { signal: "rpm", target: "engineRate", curve: [[900, 0.3], [7200, 2.4]] },
      { signal: "slip", target: "squeal", curve: [[0.85, 0], [1.25, 1]], attack: 20, release: 4 },
      { signal: "slip", target: "rumble", curve: [[0.9, 0], [1.5, 0.8]] },
      { signal: "landing", target: "rumble", curve: [[1.5, 0], [8, 1]] },
      { signal: "speed", target: "fov", curve: [[0, 0], [50, 18]], attack: 30, release: 30 },
    ],
    combine: { rumble: "max" },
    base: { fov: 58, engineGain: 0.25 },
    events: [{ id: "thud", signal: "landing", threshold: 1.5, cooldown: 0.3 }],
  });
}

describe("sampleFeedbackCurve", () => {
  test("interpolates between points, clamps the ends, and is the identity when empty", () => {
    expect(sampleFeedbackCurve([[0, 0], [10, 1]], 5)).toBeCloseTo(0.5, 9);
    expect(sampleFeedbackCurve([[0, 0], [10, 1]], -3)).toBe(0);
    expect(sampleFeedbackCurve([[0, 0], [10, 1]], 30)).toBe(1);
    expect(sampleFeedbackCurve(undefined, 7)).toBe(7);
  });
});

describe("createFeedbackMixer", () => {
  test("routes signals through curves onto a base value", () => {
    const mixer = carMixer();
    const out = mixer.update(1 / 60, { rpm: 4050, speed: 25 });
    expect(out.engineRate).toBeCloseTo(1.35, 6);
    expect(out.engineGain).toBe(0.25);
    expect(out.fov).toBeCloseTo(58 + 0.5, 6);
    expect(out.squeal).toBe(0);
  });

  test("attack and release smooth a route, so squeal swells fast and fades slowly", () => {
    const mixer = carMixer();
    let out = mixer.update(0.1, { slip: 1.25 });
    expect(out.squeal).toBeCloseTo(1, 6);
    out = mixer.update(0.1, { slip: 0 });
    expect(out.squeal).toBeCloseTo(0.6, 6);
  });

  test("max combine keeps the strongest rumble source", () => {
    const mixer = carMixer();
    const out = mixer.update(1 / 60, { slip: 1.5, landing: 4.75 });
    expect(out.rumble).toBeCloseTo(0.8, 6);
  });

  test("an event fires once on crossing its threshold and respects its cooldown", () => {
    const mixer = carMixer();
    mixer.update(1 / 60, { landing: 3 });
    expect(mixer.fired("thud")).toBe(true);
    mixer.update(1 / 60, { landing: 3 });
    expect(mixer.fired("thud")).toBe(false);
    mixer.update(1 / 60, { landing: 0 });
    mixer.update(1 / 60, { landing: 5 });
    expect(mixer.fired("thud")).toBe(false);
    for (let i = 0; i < 20; i += 1) mixer.update(1 / 60, { landing: 0 });
    mixer.update(1 / 60, { landing: 5 });
    expect(mixer.fired("thud")).toBe(true);
  });

  test("snapshot/restore resumes smoothing and cooldowns exactly, retune keeps state, reset clears it", () => {
    const signals = (i: number) => ({ rpm: 900 + i * 50, slip: 0.8 + (i % 7) * 0.1, speed: i, landing: i % 11 === 0 ? 4 : 0 });
    const reference = carMixer();
    const replica = carMixer();
    let saved = reference.snapshot();
    const outputs: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      if (i === 30) saved = reference.snapshot();
      const out = reference.update(1 / 60, signals(i));
      if (i >= 30) outputs.push(JSON.stringify(out) + reference.fired("thud"));
    }
    replica.restore(saved);
    for (let i = 30; i < 60; i += 1) {
      const out = replica.update(1 / 60, signals(i));
      expect(JSON.stringify(out) + replica.fired("thud")).toBe(outputs[i - 30]!);
    }
    const before = reference.snapshot();
    reference.retune({ routes: [{ signal: "rpm", target: "engineRate" }] });
    expect(reference.snapshot().routes[0]).toBe(before.routes[0]);
    reference.reset();
    expect(reference.snapshot().routes.every((value) => value === 0)).toBe(true);
  });
});
