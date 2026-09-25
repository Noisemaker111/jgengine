import { describe, expect, test } from "bun:test";
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  Color,
  LinearToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
} from "three";

import { DisplayColorWriter, sceneColorForDisplay, toneMapColor } from "./displayColor";

function linear(hex: string): [number, number, number] {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}

describe("sceneColorForDisplay", () => {
  const swatches = ["#cfe4f5", "#2c6cc6", "#9fc4e8", "#4a3a5c", "#05070f"];

  for (const [name, mode] of [
    ["AgX", AgXToneMapping],
    ["ACES", ACESFilmicToneMapping],
    ["Neutral", NeutralToneMapping],
    ["Reinhard", ReinhardToneMapping],
  ] as const) {
    test(`${name} shows each authored sky swatch as picked`, () => {
      for (const hex of swatches) {
        const shown = toneMapColor(sceneColorForDisplay(linear(hex), mode), mode);
        const want = linear(hex);
        for (let c = 0; c < 3; c += 1) expect(Math.abs(shown[c]! - want[c]!)).toBeLessThan(0.02);
      }
    });
  }

  test("a swatch the curve cannot reach lands closer than the uncompensated color", () => {
    const error = (a: readonly number[], b: readonly number[]) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]!), 0);
    for (const hex of ["#e3f4ff", "#ff8a5c"]) {
      const want = linear(hex);
      const compensated = toneMapColor(sceneColorForDisplay(want, AgXToneMapping), AgXToneMapping);
      expect(error(compensated, want)).toBeLessThan(error(toneMapColor(want, AgXToneMapping), want));
    }
  });

  test("AgX greys a pale horizon unless compensated", () => {
    const horizon = linear("#cfe4f5");
    const raw = toneMapColor(horizon, AgXToneMapping);
    expect(horizon[2]! - raw[2]!).toBeGreaterThan(0.2);
  });

  test("linear divides out exposure; no tone mapping passes through", () => {
    expect(sceneColorForDisplay([0.5, 0.25, 0.1], LinearToneMapping, 2)).toEqual([0.25, 0.125, 0.05]);
    expect(sceneColorForDisplay([0.5, 0.25, 0.1], NoToneMapping)).toEqual([0.5, 0.25, 0.1]);
  });
});

describe("DisplayColorWriter", () => {
  test("recomputes when the swatch or tone mapping changes", () => {
    const writer = new DisplayColorWriter();
    const target = new Color();
    const renderer = { toneMapping: NoToneMapping as number, toneMappingExposure: 1 };
    writer.write(target, new Color("#cfe4f5"), renderer as never);
    expect(target.getHex()).toBe(0xcfe4f5);
    renderer.toneMapping = AgXToneMapping;
    writer.write(target, new Color("#cfe4f5"), renderer as never);
    expect(target.b).toBeGreaterThan(1);
  });
});
