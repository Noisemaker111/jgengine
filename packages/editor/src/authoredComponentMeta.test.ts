import { describe, expect, test } from "bun:test";

import {
  clearMaterialAssignmentPatch,
  clearTriggerInstallPatch,
  hasAuthoredTrigger,
  hasMaterialAssignment,
} from "./authoredComponentMeta";

describe("authoredComponentMeta", () => {
  test("hasAuthoredTrigger detects flat and multi-list forms", () => {
    expect(hasAuthoredTrigger(undefined)).toBe(false);
    expect(hasAuthoredTrigger({})).toBe(false);
    expect(hasAuthoredTrigger({ on: "enter", action: "spawn" })).toBe(true);
    expect(hasAuthoredTrigger({ on: "", action: "" })).toBe(false);
    expect(hasAuthoredTrigger({ triggers: [{ on: "enter", action: "spawn" }] })).toBe(true);
    expect(hasAuthoredTrigger({ triggers: [] })).toBe(false);
  });

  test("clear patches use empty / undefined so merge can drop keys", () => {
    expect(clearTriggerInstallPatch().on).toBe("");
    expect(clearTriggerInstallPatch().action).toBe("");
    expect(clearTriggerInstallPatch().triggers).toEqual([]);
    expect(clearMaterialAssignmentPatch().materialId).toBeUndefined();
    expect(hasMaterialAssignment({ materialId: "rock" })).toBe(true);
    expect(hasMaterialAssignment({ materialId: "" })).toBe(false);
  });
});
