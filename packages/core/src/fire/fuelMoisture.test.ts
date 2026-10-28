import { describe, expect, test } from "bun:test";
import { createFireLandscape, type FireWeather } from "./fireLandscape";
import { MOISTURE_SCENARIOS, SCOTT_BURGAN_FUEL_MODELS, type FuelMoisture } from "./fuelModels";
import { createFuelMoistureModel, equilibriumMoistureContent, fuelLevelWeather, growingSeasonIndex, type MoistureWeather } from "./fuelMoisture";

function need<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing fixture");
  return value;
}

const D2L2 = need(MOISTURE_SCENARIOS["D2L2"]);
const GR2 = need(SCOTT_BURGAN_FUEL_MODELS["GR2"]);
const HOUR = 3600;

const DRY_AFTERNOON: MoistureWeather = { airTemperatureC: 30, relativeHumidity: 0.2, rainRateMmPerHour: 0, cloudCover: 0, daylight: 1 };
const RAIN: MoistureWeather = { airTemperatureC: 12, relativeHumidity: 0.95, rainRateMmPerHour: 4, cloudCover: 1, daylight: 0.3 };

/**
 * Rothermel 1983 (GTR INT-143) Table 1, reference fine dead fuel moisture (%) for exposed fuel by dry-bulb
 * band (10–29 .. >109 °F) and humidity band (0–4 .. 100 %), as carried in BehavePlus (USFS, public domain).
 */
const ROTHERMEL_1983_REFERENCE = [
  [1, 2, 2, 3, 4, 5, 5, 6, 7, 8, 8, 8, 9, 9, 10, 11, 12, 12, 13, 13, 14],
  [1, 2, 2, 3, 4, 5, 5, 6, 7, 7, 7, 8, 9, 9, 10, 10, 11, 12, 13, 13, 13],
  [1, 2, 2, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 11, 12, 12, 12, 13],
  [1, 1, 2, 2, 3, 4, 5, 5, 6, 7, 7, 8, 8, 8, 9, 10, 10, 11, 12, 12, 13],
  [1, 1, 2, 2, 3, 4, 4, 5, 6, 7, 7, 8, 8, 8, 9, 10, 10, 11, 12, 12, 13],
  [1, 1, 2, 2, 3, 4, 4, 5, 6, 7, 7, 8, 8, 8, 9, 10, 10, 11, 12, 12, 12],
];
const BAND_MID_F = [20, 40, 60, 80, 100, 115];

describe("equilibrium moisture against a published table", () => {
  test("clear-sky fuel-level EMC matches Rothermel 1983 reference fine fuel moisture: bias under 0.2, RMS under 0.6, worst under 1.5 points", () => {
    let sum = 0;
    let sumSq = 0;
    let worst = 0;
    let count = 0;
    ROTHERMEL_1983_REFERENCE.forEach((row, i) => {
      const tC = ((BAND_MID_F[i] ?? 0) - 32) / 1.8;
      row.forEach((expected, j) => {
        const rh = j < 20 ? (j * 5 + 2) / 100 : 1;
        const level = fuelLevelWeather(tC, rh, 0, 1);
        const err = equilibriumMoistureContent(level.temperatureC, level.relativeHumidity) * 100 - expected;
        sum += err;
        sumSq += err * err;
        worst = Math.max(worst, Math.abs(err));
        count++;
      });
    });
    expect(Math.abs(sum / count)).toBeLessThan(0.2);
    expect(Math.sqrt(sumSq / count)).toBeLessThan(0.6);
    expect(worst).toBeLessThan(1.5);
  });

  test("EMC rises with humidity and falls with temperature; overcast sun barely heats fuel", () => {
    expect(equilibriumMoistureContent(20, 0.6)).toBeGreaterThan(equilibriumMoistureContent(20, 0.3));
    expect(equilibriumMoistureContent(35, 0.3)).toBeLessThan(equilibriumMoistureContent(5, 0.3));
    expect(fuelLevelWeather(20, 0.5, 1, 1).temperatureC).toBeCloseTo(20 + 5 / 1.8, 9);
    expect(fuelLevelWeather(20, 0.5, 0, 0)).toEqual({ temperatureC: 20, relativeHumidity: 0.5 });
  });
});

