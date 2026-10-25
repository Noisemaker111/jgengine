import { applyShopPriceMultiplier } from "@llmville/game/economy/storeTransition";
import { createStats, type StatModifierSet } from "@jgengine/core/stats/statModifiers";
import { GRID_HOOKUP_CAPACITY_KW, gridHookupCapacityKw } from "@llmville/game/infrastructure/infrastructure";

export const PERSONAL_UPGRADE_ID_VALUES = [
  "development_workstation",
  "speed_boots",
  "coffee_maker",
  "second_monitor",
  "ergonomic_chair",
  "grid_hookup",
] as const;
export type PersonalUpgradeId = (typeof PERSONAL_UPGRADE_ID_VALUES)[number];

export type UpgradeEffectId = "trainingEfficiencyBoost" | "trainingDurationMultiplier" | "walkSpeedLevel" | "unresolvedEventPenaltyReduction" | "servingStabilityBonus" | "gridHookupLevel";

const GRID_HOOKUP_COSTS = [2000, 10000, 60000, 400000] as const;
const GRID_HOOKUP_MAX_LEVEL = GRID_HOOKUP_COSTS.length;

export interface PersonalUpgradeDef { id: PersonalUpgradeId; label: string; description: string; descriptionOwned?: string; cost: (lvl: number) => number; maxLevel: number; effects: ReadonlyArray<{ effectId: UpgradeEffectId; valuePerLevel: number; }>; }

const PERSONAL_UPGRADE_CATALOG: readonly PersonalUpgradeDef[] = [
  { id: "development_workstation", label: "Field Laptop", description: "Portable dev setup. +5% model quality, -10% training time.", descriptionOwned: "Unlocked. Better model prep quality.", cost: () => 300, maxLevel: 1, effects: [{ effectId: "trainingEfficiencyBoost", valuePerLevel: 0.05 }, { effectId: "trainingDurationMultiplier", valuePerLevel: -0.1 }] },
  { id: "speed_boots", label: "Speed Boots", description: "Move faster around the lab.", descriptionOwned: "Movement speed maxed.", cost: lvl => 180 + lvl * 120, maxLevel: 4, effects: [{ effectId: "walkSpeedLevel", valuePerLevel: 1 }] },
  { id: "coffee_maker", label: "Coffee Maker", description: "Stay sharp. Reduces penalty from unresolved lab events by 15%.", descriptionOwned: "Lab morale boosted.", cost: () => 220, maxLevel: 1, effects: [{ effectId: "unresolvedEventPenaltyReduction", valuePerLevel: 0.15 }] },
  { id: "second_monitor", label: "Second Monitor", description: "Better serving visibility. +3% serving stability.", descriptionOwned: "Serving dashboard optimized.", cost: () => 380, maxLevel: 1, effects: [{ effectId: "servingStabilityBonus", valuePerLevel: 0.03 }] },
  { id: "ergonomic_chair", label: "Ergonomic Chair", description: "Comfort = focus. -5% training duration (stacks with laptop).", descriptionOwned: "Training sessions more efficient.", cost: () => 280, maxLevel: 1, effects: [{ effectId: "trainingDurationMultiplier", valuePerLevel: -0.05 }] },
  { id: "grid_hookup", label: "Grid Hookup", description: `Upgrade the electrical service feeding your racks (${GRID_HOOKUP_CAPACITY_KW.join(" → ")} kW).`, descriptionOwned: "Full datacenter feed installed.", cost: lvl => GRID_HOOKUP_COSTS[lvl] ?? 0, maxLevel: GRID_HOOKUP_MAX_LEVEL, effects: [{ effectId: "gridHookupLevel", valuePerLevel: 1 }] },
];

export const getPersonalUpgradeDef = (id: string) => PERSONAL_UPGRADE_CATALOG.find(u => u.id === id) ?? null;
const getUpgradeCost = (id: PersonalUpgradeId, lvl: number) => getPersonalUpgradeDef(id)?.cost(lvl) ?? 0;

