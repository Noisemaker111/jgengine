import { describe, expect, it } from "bun:test";

import { createWaveRunner, type WaveRunnerConfig } from "./waveRunner";
import type { SpawnRequest } from "./spawnDirector";

function makeConfig(overrides: Partial<WaveRunnerConfig> = {}): WaveRunnerConfig {
  return {
    seed: 7,
    waves: [
      { budget: 20, duration: 4, entries: [{ id: "grunt", cost: 5 }] },
      { budget: 40, duration: 4, entries: [{ id: "grunt", cost: 5 }, { id: "brute", cost: 15, minWave: 1 }] },
      { budget: 80, duration: 4, entries: [{ id: "brute", cost: 15 }] },
    ],
    ...overrides,
  };
}

describe("createWaveRunner", () => {
  it("starts on WAVE 1 (1-based view over the 0-based director index)", () => {
    const runner = createWaveRunner(makeConfig());
    const view = runner.view();
    expect(view.wave).toBe(1);
    expect(runner.state().wave).toBe(0);
    expect(view.done).toBe(false);
  });

  it("forwards each SpawnRequest to the onSpawn sink and never instantiates itself", () => {
    const spawned: SpawnRequest[] = [];
    const runner = createWaveRunner(makeConfig({ onSpawn: (r) => spawned.push(r) }));
    runner.update(1, { alive: 0 });
    expect(spawned.length).toBeGreaterThan(0);
    // The runner only forwards the director's free-string entryIds; it never branches on them.
    expect(spawned.every((s) => s.entryId === "grunt")).toBe(true);
    expect(runner.view().spawnedTotal).toBe(spawned.length);
  });

  it("reports wave progress from duration and clamps to 0..1", () => {
    const runner = createWaveRunner(makeConfig());
    runner.update(2, { alive: 999 }); // maxAlive-style block via alive keeps it in wave 0
    expect(runner.view().waveProgress).toBeCloseTo(0.5, 5);
    runner.update(10, { alive: 999 });
    expect(runner.view().waveProgress).toBeLessThanOrEqual(1);
    expect(runner.view().waveProgress).toBeGreaterThanOrEqual(0);
  });

  it("falls back to a budget-drain estimate when a wave has no duration", () => {
    const runner = createWaveRunner(
      makeConfig({ waves: [{ budget: 20, entries: [{ id: "grunt", cost: 5 }] }] }),
    );
    // Nothing spawned yet, full budget banked → progress 0.
    expect(runner.view().waveProgress).toBe(0);
    runner.update(1, { alive: 0 });
    // Budget drained by spawns → progress rises toward 1.
    expect(runner.view().waveProgress).toBeGreaterThan(0);
  });

  it("forceNextWave advances the display wave and banks the next budget", () => {
    const runner = createWaveRunner(makeConfig());
    const before = runner.view().budget;
    runner.forceNextWave();
    expect(runner.view().wave).toBe(2);
    expect(runner.state().wave).toBe(1);
    expect(runner.view().budget).toBe(before + 40);
  });

  it("raiseAlert clamps 0..1 and is reflected in the view", () => {
    const runner = createWaveRunner(makeConfig());
    runner.raiseAlert(0.4);
    expect(runner.view().alert).toBeCloseTo(0.4, 5);
    runner.raiseAlert(5);
    expect(runner.view().alert).toBe(1);
  });

  it("marks done after the final non-looping wave elapses", () => {
    const runner = createWaveRunner(makeConfig({ maxAlive: 0 }));
    for (let i = 0; i < 20; i += 1) runner.update(1, { alive: 0 });
    expect(runner.view().done).toBe(true);
  });

  it("notifies subscribers when wave/budget/spawns change", () => {
    const runner = createWaveRunner(makeConfig());
    let calls = 0;
    const unsub = runner.subscribe(() => (calls += 1));
    runner.update(1, { alive: 0 });
    runner.forceNextWave();
    runner.raiseAlert(0.2);
    expect(calls).toBeGreaterThanOrEqual(3);
    unsub();
    const before = calls;
    runner.forceNextWave();
    expect(calls).toBe(before);
  });

  it("round-trips through snapshot/restore deterministically", () => {
    const a = createWaveRunner(makeConfig());
    for (let i = 0; i < 3; i += 1) a.update(0.7, { alive: 0 });
    const snap = JSON.parse(JSON.stringify(a.snapshot()));

    const b = createWaveRunner(makeConfig());
    b.restore(snap);
    expect(b.state()).toEqual(a.state());

    // Both continue identically from the restored cursor.
    const spawnsA: SpawnRequest[] = [];
    const spawnsB: SpawnRequest[] = [];
    const ra = createWaveRunner(makeConfig({ onSpawn: (r) => spawnsA.push(r) }));
    ra.restore(snap);
    const rb = createWaveRunner(makeConfig({ onSpawn: (r) => spawnsB.push(r) }));
    rb.restore(JSON.parse(JSON.stringify(snap)));
    for (let i = 0; i < 4; i += 1) {
      ra.update(0.5, { alive: 0 });
      rb.update(0.5, { alive: 0 });
    }
    expect(spawnsB).toEqual(spawnsA);
    expect(rb.state()).toEqual(ra.state());
  });

  it("reuses one pooled view object across calls", () => {
    const runner = createWaveRunner(makeConfig());
    expect(runner.view()).toBe(runner.view());
  });
});
