import { describe, expect, test } from "bun:test";

function oceanConfig(ocean: {
  bounds: { w: number; d: number };
  waveHeight: number;
  waveSpeed: number;
  color: string;
}) {
  return {
    size: Math.max(ocean.bounds.w, ocean.bounds.d),
    amplitude: ocean.waveHeight,
    speed: ocean.waveSpeed,
    color: { shallow: ocean.color },
  };
}

describe("ocean config identity inputs", () => {
  test("stable ocean fields produce equivalent configs under repeated reads", () => {
    const ocean = {
      bounds: { w: 100, d: 80 },
      waveHeight: 0.4,
      waveSpeed: 1.2,
      color: "#1a6",
    };
    const a = oceanConfig(ocean);
    const b = oceanConfig(ocean);
    expect(a).toEqual(b);
    expect(a.size).toBe(100);
    expect(a.amplitude).toBe(0.4);
  });
});
