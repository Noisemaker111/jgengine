import { describe, expect, test } from "bun:test";
import {
  colorDistance,
  concealmentScore,
  createConcealmentSensor,
  type ConcealmentTarget,
} from "@jgengine/core/sensor/concealment";

describe("colorDistance", () => {
  test("is zero for identical colors", () => {
    expect(colorDistance("#336699", "#336699")).toBe(0);
  });

  test("is close to one for black vs white", () => {
    expect(colorDistance("#000000", "#ffffff")).toBeCloseTo(1, 5);
  });

  test("is symmetric", () => {
    expect(colorDistance("#112233", "#a1b2c3")).toBeCloseTo(colorDistance("#a1b2c3", "#112233"), 10);
  });

  test("treats malformed hex as black", () => {
    expect(colorDistance("not-a-color", "#000000")).toBe(0);
    expect(colorDistance("not-a-color", "#ffffff")).toBeCloseTo(colorDistance("#000000", "#ffffff"), 10);
  });
});

describe("concealmentScore", () => {
  test("scores high when entity colors match the background", () => {
    const score = concealmentScore(["#2f4f2f", "#3a5a3a"], ["#2f4f2f", "#3a5a3a", "#405040"]);
    expect(score).toBeGreaterThan(0.95);
  });

  test("scores low when entity colors contrast with the background", () => {
    const score = concealmentScore(["#ff0000"], ["#00ff00"]);
    expect(score).toBeLessThan(0.5);
  });

  test("uses the nearest background color per entity color", () => {
    const closeMatch = concealmentScore(["#204020"], ["#204020", "#ff00ff"]);
    const farOnly = concealmentScore(["#204020"], ["#ff00ff"]);
    expect(closeMatch).toBeGreaterThan(farOnly);
  });

  test("empty inputs score zero", () => {
    expect(concealmentScore([], ["#000000"])).toBe(0);
    expect(concealmentScore(["#000000"], [])).toBe(0);
    expect(concealmentScore([], [])).toBe(0);
  });
});

describe("createConcealmentSensor", () => {
  function target(id: string, blended: boolean): ConcealmentTarget {
    return blended
      ? { id, entityColors: ["#2f4f2f"], backgroundColors: ["#2f4f2f"] }
      : { id, entityColors: ["#ff0000"], backgroundColors: ["#00ff00"] };
  }

  test("accumulates dwell seconds while concealed", () => {
    const sensor = createConcealmentSensor();
    const first = sensor.tick([target("a", true)], 0.5);
    const second = sensor.tick([target("a", true)], 0.5);
    expect(first[0]!.concealed).toBe(true);
    expect(first[0]!.dwellSeconds).toBeCloseTo(0.5, 5);
    expect(second[0]!.dwellSeconds).toBeCloseTo(1, 5);
  });

  test("dwell resets the instant concealment drops below threshold", () => {
    const sensor = createConcealmentSensor();
    sensor.tick([target("a", true)], 1);
    const after = sensor.tick([target("a", false)], 1);
    expect(after[0]!.concealed).toBe(false);
    expect(after[0]!.dwellSeconds).toBe(0);
  });

  test("reset clears dwell state for one id or all", () => {
    const sensor = createConcealmentSensor();
    sensor.tick([target("a", true)], 2);
    sensor.reset("a");
    const after = sensor.tick([target("a", true)], 0.25);
    expect(after[0]!.dwellSeconds).toBeCloseTo(0.25, 5);
  });

  test("threshold config controls the concealed cutoff", () => {
    const lenient = createConcealmentSensor({ threshold: 0.1 });
    const strict = createConcealmentSensor({ threshold: 0.99 });
    const mixed: ConcealmentTarget = { id: "a", entityColors: ["#204020"], backgroundColors: ["#254525"] };
    expect(lenient.tick([mixed], 0.1)[0]!.concealed).toBe(true);
    expect(strict.tick([mixed], 0.1)[0]!.concealed).toBe(false);
  });
});
