import { describe, expect, test } from "bun:test";

import { generatorVariants, runGenerator } from "@jgengine/core/generator/generator";
import { parseParams } from "@jgengine/core/generator/paramSchema";
import { COURSE_GENERATOR, COURSE_RUN_OUT, COURSE_SCHEMA } from "@jgengine/core/roads/courseGenerator";
import { buildCourseLayout, checkCoursePlayability, measureCourse, type CourseLayout, type CourseMeasure } from "@jgengine/core/roads/courseLayout";

const THEMES = ["default", ...COURSE_SCHEMA.presets!.map((preset) => preset.id)];
const SEEDS = Array.from({ length: 10 }, (_, index) => `seed-${index}`);

function generate(meta: Record<string, unknown>): CourseLayout {
  return runGenerator(COURSE_GENERATOR, meta);
}

function themed(theme: string, seed: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...(theme === "default" ? {} : { theme }), seed, ...extra };
}

describe("course generator", () => {
  for (const theme of THEMES) {
    test(`${theme}: every seed is playable, fits its footprint and answers its dials`, () => {
      const params = parseParams(COURSE_SCHEMA, themed(theme, "x"));
      for (const seed of SEEDS) {
        const layout = generate(themed(theme, seed));
        const check = checkCoursePlayability(layout);
        if (!check.ok) throw new Error(`${theme}/${seed}: ${check.issues.join("; ")}`);
        const course = buildCourseLayout(layout);
        const measure = measureCourse(layout, course);
        // The start line, the run, the run-out past the finish.
        expect(layout.startLine).toBe(params.runUp);
        expect(Math.abs(measure.length - params.length) / params.length).toBeLessThan(0.03);
        expect(course.length - layout.finish).toBeCloseTo(COURSE_RUN_OUT, 0);
        // Inside the footprint: across `width`, ahead of the start up to `depth`.
        for (const route of course.routes) {
          for (const [x, z] of route.points) {
            expect(Math.abs(x)).toBeLessThanOrEqual(params.width / 2);
            expect(z).toBeGreaterThanOrEqual(-1e-6);
            expect(z).toBeLessThanOrEqual(params.depth);
          }
        }
        // Slots: exactly the counts asked for, every shortcut a gamble.
        expect(measure.branches).toBe(params.shortcuts);
        expect(measure.slots["hazard"] ?? 0).toBe(params.hazards);
        expect(measure.slots["gate"] ?? 0).toBe(params.gates);
        expect(measure.slots["drop"] ?? 0).toBe(params.drops);
        expect(measure.slots["drop:opening"] ?? 0).toBe(params.openingDrops);
        expect(measure.slots["zone"] ?? 0).toBe(params.zones);
        expect(measure.slots["dressing"] ?? 0).toBe(params.landmarks);
        for (const trade of check.shortcuts) {
          expect(trade.saving).toBeGreaterThan(0.3);
          expect(trade.risk).toBeGreaterThanOrEqual(trade.saving);
          expect(trade.riskSlots.length).toBeGreaterThan(0);
        }
        // Rhythm: turning at about the asked pace, and the drops and climb where asked.
        expect(measure.turnsPerKm).toBeGreaterThan(params.pace * 0.6);
        expect(measure.turnsPerKm).toBeLessThan(params.pace * 1.5 + 4);
        expect(measure.descents).toBe(params.descents);
        if (params.climb > 0) expect(measure.climb).toBeGreaterThan(params.climb * 0.7);
        // The opening straight is calm: its drops come before the first barricade and no hazard sits on it.
        const firstGate = Math.min(...layout.slots.filter((slot) => slot.kind === "gate" && slot.route === undefined).map((slot) => slot.at));
        for (const slot of layout.slots) if (slot.role === "opening") expect(slot.at).toBeLessThan(firstGate);
        for (const slot of layout.slots) if (slot.kind === "hazard" && slot.route === undefined) expect(slot.at).toBeGreaterThan(firstGate);
      }
    });
  }

  test("the same params and seed give the same course; another seed another one", () => {
    const a = JSON.stringify(generate({ theme: "maze", seed: "same" }));
    expect(JSON.stringify(generate({ theme: "maze", seed: "same" }))).toBe(a);
    expect(JSON.stringify(generate({ theme: "maze", seed: "other" }))).not.toBe(a);
  });

  test("every dial moves the property it names", () => {
    const seeds = SEEDS.slice(0, 4);
    const average = (meta: Record<string, unknown>, read: (measure: CourseMeasure, layout: CourseLayout) => number): number =>
      seeds.reduce((sum, seed) => {
        const layout = generate({ ...meta, seed });
        return sum + read(measureCourse(layout), layout);
      }, 0) / seeds.length;
    const moves = (key: string, low: unknown, high: unknown, read: (measure: CourseMeasure, layout: CourseLayout) => number, base: Record<string, unknown> = {}) => {
      const a = average({ ...base, [key]: low }, read);
      const b = average({ ...base, [key]: high }, read);
      if (!(b > a)) throw new Error(`${key}: ${String(low)} → ${a.toFixed(2)}, ${String(high)} → ${b.toFixed(2)}`);
    };
    const corner = (tag: string) => (measure: CourseMeasure) => measure.corners[tag] ?? 0;
    const slot = (key: string) => (measure: CourseMeasure) => measure.slots[key] ?? 0;
    moves("length", 500, 1000, (m) => m.length);
    moves("runUp", 20, 90, (_m, layout) => layout.startLine);
    moves("halfWidth", 6, 12, (_m, layout) => layout.spec.halfWidth);
    moves("width", 300, 900, (m) => m.bounds.maxX - m.bounds.minX, { length: 900, depth: 400 });
    moves("depth", 300, 900, (m) => m.bounds.maxZ - m.bounds.minZ, { length: 900, width: 400 });
    moves("pace", 4, 14, (m) => m.turnsPerKm);
    moves("sweepers", 0, 1, corner("sweeper"));
    moves("rightAngles", 0, 1, corner("right-angle"));
    moves("hairpins", 0, 1, corner("hairpin"));
    moves("chicanes", 0, 1, corner("chicane"));
    moves("climb", 0, 30, (m) => m.climb);
    moves("descents", 0, 2, (m) => m.descents);
    moves("shortcuts", 0, 2, (m) => m.branches);
    moves("hazards", 2, 8, slot("hazard"));
    moves("timedShare", 0, 1, slot("hazard:timed"), { laneShare: 0 });
    moves("laneShare", 0, 1, slot("hazard:lane"), { timedShare: 0 });
    moves("gates", 2, 8, slot("gate"));
    moves("jumpShare", 0, 1, slot("gate:jump"));
    moves("drops", 8, 16, slot("drop"));
    moves("openingDrops", 2, 10, slot("drop:opening"));
    moves("zones", 1, 4, slot("zone"));
    moves("landmarks", 2, 10, slot("dressing"));
  }, 60_000); // ~180 generations; well under a second each, but a shared runner is slow

  test("the variant grid grows a playable course for every tile", () => {
    for (const variant of generatorVariants(COURSE_GENERATOR, { theme: "causeway", seed: "grid" }, { count: 8 })) {
      const check = checkCoursePlayability(generate(variant.meta));
      if (!check.ok) throw new Error(`${variant.seed}: ${check.issues.join("; ")}`);
    }
  });

  test("a course generates in well under a frame budget", () => {
    const start = performance.now();
    for (const seed of SEEDS) generate({ theme: "sprint", seed });
    expect((performance.now() - start) / SEEDS.length).toBeLessThan(150);
  });
});
