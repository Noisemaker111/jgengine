import { describe, expect, test } from "bun:test";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { dayGoal, stationShortfall } from "./goal";
import { createHousehold, type HouseholdState } from "../session/types";
import { createTenantMember } from "../boarding/boarding";

function station(catalogId: string): SceneObject {
  return { instanceId: `obj:${catalogId}`, catalogId, position: { x: 0, y: 0, z: 0 }, rotationY: 0 } as SceneObject;
}

function household(patch: Partial<HouseholdState> = {}): HouseholdState {
  return { ...createHousehold("goal-test"), ...patch };
}

describe("dayGoal", () => {
  test("asks for an earning station when none is furnished", () => {
    expect(dayGoal(household(), [])).toContain("Gig Terminal");
  });

  test("names the shortfall when credits cannot cover the midnight bill", () => {
    const objects = [station("work_console")];
    const state = household({ credits: 50 });
    expect(dayGoal(state, objects)).toMatch(/^Next: find \d+ more credits before the \d+-credit docking bill\.$/);
  });

  test("points to the pantry when rations run low and credits cover the bill", () => {
    const objects = [station("work_console")];
    expect(dayGoal(household({ pantry: 2 }), objects)).toContain("Pantry & bills");
  });

  test("otherwise states the bill to cover", () => {
    const objects = [station("work_console")];
    expect(dayGoal(household(), objects)).toContain("docking bill");
  });
});

describe("stationShortfall", () => {
  test("an occupied work station points to another Gig Terminal", () => {
    expect(stationShortfall("work", false, true)).toBe("No free work station — furnish another Gig Terminal (Furnish menu)");
  });

  test("a missing work station asks for a Gig Terminal, matching the Next line", () => {
    const message = stationShortfall("work", false, false);
    expect(message).toBe("No work station — furnish a Gig Terminal (Furnish menu)");
    expect(dayGoal(household(), [])).toContain("furnish a Gig Terminal");
  });

  test("the hydro tray is named as the fix", () => {
    expect(stationShortfall("fun", true, false)).toBe("No Hydro Tray station — furnish a Hydro Tray (Furnish menu)");
    expect(stationShortfall("fun", true, true)).toContain("furnish another Hydro Tray (Furnish menu)");
  });

  test("other goals name their furnishing rather than the raw role", () => {
    expect(stationShortfall("fun", false, false)).toBe("No fun station — furnish a Holo Arcade (Furnish menu)");
    expect(stationShortfall("hunger", false, true)).toBe("No free hunger station — furnish another Galley Counter (Furnish menu)");
  });
});

describe("dayGoal at the front desk", () => {
  test("an applicant at the airlock comes first", () => {
    const state = household();
    state.boarding!.applicant = { species: "velvet", deadline: 999, asked: [] };
    expect(dayGoal(state, [station("work_console")])).toBe("Next: Velvet is buzzing at the airlock — interview them.");
  });

  test("a miserable tenant is named with the fix", () => {
    const state = household();
    state.members["alien:0"] = { ...createTenantMember("alien:0", "krrt") };
    state.order = ["alien:0"];
    state.boarding!.rooms[0]!.tenantId = "alien:0";
    state.boarding!.rooms[0]!.settings = { atmosphere: "methane", gravity: "low", climate: "cold", light: "bright" };
    expect(dayGoal(state, [station("work_console")])).toContain("Krrt is miserable");
  });
});
