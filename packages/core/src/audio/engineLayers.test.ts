import { describe, expect, test } from "bun:test";

import { createEngineLayers, type EngineLayersAudio, type EngineLayersConfig } from "./engineLayers";

const config: EngineLayersConfig = {
  id: "engine",
  loadResponse: Infinity,
  layers: [
    { sound: "on-2k", rpm: 2000, load: "on" },
    { sound: "on-6k", rpm: 6000, load: "on" },
    { sound: "off-2k", rpm: 2000, load: "off" },
    { sound: "off-6k", rpm: 6000, load: "off" },
  ],
};

function power(gains: readonly number[]): number {
  return gains.reduce((sum, g) => sum + g * g, 0);
}

describe("createEngineLayers", () => {
  test("plays only the bracketing on-load pair at full load, crossfaded by rpm", () => {
    const engine = createEngineLayers(config);
    const mix = engine.update(1 / 60, { rpm: 4000, load: 1 });
    expect(mix.map((m) => m.id)).toEqual(["engine:0", "engine:1", "engine:2", "engine:3"]);
    expect(mix[0]!.gain).toBeCloseTo(Math.SQRT1_2, 9);
    expect(mix[1]!.gain).toBeCloseTo(Math.SQRT1_2, 9);
    expect(mix[2]!.gain).toBeCloseTo(0, 9);
    expect(mix[3]!.gain).toBeCloseTo(0, 9);
    expect(mix[0]!.rate).toBe(2);
    expect(mix[1]!.rate).toBeCloseTo(4000 / 6000, 9);
  });

  test("keeps constant power across the rpm and load crossfades", () => {
    const engine = createEngineLayers(config);
    for (const rpm of [1000, 2000, 3100, 5000, 8000]) {
      for (const load of [0, 0.3, 0.45, 1]) {
        expect(power(engine.update(1 / 60, { rpm, load }).map((m) => m.gain))).toBeCloseTo(1, 9);
      }
    }
  });

  test("switches to the off-load set when the throttle lifts", () => {
    const engine = createEngineLayers(config);
    const mix = engine.update(1 / 60, { rpm: 2000, load: 0 });
    expect(mix[2]!.gain).toBeCloseTo(1, 9);
    expect(mix[0]!.gain).toBeCloseTo(0, 9);
  });

  test("clamps to the end samples outside the recorded rpm range", () => {
    const engine = createEngineLayers(config);
    expect(engine.update(1 / 60, { rpm: 9000, load: 1 })[1]!.gain).toBeCloseTo(1, 9);
    expect(engine.update(1 / 60, { rpm: 500, load: 1 })[0]!.gain).toBeCloseTo(1, 9);
  });

  test("a config with one load set plays it at any load", () => {
    const engine = createEngineLayers({ id: "e", layers: [{ sound: "a", rpm: 1000, load: "on" }], loadResponse: Infinity });
    expect(engine.update(1 / 60, { rpm: 1000, load: 0 })[0]!.gain).toBe(1);
  });

  test("smooths load, and snapshot/restore round-trips it", () => {
    const engine = createEngineLayers({ ...config, loadResponse: 10 });
    engine.update(0.05, { rpm: 3000, load: 1 });
    const saved = engine.snapshot();
    expect(saved.load).toBeGreaterThan(0.3);
    expect(saved.load).toBeLessThan(0.5);
    const gains = engine.update(0.05, { rpm: 3000, load: 1 }).map((m) => m.gain);
    engine.restore(saved);
    expect(engine.update(0.05, { rpm: 3000, load: 1 }).map((m) => m.gain)).toEqual(gains);
    engine.reset();
    expect(engine.snapshot()).toEqual({ load: 0 });
  });

  test("play drives one retained loop per layer with shared filter and velocity", () => {
    const calls: string[] = [];
    const audio: EngineLayersAudio = {
      loop: (id, sound) => calls.push(`loop ${id} ${sound}`),
      setLoop: (id, p) => calls.push(`set ${id} ${p.gain?.toFixed(2)} lp=${p.lowpass} v=${p.velocity?.[0]}`),
      stopLoop: (id) => calls.push(`stop ${id}`),
    };
    const engine = createEngineLayers({ id: "e", layers: [{ sound: "a", rpm: 1000 }], loadResponse: Infinity });
    engine.update(1 / 60, { rpm: 1000, load: 1 });
    engine.play(audio, { gain: 0.5, lowpass: 1200, velocity: [3, 0, 0] });
    engine.stop(audio);
    expect(calls).toEqual(["loop e:0 a", "set e:0 0.50 lp=1200 v=3", "stop e:0"]);
  });

  test("retune swaps the layer set", () => {
    const engine = createEngineLayers(config);
    engine.retune({ id: "x", layers: [{ sound: "solo", rpm: 3000 }] });
    expect(engine.update(1 / 60, { rpm: 3000, load: 1 }).map((m) => [m.id, m.gain])).toEqual([["x:0", 1]]);
  });
});
