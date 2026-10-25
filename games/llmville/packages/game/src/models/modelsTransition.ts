import { applyShopPriceMultiplier } from "@llmville/game/economy/storeTransition";
import {
  getBaseModelDefinition,
  getResearchUnlockDataTokens,
  type BaseModelDefinition,
} from "@llmville/game/models/baseModels";
import { isBaseModelUnlockedForGame } from "@llmville/game/models/scraping";
import type { ModelCatalogMapRow } from "@llmville/game/schema/rowShapes";

export function isBaseModelResearchLocked(baseModel: BaseModelDefinition): boolean {
  return baseModel.availability === "research_locked";
}

export function withUpdatedModelCatalogEntry(
  catalog: ModelCatalogMapRow | null | undefined,
  baseModelId: string,
  updates: Partial<ModelCatalogMapRow[string]>,
): ModelCatalogMapRow {
  const current = catalog ?? {};
  return {
    ...current,
    [baseModelId]: {
      ...(current[baseModelId] ?? {}),
      ...updates,
    },
  };
}

export type UnlockBaseModelDecision =
  | { unlocked: true; alreadyUnlocked: true }
  | { unlocked: true; alreadyUnlocked: false; payment: "none" | "data_tokens" | "money"; amount: number }
  | { unlocked: false; reason: string };

export const MODEL_NAME_MAX_LENGTH = 64;

export type RenameModelDecision =
  | { renamed: true; name: string }
  | { renamed: false; reason: string };

export function decideRenameModel(newName: string): RenameModelDecision {
  const nextName = newName.trim().slice(0, MODEL_NAME_MAX_LENGTH);
  if (!nextName) return { renamed: false, reason: "Name cannot be empty" };
  return { renamed: true, name: nextName };
}

export function decideUnlockBaseModel(input: {
  baseModelId: string;
  modelCatalog: ModelCatalogMapRow | null | undefined;
  money: number;
  dataTokens: number;
  shopPriceMultiplier: number;
}): UnlockBaseModelDecision {
  const baseModel = getBaseModelDefinition(input.baseModelId);
  if (!baseModel) {
    return { unlocked: false, reason: "Unknown base model" };
  }
  if (isBaseModelUnlockedForGame(input.modelCatalog, baseModel)) {
    return { unlocked: true, alreadyUnlocked: true };
  }

  if (isBaseModelResearchLocked(baseModel)) {
    const dataCost = getResearchUnlockDataTokens(baseModel);
    if (input.dataTokens < dataCost) {
      return {
        unlocked: false,
        reason: `Need ${dataCost.toLocaleString()} data tokens to unlock ${baseModel.name}`,
      };
    }
    return { unlocked: true, alreadyUnlocked: false, payment: "data_tokens", amount: dataCost };
  }

  if (baseModel.sourceType === "open_source" && baseModel.licenseCost <= 0) {
    return { unlocked: true, alreadyUnlocked: true };
  }

  const licensePrice = applyShopPriceMultiplier(baseModel.licenseCost, input.shopPriceMultiplier);
  if (baseModel.licenseCost > 0 && input.money < licensePrice) {
    return { unlocked: false, reason: `Need $${licensePrice} to unlock ${baseModel.name}` };
  }

  return { unlocked: true, alreadyUnlocked: false, payment: "money", amount: licensePrice };
}