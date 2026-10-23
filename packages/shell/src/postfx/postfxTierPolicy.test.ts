import { describe, expect, test } from "bun:test";

import { DEFAULT_GRAPHICS_PROFILES } from "@jgengine/core/settings/graphicsProfile";
import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";
import type { PostProcessingConfig } from "@jgengine/core/render/postProcessing";

import { planPostStages, type PostfxStage, type PostfxStagePlan } from "./PostProcessing";
import { POSTFX_TIER_POLICY, postfxTierPolicy } from "./postfxTierPolicy";

const TIERS: readonly GraphicsQuality[] = ["low", "medium", "high", "ultra"];

/** Every stage a chain can build, so a plan's cost is its stage list plus its resolution. */
const ALL_STAGES: readonly PostfxStage[] = ["ao", "bloom", "dof", "smaa", "exposure", "stylize", "grade"];

/** The stages `plan` builds, in the order the composer adds them. */
function plannedStages(plan: PostfxStagePlan): PostfxStage[] {
  return ALL_STAGES.filter((stage) => {
    if (stage === "ao") return plan.ao !== null;
    if (stage === "bloom") return plan.bloom !== null;
    if (stage === "dof") return plan.dof !== null;
    if (stage === "smaa") return plan.smaa;
    if (stage === "exposure") return plan.autoExposure !== null;
    if (stage === "stylize") return plan.stylize !== null;
    return plan.grade !== null;
  });
}

const full: PostProcessingConfig = {
  toneMapping: "aces",
  ao: undefined,
  bloom: {},
  dof: { focus: 12 },
  stylize: { bands: 4 },
  grade: {},
};

describe("a tier's post chain costs what it claims", () => {
  test("no tier spends more passes, samples or pixels than the tier above it", () => {
    const plans = TIERS.map((quality) => planPostStages(full, quality));
    for (let index = 1; index < plans.length; index += 1) {
      const lower = plans[index - 1]!;
      const higher = plans[index]!;
      expect(plannedStages(lower).length, `${TIERS[index - 1]} builds more passes than ${TIERS[index]}`).toBeLessThanOrEqual(plannedStages(higher).length);
      expect(lower.aoSamples).toBeLessThanOrEqual(higher.aoSamples);
      expect(lower.resolutionScale).toBeLessThanOrEqual(higher.resolutionScale);
    }
  });

  test("low drops the two passes that render the scene twice and renders what is left smaller", () => {
    const low = planPostStages(full, "low");
    const high = planPostStages(full, "high");
    expect(plannedStages(low)).toEqual(["bloom", "smaa", "exposure", "stylize", "grade"]);
    expect(low.ao).toBeNull();
    expect(low.dof).toBeNull();
    expect(low.resolutionScale).toBeLessThan(high.resolutionScale);
  });

  test("medium keeps AO and DOF but samples AO less and renders smaller than high", () => {
    const medium = planPostStages(full, "medium");
    const high = planPostStages(full, "high");
    expect(plannedStages(medium)).toEqual(plannedStages(high));
    expect(medium.aoSamples).toBeLessThan(high.aoSamples);
    expect(medium.resolutionScale).toBeLessThan(high.resolutionScale);
  });

  test("high and ultra render at native size with the same stage set", () => {
    const high = planPostStages(full, "high");
    const ultra = planPostStages(full, "ultra");
    expect(high.resolutionScale).toBe(1);
    expect(ultra.resolutionScale).toBe(1);
    expect(plannedStages(ultra)).toEqual(plannedStages(high));
    expect(ultra.aoSamples).toBeGreaterThanOrEqual(high.aoSamples);
  });
});

describe("the tier's default stage set is the one the graphics profile names", () => {
  test("a plan built without the player's toggles matches DEFAULT_GRAPHICS_PROFILES", () => {
    for (const quality of TIERS) {
      const authored = DEFAULT_GRAPHICS_PROFILES[quality].postStages;
      const plan = planPostStages(full, quality, undefined);
      expect({ ao: plan.ao !== null, bloom: plan.bloom !== null, dof: plan.dof !== null, smaa: plan.smaa }, quality).toEqual(authored);
    }
  });

  test("ultra reaches AO and DOF on its own defaults, as high does", () => {
    const ultra = planPostStages(full, "ultra");
    expect(ultra.ao).not.toBeNull();
    expect(ultra.dof).not.toBeNull();
  });

  test("every tier names a resolution scale a composer can apply", () => {
    for (const quality of TIERS) {
      const policy = postfxTierPolicy(quality);
      expect(policy).toBe(POSTFX_TIER_POLICY[quality]);
      expect(policy.resolutionScale).toBeGreaterThan(0);
      expect(policy.resolutionScale).toBeLessThanOrEqual(1);
    }
  });
});
