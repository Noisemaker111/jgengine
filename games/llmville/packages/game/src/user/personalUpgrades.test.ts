import { describe, expect, test } from "bun:test";
import { computeUpgradeEffects, resolvePlayerSpeed } from "@llmville/game/user/personalUpgrades";

describe("computeUpgradeEffects", () => {
  test("no user returns defaults", () => {
    expect(computeUpgradeEffects(undefined)).toEqual({
      trainingEfficiencyBoost: 1,
      trainingDurationMultiplier: 1,
      walkSpeedLevel: 1,
      unresolvedEventPenaltyReduction: 0,
      servingStabilityBonus: 0,
      powerCapacityKw: 1.5,
    });
  });

  test("user with no owned upgrades returns defaults", () => {
    expect(computeUpgradeEffects({ ownedUpgrades: {} })).toEqual({
      trainingEfficiencyBoost: 1,
      trainingDurationMultiplier: 1,
      walkSpeedLevel: 1,
      unresolvedEventPenaltyReduction: 0,
      servingStabilityBonus: 0,
      powerCapacityKw: 1.5,
    });
  });

  test("sums per-level contributions from several partly-owned upgrades", () => {
    const effects = computeUpgradeEffects({
      ownedUpgrades: {
        development_workstation: 1,
        speed_boots: 3,
        coffee_maker: 1,
      },
    });

    expect(effects).toEqual({
      trainingEfficiencyBoost: 1.05,
      trainingDurationMultiplier: 0.9,
      walkSpeedLevel: 4,
      unresolvedEventPenaltyReduction: 0.15,
      servingStabilityBonus: 0,
      powerCapacityKw: 1.5,
    });
  });

  test("stacks contributions from multiple upgrades onto the same effect", () => {
    const effects = computeUpgradeEffects({
      ownedUpgrades: {
        development_workstation: 1,
        ergonomic_chair: 1,
        speed_boots: 4,
        second_monitor: 1,
        coffee_maker: 1,
        grid_hookup: 2,
      },
    });

    expect(effects).toEqual({
      trainingEfficiencyBoost: 1.05,
      trainingDurationMultiplier: 0.85,
      walkSpeedLevel: 5,
      unresolvedEventPenaltyReduction: 0.15,
      servingStabilityBonus: 0.03,
      powerCapacityKw: 20,
    });
  });

  test("clamps walkSpeedLevel, trainingDurationMultiplier and trainingEfficiencyBoost at their bounds", () => {
    const effects = computeUpgradeEffects({
      ownedUpgrades: {
        development_workstation: 20,
        speed_boots: 20,
      },
    });

    expect(effects.trainingEfficiencyBoost).toBe(1.5);
    expect(effects.trainingDurationMultiplier).toBe(0.5);
    expect(effects.walkSpeedLevel).toBe(5);
  });

  test("leaves unresolvedEventPenaltyReduction and servingStabilityBonus unclamped", () => {
    const effects = computeUpgradeEffects({
      ownedUpgrades: {
        coffee_maker: 100,
        second_monitor: 100,
      },
    });

    expect(effects.unresolvedEventPenaltyReduction).toBe(15);
    expect(effects.servingStabilityBonus).toBe(3);
  });
});

describe("resolvePlayerSpeed", () => {
  test("matches the pre-refactor formula (baseSpeed + (walkSpeedLevel - 1) * 0.8) for every speed_boots level", () => {
    expect(resolvePlayerSpeed(2, 1)).toBe(2);
    expect(resolvePlayerSpeed(2, 2)).toBe(2.8);
    expect(resolvePlayerSpeed(2, 3)).toBe(3.6);
    expect(resolvePlayerSpeed(2, 4)).toBe(4.4);
    expect(resolvePlayerSpeed(2, 5)).toBe(5.2);
  });

  test("scales with a different base speed", () => {
    expect(resolvePlayerSpeed(3, 1)).toBe(3);
    expect(resolvePlayerSpeed(3, 3)).toBe(4.6);
    expect(resolvePlayerSpeed(3, 5)).toBe(6.2);
  });

  test("composes with computeUpgradeEffects walkSpeedLevel output", () => {
    const { walkSpeedLevel } = computeUpgradeEffects({ ownedUpgrades: { speed_boots: 3 } });
    expect(resolvePlayerSpeed(2, walkSpeedLevel)).toBe(4.4);
  });
});
