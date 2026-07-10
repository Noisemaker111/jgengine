import { describe, expect, test } from "bun:test";
import { frontProgressAt, isLullAt, STORM_SCHEDULE, STORM_START_OFFSET, stormPhaseAt } from "./storm";

describe("stormline storm front schedule", () => {
  test("starts behind the course at t=0", () => {
    expect(frontProgressAt(0)).toBe(STORM_START_OFFSET);
  });

  test("advances monotonically over time", () => {
    let prev = frontProgressAt(0);
    for (let t = 10; t <= 400; t += 10) {
      const next = frontProgressAt(t);
      expect(next).toBeGreaterThanOrEqual(prev);
      prev = next;
    }
  });

  test("has three named escalation phases plus lull windows", () => {
    const escalations = STORM_SCHEDULE.filter((phase) => !phase.label.startsWith("Lull"));
    const lulls = STORM_SCHEDULE.filter((phase) => phase.label.startsWith("Lull"));
    expect(escalations.length).toBe(3);
    expect(lulls.length).toBeGreaterThanOrEqual(1);
  });

  test("advances slower during a lull window than the surrounding pace", () => {
    const lull = STORM_SCHEDULE.find((phase) => phase.label.startsWith("Lull"))!;
    const before = frontProgressAt(lull.endsAt - 5);
    const duringEnd = frontProgressAt(lull.endsAt);
    const lullDelta = duringEnd - before;

    const surroundingPhase = stormPhaseAt(lull.endsAt + 1);
    const afterStart = frontProgressAt(lull.endsAt);
    const afterEnd = frontProgressAt(lull.endsAt + 5);
    const afterDelta = afterEnd - afterStart;

    expect(lullDelta / 5).toBeLessThan(afterDelta / 5);
    expect(surroundingPhase.paceMps).toBeGreaterThan(lull.paceMps);
  });

  test("isLullAt reports true only inside a lull segment", () => {
    const lull = STORM_SCHEDULE.find((phase) => phase.label.startsWith("Lull"))!;
    expect(isLullAt(lull.endsAt - 1)).toBe(true);
    expect(isLullAt(0)).toBe(false);
  });
});
