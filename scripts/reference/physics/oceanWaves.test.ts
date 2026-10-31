import { describe, expect, test } from "bun:test";

import { seededRng } from "@jgengine/core/random/rng";
import { irregularSea, regularSea, seaElevation, seaWaterAt, spectralMoment, waveSpectrum } from "./oceanWaves";

describe("sea spectra", () => {
  test("Pierson–Moskowitz holds Hs²/16 of variance and peaks at ωp", () => {
    const spectrum = { significantHeight: 4, peakPeriod: 10 };
    expect(spectralMoment(spectrum, 0) / (16 / 16)).toBeCloseTo(1, 2);
    const wp = (2 * Math.PI) / 10;
    expect(waveSpectrum(spectrum, wp)).toBeGreaterThan(waveSpectrum(spectrum, 0.95 * wp));
    expect(waveSpectrum(spectrum, wp)).toBeGreaterThan(waveSpectrum(spectrum, 1.05 * wp));
  });

  test("JONSWAP γ 3.3 keeps the variance within 2% (DNV normalisation) and sharpens the peak", () => {
    const pm = { significantHeight: 3, peakPeriod: 8 };
    const jonswap = { ...pm, peakEnhancement: 3.3 };
    expect(Math.abs(spectralMoment(jonswap, 0) / (9 / 16) - 1)).toBeLessThan(0.02);
    const wp = (2 * Math.PI) / 8;
    expect(waveSpectrum(jonswap, wp) / waveSpectrum(pm, wp)).toBeCloseTo((1 - 0.287 * Math.log(3.3)) * 3.3, 6);
  });
});

describe("irregular sea", () => {
  test("the same seed gives the same sea, and its record carries the spectrum's variance within 5%", () => {
    const spectrum = { significantHeight: 2, peakPeriod: 7, peakEnhancement: 3.3 };
    const a = irregularSea(spectrum, { random: seededRng(7) });
    const b = irregularSea(spectrum, { random: seededRng(7) });
    expect(seaElevation(a, 3, 1, 12.5)).toBe(seaElevation(b, 3, 1, 12.5));
    let sum = 0;
    const samples = 20000;
    for (let i = 0; i < samples; i += 1) sum += seaElevation(a, 0, 0, i * 0.25) ** 2;
    expect(Math.abs(sum / samples / spectralMoment(spectrum, 0) - 1)).toBeLessThan(0.05);
  });

  test("short-crested seas spread their headings about the mean", () => {
    const sea = irregularSea({ significantHeight: 2, peakPeriod: 7 }, { random: seededRng(3), spreading: 2, direction: 1 });
    const headings = sea.components.map((c) => c.direction);
    expect(Math.max(...headings) - Math.min(...headings)).toBeGreaterThan(0.5);
    expect(headings.every((h) => Math.abs(h - 1) < Math.PI / 2)).toBe(true);
  });

  test("wave pressure is zero on the moving surface, hydrostatic in still water, and decays as e^(kz) below", () => {
    const sea = regularSea(0.5, 6);
    const water = seaWaterAt(sea, 1.3);
    const eta = seaElevation(sea, 2, 0, 1.3);
    expect(water.pressure(2, 0, eta)).toBeCloseTo(0, 6);
    expect(water.submergence(2, 0, eta - 1)).toBeCloseTo(1, 12);
    const still = seaWaterAt(regularSea(0, 6), 0);
    expect(still.pressure(0, 0, -3)).toBeCloseTo(sea.density * sea.gravity * 3, 6);
    const k = sea.components[0]?.wavenumber ?? 0;
    const deep = water.pressure(0, 0, -20) - sea.density * sea.gravity * 20;
    expect(deep / (sea.density * sea.gravity * seaElevation(sea, 0, 0, 1.3))).toBeCloseTo(Math.exp(k * (-20 - seaElevation(sea, 0, 0, 1.3))), 6);
  });
});
