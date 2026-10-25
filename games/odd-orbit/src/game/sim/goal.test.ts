import { describe, expect, test } from "bun:test";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { dayGoal, stationShortfall } from "./goal";
import { createHousehold, type HouseholdState } from "../session/types";

function station(catalogId: string): SceneObject {
  return { instanceId: `obj:${catalogId}`, catalogId, position: { x: 0, y: 0, z: 0 }, rotationY: 0 } as SceneObject;
}

function household(patch: Partial<HouseholdState> = {}): HouseholdState {
  return { ...createHousehold("goal-test"), ...patch };
}

describe("dayGoal", () => {
  test("asks for an earning station when none is furnished", () => {
    expect(dayGoal(household(), [])).toContain("Yield Console");
  });

  test("names the shortfall when credits cannot cover the midnight bill", () => {
    const objects = [station("work_console")];
    const state = household({ credits: 50 });
    expect(dayGoal(state, objects)).toMatch(/^Next: earn \d+ more credits before the \d+-credit midnight bill\.$/);
  });

  test("points to the pantry when rations run low and credits cover the bill", () => {
    const objects = [station("work_console")];
    expect(dayGoal(household({ pantry: 2 }), objects)).toContain("Pantry & bills");
  });

  test("otherwise states the bill to cover", () => {
    const objects = [station("work_console")];
    expect(dayGoal(household(), objects)).toContain("midnight bill");
  });
});

describe("stationShortfall", () => {
  test("an occupied work station points to another Yield Console", () => {
    expect(stationShortfall("work", false, true)).toBe("No free work station — furnish another Yield Console (Furnish menu)");
  });

  test("a missing work station asks for a Yield Console, matching the Next line", () => {
    const message = stationShortfall("work", false, false);
    expect(message).toBe("No work station — furnish a Yield Console (Furnish menu)");
    expect(dayGoal(household(), [])).toContain("furnish a Yield Console");
  });

  test("the bloom planter is named as the fix", () => {
    expect(stationShortfall("fun", true, false)).toBe("No Bloom Planter station — furnish a Bloom Planter (Furnish menu)");
    expect(stationShortfall("fun", true, true)).toContain("furnish another Bloom Planter (Furnish menu)");
  });

  test("other goals name their furnishing rather than the raw role", () => {
    expect(stationShortfall("fun", false, false)).toBe("No fun station — furnish a Holo Arcade (Furnish menu)");
    expect(stationShortfall("hunger", false, true)).toBe("No free hunger station — furnish another Nutrient Font (Furnish menu)");
  });
});
