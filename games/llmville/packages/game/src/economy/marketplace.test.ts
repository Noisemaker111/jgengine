import { describe, expect, test } from "bun:test";
import { decideStartHosting } from "@llmville/game/economy/marketplace";

describe("decideStartHosting", () => {
  test("rejects an unknown vendor model", () => {
    const decision = decideStartHosting({
      vendorModelId: "not_a_real_model",
      existingVendorModelIds: [],
      totalVramGb: 1000,
      reputation: 0,
    });
    expect(decision).toEqual({ started: false, reason: "Model is not available for hosting" });
  });

  test("rejects a model already being hosted", () => {
    const decision = decideStartHosting({
      vendorModelId: "claudia_3",
      existingVendorModelIds: ["claudia_3"],
      totalVramGb: 1000,
      reputation: 0,
    });
    expect(decision).toEqual({ started: false, reason: "Already hosting this model" });
  });

  test("rejects insufficient VRAM (claudia_3 needs 34 GB at fp16)", () => {
    const decision = decideStartHosting({
      vendorModelId: "claudia_3",
      existingVendorModelIds: [],
      totalVramGb: 10,
      reputation: 0,
    });
    expect(decision).toEqual({
      started: false,
      reason: "Needs 34 GB VRAM to host, only 10 GB installed",
    });
  });

  test("starts hosting and defaults revenue share to the reputation-scaled max", () => {
    const decision = decideStartHosting({
      vendorModelId: "claudia_3",
      existingVendorModelIds: [],
      totalVramGb: 100,
      reputation: 0,
    });
    expect(decision).toEqual({ started: true, revenueShareHost: 0.3 });
  });

  test("clamps a requested revenue share to the reputation-scaled max", () => {
    const decision = decideStartHosting({
      vendorModelId: "claudia_3",
      existingVendorModelIds: [],
      totalVramGb: 100,
      reputation: 0,
      requestedRevenueShare: 0.9,
    });
    expect(decision).toEqual({ started: true, revenueShareHost: 0.3 });
  });

  test("floors a requested revenue share below the 0.3 minimum", () => {
    const decision = decideStartHosting({
      vendorModelId: "claudia_3",
      existingVendorModelIds: [],
      totalVramGb: 100,
      reputation: 0,
      requestedRevenueShare: 0.1,
    });
    expect(decision).toEqual({ started: true, revenueShareHost: 0.3 });
  });
});