describe("dead fuel time lag", () => {
  test("each class closes 1 − 1/e of the gap to equilibrium in one time lag", () => {
    const start: FuelMoisture = { oneHour: 0.3, tenHour: 0.3, hundredHour: 0.3, liveHerb: 0.9, liveWoody: 1.2 };
    for (const [lag, layer] of [
      [1, "oneHour"],
      [10, "tenHour"],
      [100, "hundredHour"],
    ] as const) {
      const model = createFuelMoistureModel({ cells: 1, initial: start });
      model.step(lag * HOUR, DRY_AFTERNOON);
      const level = fuelLevelWeather(30, 0.2, 0, 1);
      const eq = layer === "hundredHour" ? equilibriumMoistureContent(30, 0.2) : equilibriumMoistureContent(level.temperatureC, level.relativeHumidity);
      const closed = (0.3 - (model.layers[layer][0] ?? 0)) / (0.3 - eq);
      expect(closed).toBeCloseTo(1 - Math.exp(-1), 5);
    }
  });

  test("the update is exact: one two-hour step equals 120 one-minute steps", () => {
    const a = createFuelMoistureModel({ cells: 1, initial: D2L2 });
    const b = createFuelMoistureModel({ cells: 1, initial: D2L2 });
    a.step(2 * HOUR, DRY_AFTERNOON);
    for (let k = 0; k < 120; k++) b.step(60, DRY_AFTERNOON);
    expect(b.layers.oneHour[0] ?? 0).toBeCloseTo(a.layers.oneHour[0] ?? 0, 6);
    expect(b.layers.hundredHour[0] ?? 0).toBeCloseTo(a.layers.hundredHour[0] ?? 0, 6);
  });

  test("rain wets fine fuel toward 35 % within hours; 100-h fuel wets slowly and more with longer rain", () => {
    const model = createFuelMoistureModel({ cells: 1, initial: D2L2 });
    model.step(3 * HOUR, RAIN);
    expect(model.layers.oneHour[0] ?? 0).toBeGreaterThan(0.33);
    const after3 = model.layers.hundredHour[0] ?? 0;
    expect(after3).toBeLessThan(0.15);
    expect(after3).toBeGreaterThan(D2L2.hundredHour);
    const short = createFuelMoistureModel({ cells: 1, initial: D2L2 });
    const long = createFuelMoistureModel({ cells: 1, initial: D2L2 });
    for (let h = 0; h < 12; h++) long.step(HOUR, RAIN);
    for (let h = 0; h < 12; h++) short.step(HOUR, h < 2 ? RAIN : { ...RAIN, rainRateMmPerHour: 0 });
    expect(long.layers.hundredHour[0] ?? 0).toBeGreaterThan(short.layers.hundredHour[0] ?? 0);
  });

  test("sun dries exposed fuel below shaded fuel; night undoes it", () => {
    const exposure = new Float32Array([1, 0]);
    const model = createFuelMoistureModel({ cells: 2, initial: D2L2, exposure });
    model.step(4 * HOUR, DRY_AFTERNOON);
    const sunny = model.layers.oneHour[0] ?? 0;
    const shaded = model.layers.oneHour[1] ?? 0;
    expect(sunny).toBeLessThan(shaded - 0.01);
    model.step(6 * HOUR, { ...DRY_AFTERNOON, airTemperatureC: 12, relativeHumidity: 0.7, daylight: 0 });
    expect(Math.abs((model.layers.oneHour[0] ?? 0) - (model.layers.oneHour[1] ?? 0))).toBeLessThan(1e-4);
  });

  test("wet() soaks one cell's fine fuel and it dries again", () => {
    const model = createFuelMoistureModel({ cells: 4, initial: D2L2 });
    const v = model.version;
    model.wet(2, 0.6);
    expect(model.version).toBeGreaterThan(v);
    expect(model.moistureAt(2).oneHour).toBeCloseTo(0.6, 6);
    expect(model.moistureAt(1).oneHour).toBeCloseTo(D2L2.oneHour, 6);
    model.step(6 * HOUR, DRY_AFTERNOON);
    expect(model.moistureAt(2).oneHour).toBeLessThan(0.1);
  });
});

