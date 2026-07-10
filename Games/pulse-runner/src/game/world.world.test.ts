import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { COURSE_LENGTH } from "./course/course";
import { world } from "../world";

describe("pulse-runner world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("terrain spans the whole processional causeway", () => {
    expect(summary.terrain).toBeDefined();
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.bounds.d).toBeGreaterThan(COURSE_LENGTH);
  });

  test("terrain is flat by design (no bumps on the causeway)", () => {
    expect(summary.terrain?.height.min).toBe(summary.terrain?.height.max);
  });

  test("counts report exactly one terrain field", () => {
    expect(summary.counts.terrain).toBe(1);
  });
});
