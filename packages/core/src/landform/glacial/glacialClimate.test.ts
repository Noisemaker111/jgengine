import { describe, expect, test } from "bun:test";
import { temperateBed } from "./basalTemperature";
import { LR04_STACK, snowlineAt, snowlineHistory } from "./glacialClimate";

describe("glacial climate from the LR04 stack", () => {
  test("the record runs 0 to 800 ka, with today's 3.23 ‰ and colder glacial maxima near 5 ‰", () => {
    const { ageKa, delta18O } = LR04_STACK;
    expect(ageKa.length).toBe(701);
    expect(ageKa[0]).toBe(0);
    expect(ageKa.at(-1)).toBe(800);
    for (let k = 1; k < ageKa.length; k += 1) expect(ageKa[k] ?? 0).toBeGreaterThan(ageKa[k - 1] ?? 0);
    expect(delta18O[0]).toBe(3.23);
    const at = (age: number): number => delta18O[ageKa.indexOf(age)] ?? 0;
    // The last glacial maximum, the last interglacial (MIS 5e) warmer than today, and MIS 12.
    expect(at(18)).toBeGreaterThan(4.9);
    expect(at(123)).toBeLessThan(3.23);
    expect(Math.max(...[430, 432, 434, 436, 438, 440].map(at))).toBeGreaterThan(4.9);
  });

  test("from the last interglacial the snowline falls to the glacial one at 18 ka and climbs back to today's", () => {
    const history = snowlineHistory({ presentEla: 3000, glacialEla: 2000, startKa: 123 });
    expect(snowlineAt(history, 0)).toBeGreaterThan(3000);
    expect(snowlineAt(history, 105_000)).toBeCloseTo(2000, 9);
    expect(snowlineAt(history, 123_000)).toBeCloseTo(3000, 9);
    expect(snowlineAt(history, 1e9)).toBeCloseTo(3000, 9);
    let lowest = Number.POSITIVE_INFINITY;
    for (let year = 0; year <= 123_000; year += 500) lowest = Math.min(lowest, snowlineAt(history, year));
    expect(lowest).toBeLessThanOrEqual(2000);
    expect(lowest).toBeGreaterThan(1800);
    expect(() => snowlineHistory({ presentEla: 3000, glacialEla: 2000, startKa: 10, endKa: 20 })).toThrow();
  });
});

describe("basal temperature", () => {
  const climate = { ela: 2000, snowlineTemperature: -2, lapseRate: 0.0065, geothermalFlux: 0.06 };
  const share = (bed: number, ice: number): number => temperateBed(new Float64Array(1), [bed], [ice], climate)[0] ?? 0;

  test("thin ice high above the snowline is frozen to its bed; thick ice and warm low ice slide", () => {
    expect(share(2500, 0)).toBe(0);
    expect(share(2500, 20)).toBe(0);
    expect(share(2500, 400)).toBe(1);
    // At the snowline, −2 °C at the surface and G/k = 0.0286 K/m: frozen at 30 m, temperate by 70 m.
    expect(share(1970, 30)).toBe(0);
    expect(share(1930, 70)).toBe(1);
    // Ice whose surface is 0 °C, 310 m below the snowline, is temperate however thin.
    expect(share(1600, 5)).toBe(1);
  });

  test("the bed thaws over the last kelvin below the melting point", () => {
    let last = 0;
    for (let h = 30; h <= 80; h += 1) {
      const value = share(2000 - h, h);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
    expect(share(2000 - 52, 52)).toBeGreaterThan(0);
    expect(share(2000 - 52, 52)).toBeLessThan(1);
  });
});