export interface UpgradeEffects { trainingEfficiencyBoost: number; trainingDurationMultiplier: number; walkSpeedLevel: number; unresolvedEventPenaltyReduction: number; servingStabilityBonus: number; powerCapacityKw: number; }
const DEFAULT_EFFECTS: Record<UpgradeEffectId, number> = { trainingEfficiencyBoost: 1, trainingDurationMultiplier: 1, walkSpeedLevel: 1, unresolvedEventPenaltyReduction: 0, servingStabilityBonus: 0, gridHookupLevel: 0 };
export interface UserForUpgrades { ownedUpgrades?: Record<string, number>; }

const getEffectiveLevel = (u: UserForUpgrades, id: PersonalUpgradeId) => {
  return u.ownedUpgrades?.[id] ?? 0;
};

export const computeUpgradeEffects = (u?: UserForUpgrades | null): UpgradeEffects => {
  const stats = createStats<UpgradeEffectId>({ ...DEFAULT_EFFECTS });
  if (u) {
    for (const def of PERSONAL_UPGRADE_CATALOG) {
      const lvl = getEffectiveLevel(u, def.id);
      if (lvl <= 0) continue;
      const modifiers: StatModifierSet<UpgradeEffectId> = {};
      for (const { effectId, valuePerLevel } of def.effects) {
        modifiers[effectId] = { add: valuePerLevel * lvl };
      }
      stats.addSource(def.id, modifiers);
    }
  }
  return {
    trainingEfficiencyBoost: Math.max(1, Math.min(1.5, stats.get("trainingEfficiencyBoost"))),
    trainingDurationMultiplier: Math.max(0.5, Math.min(1.5, stats.get("trainingDurationMultiplier"))),
    walkSpeedLevel: Math.max(1, Math.min(5, stats.get("walkSpeedLevel"))),
    unresolvedEventPenaltyReduction: stats.get("unresolvedEventPenaltyReduction"),
    servingStabilityBonus: stats.get("servingStabilityBonus"),
    powerCapacityKw: gridHookupCapacityKw(stats.get("gridHookupLevel")),
  };
};

const WALK_SPEED_LEVEL_STEP = 0.8;

export const resolvePlayerSpeed = (baseSpeed: number, walkSpeedLevel: number): number => {
  const stats = createStats<"speed">({ speed: baseSpeed });
  stats.addSource("speed_boots", { speed: { add: (walkSpeedLevel - 1) * WALK_SPEED_LEVEL_STEP } });
  return stats.get("speed");
};

export function buildPersonalUpgradeItems(ownedUpgrades: Record<string, number> | undefined) {
  const own = ownedUpgrades ?? {};
  return PERSONAL_UPGRADE_CATALOG.map((def) => {
    const currentLevel = own[def.id] ?? 0;
    return {
      id: def.id,
      label: def.label,
      description: currentLevel >= def.maxLevel && def.descriptionOwned ? def.descriptionOwned : def.description,
      cost: currentLevel >= def.maxLevel ? 0 : getUpgradeCost(def.id, currentLevel),
      owned: currentLevel >= def.maxLevel,
      currentLevel,
      maxLevel: def.maxLevel,
    };
  });
}

export type PersonalUpgradePurchaseDecision =
  | { purchased: false; reason: string }
  | { purchased: true; cost: number; nextLevel: number };

export function decidePersonalUpgradePurchase(args: {
  upgradeId: PersonalUpgradeId;
  ownedUpgrades: Record<string, number> | undefined;
  shopPriceMultiplier: number;
}): PersonalUpgradePurchaseDecision {
  const def = getPersonalUpgradeDef(args.upgradeId);
  if (!def) return { purchased: false, reason: "Unknown upgrade" };
  const currentLevel = args.ownedUpgrades?.[args.upgradeId] ?? 0;
  if (currentLevel >= def.maxLevel) return { purchased: false, reason: "Upgrade already maxed" };
  return {
    purchased: true,
    cost: applyShopPriceMultiplier(getUpgradeCost(args.upgradeId, currentLevel), args.shopPriceMultiplier),
    nextLevel: currentLevel + 1,
  };
}
