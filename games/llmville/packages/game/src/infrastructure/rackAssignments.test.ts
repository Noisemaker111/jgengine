import { describe, expect, test } from "bun:test";

import {
  decideRackSlotAssignment,
  isComputeLane,
  normalizeRackSlotAssignments,
  rackSlotAssignment,
  shouldResetScrapingAnchor,
  withRackSlotAssignmentsFollowingHardware,
  withRackSlotUnassigned,
} from "@llmville/game/infrastructure/rackAssignments";

const INSTALLED = ["gpu_1", null, "gpu_2", null] as const;

describe("normalizeRackSlotAssignments", () => {
  test("pads to the rack's slot capacity", () => {
    expect(normalizeRackSlotAssignments([], "air_rack_4")).toEqual([null, null, null, null]);
    expect(normalizeRackSlotAssignments(undefined, "starter_rack")).toEqual([null, null]);
  });

  test("truncates beyond capacity and drops malformed entries", () => {
    expect(
      normalizeRackSlotAssignments(
        [{ lane: "training" }, "junk", { lane: "serving", targetModelId: "m" }],
        "starter_rack",
      ),
    ).toEqual([{ lane: "training" }, null]);
  });

  test("keeps only the serving target model id", () => {
    expect(normalizeRackSlotAssignments([{ lane: "training", targetModelId: "m" }], "starter_rack")).toEqual([
      { lane: "training" },
      null,
    ]);
  });
});

describe("isComputeLane", () => {
  test("accepts the catalog lanes only", () => {
    expect(isComputeLane("training")).toBe(true);
    expect(isComputeLane("scraping")).toBe(true);
    expect(isComputeLane("serving")).toBe(true);
    expect(isComputeLane("mining")).toBe(false);
    expect(isComputeLane(3)).toBe(false);
  });
});

describe("decideRackSlotAssignment", () => {
  const base = {
    installedHardwareModuleIds: INSTALLED,
    assignments: normalizeRackSlotAssignments([], "air_rack_4"),
  };

  test("rejects an empty or out-of-range slot", () => {
    expect(decideRackSlotAssignment({ ...base, slotIndex: 1, lane: "training" })).toEqual({
      ok: false,
      reason: "No GPU in that slot",
    });
    expect(decideRackSlotAssignment({ ...base, slotIndex: 9, lane: "training" })).toEqual({
      ok: false,
      reason: "No GPU in that slot",
    });
    expect(decideRackSlotAssignment({ ...base, slotIndex: -1, lane: "training" })).toEqual({
      ok: false,
      reason: "No GPU in that slot",
    });
  });

  test("requires an existing model for a serving card", () => {
    expect(decideRackSlotAssignment({ ...base, slotIndex: 0, lane: "serving" })).toEqual({
      ok: false,
      reason: "Pick a model for this serving card",
    });
    expect(
      decideRackSlotAssignment({ ...base, slotIndex: 0, lane: "serving", targetModelId: "m" }),
    ).toEqual({ ok: false, reason: "Model not found" });
  });

  test("writes the assignment onto its own slot only", () => {
    const decision = decideRackSlotAssignment({ ...base, slotIndex: 2, lane: "scraping" });
    expect(decision).toEqual({
      ok: true,
      assignments: [null, null, { lane: "scraping" }, null],
    });
  });

  test("keeps the serving target model", () => {
    const decision = decideRackSlotAssignment({
      ...base,
      slotIndex: 0,
      lane: "serving",
      targetModelId: "model_a",
      targetModelExists: true,
    });
    expect(decision.ok && rackSlotAssignment(decision.assignments, 0)).toEqual({
      lane: "serving",
      targetModelId: "model_a",
    });
  });
});

describe("assignment lifecycle", () => {
  test("unassigns a single slot", () => {
    const assignments = [{ lane: "training" as const }, { lane: "scraping" as const }];
    expect(withRackSlotUnassigned(assignments, 0)).toEqual([null, { lane: "scraping" }]);
  });

  test("clears assignments whose card left the slot", () => {
    const assignments = [{ lane: "training" as const }, { lane: "scraping" as const }];
    expect(withRackSlotAssignmentsFollowingHardware(assignments, ["gpu_1", null])).toEqual([
      { lane: "training" },
      null,
    ]);
  });
});

describe("shouldResetScrapingAnchor", () => {
  test("only the first scraping card resets the anchor", () => {
    expect(shouldResetScrapingAnchor("scraping", false)).toBe(true);
    expect(shouldResetScrapingAnchor("scraping", true)).toBe(false);
    expect(shouldResetScrapingAnchor("training", false)).toBe(false);
  });
});