describe("live fuel green-up (Jolly 2005 growing season index)", () => {
  test("the index ramps on minimum temperature, VPD and day length", () => {
    expect(growingSeasonIndex(10, 500, 14)).toBe(1);
    expect(growingSeasonIndex(-5, 500, 14)).toBe(0);
    expect(growingSeasonIndex(10, 5000, 14)).toBe(0);
    expect(growingSeasonIndex(10, 500, 9)).toBe(0);
    expect(growingSeasonIndex(1.5, 2500, 10.5)).toBeCloseTo(0.5 * 0.5 * 0.5, 12);
  });

  test("weeks of mild, humid, long days green live fuel up; weeks of frost cure it", () => {
    const spring: MoistureWeather = { airTemperatureC: 15, relativeHumidity: 0.7, rainRateMmPerHour: 0, cloudCover: 0.5, dayLengthHours: 14 };
    const winter: MoistureWeather = { airTemperatureC: -6, relativeHumidity: 0.7, rainRateMmPerHour: 0, cloudCover: 0.5, dayLengthHours: 9 };
    const model = createFuelMoistureModel({ cells: 1, initial: { ...D2L2, liveHerb: 0.3, liveWoody: 0.6 } });
    expect(model.live().herb).toBeCloseTo(0.3, 9);
    for (let d = 0; d < 60; d++) model.step(24 * HOUR, spring);
    expect(model.live().greenness).toBeGreaterThan(0.95);
    expect(model.live().herb).toBeGreaterThan(2.3);
    for (let d = 0; d < 60; d++) model.step(24 * HOUR, winter);
    expect(model.live().herb).toBeLessThan(0.32);
    expect(model.live().woody).toBeLessThan(0.62);
  });
});

describe("state", () => {
  test("snapshot and restore resume exactly; reset returns to the start", () => {
    const exposure = new Float32Array([1, 0.5, 0]);
    const a = createFuelMoistureModel({ cells: 3, initial: D2L2, exposure });
    const b = createFuelMoistureModel({ cells: 3, initial: D2L2, exposure });
    const days = (m: typeof a, from: number, to: number): void => {
      for (let h = from; h < to; h++) m.step(HOUR, h % 24 < 6 ? RAIN : { ...DRY_AFTERNOON, daylight: h % 24 < 18 ? 1 : 0 });
    };
    days(a, 0, 50);
    days(b, 0, 23);
    const saved = JSON.parse(JSON.stringify(b.snapshot()));
    const c = createFuelMoistureModel({ cells: 3, initial: D2L2, exposure });
    c.restore(saved);
    days(c, 23, 50);
    expect([...c.layers.oneHour]).toEqual([...a.layers.oneHour]);
    expect([...c.layers.hundredHour]).toEqual([...a.layers.hundredHour]);
    expect(c.live()).toEqual(a.live());
    a.reset();
    expect(a.moistureAt(0)).toEqual(createFuelMoistureModel({ cells: 3, initial: D2L2 }).moistureAt(0));
    expect(a.time).toBe(0);
  });

  test("retune changes lags in play", () => {
    const model = createFuelMoistureModel({ cells: 1, initial: D2L2, tuning: { oneHourLagHours: 2 } });
    model.retune({ oneHourLagHours: 0.01 });
    model.step(HOUR, DRY_AFTERNOON);
    const level = fuelLevelWeather(30, 0.2, 0, 1);
    expect(model.layers.oneHour[0] ?? 0).toBeCloseTo(equilibriumMoistureContent(level.temperatureC, level.relativeHumidity), 5);
  });
});

describe("moisture drives the fire", () => {
  const fireWeather: FireWeather = { twentyFootWind: 5, windDirection: 0, airTemperatureC: 25, moisture: D2L2 };

  function burnAfter(prepare: (m: ReturnType<typeof createFuelMoistureModel>) => void): ReturnType<typeof createFireLandscape> {
    const cols = 120;
    const rows = 60;
    const fire = createFireLandscape({ cols, rows, cellSize: 2, fuels: [GR2], fuel: new Uint8Array(cols * rows), seed: 1, tuning: { spotting: false } });
    const moisture = createFuelMoistureModel({ cells: cols * rows, initial: D2L2 });
    prepare(moisture);
    fire.setMoistureField(moisture);
    fire.ignite(20, 30);
    for (let t = 0; t < 600; t += 30) fire.step(30, fireWeather);
    return fire;
  }

  test("a dry afternoon burns more than the morning after rain, and a wetted line holds", () => {
    const dry = burnAfter((m) => m.step(4 * HOUR, DRY_AFTERNOON)).burnedArea();
    const wet = burnAfter((m) => m.step(4 * HOUR, RAIN)).burnedArea();
    expect(dry).toBeGreaterThan(0);
    expect(wet).toBeLessThan(dry * 0.2);
    const cols = 120;
    const lined = burnAfter((m) => {
      m.step(4 * HOUR, DRY_AFTERNOON);
      for (let r = 0; r < 60; r++) for (let c = 50; c < 53; c++) m.wet(r * cols + c, 0.4);
    });
    expect(lined.burnedArea()).toBeLessThan(dry);
    for (let r = 0; r < 60; r++) for (let c = 50; c < cols; c++) expect(lined.cell(c, r).state).toBe("unburnt");
  });
});
