import { describe, expect, test } from "bun:test";
import {
  MODEL_NAME_MAX_LENGTH,
  decideRenameModel,
  decideUnlockBaseModel,
  isBaseModelResearchLocked,
  withUpdatedModelCatalogEntry,
} from "@llmville/game/models/modelsTransition";
import { getBaseModelDefinition } from "@llmville/game/models/baseModels";

describe("isBaseModelResearchLocked", () => {
  test("flags research-locked base models", () => {
    expect(isBaseModelResearchLocked(getBaseModelDefinition("alpaca_2")!)).toBe(true);
  });

  test("does not flag freely available base models", () => {
    expect(isBaseModelResearchLocked(getBaseModelDefinition("llamma_3")!)).toBe(false);
  });
});

describe("withUpdatedModelCatalogEntry", () => {
  test("creates a catalog from scratch when none exists", () => {
    expect(withUpdatedModelCatalogEntry(undefined, "llamma_3", { isUnlocked: true })).toEqual({
      llamma_3: { isUnlocked: true },
    });
  });

  test("merges updates into an existing entry without touching other entries", () => {
    const catalog = { llamma_3: { isUnlocked: true }, alpaca_2: { isUnlocked: false } };
    expect(withUpdatedModelCatalogEntry(catalog, "alpaca_2", { isUnlocked: true })).toEqual({
      llamma_3: { isUnlocked: true },
      alpaca_2: { isUnlocked: true },
    });
  });
});

describe("decideUnlockBaseModel", () => {
  test("rejects an unknown base model", () => {
    expect(
      decideUnlockBaseModel({ baseModelId: "nope", modelCatalog: null, money: 0, dataTokens: 0, shopPriceMultiplier: 1 }),
    ).toEqual({ unlocked: false, reason: "Unknown base model" });
  });

  test("treats free open-source base models as already unlocked", () => {
    expect(
      decideUnlockBaseModel({ baseModelId: "llamma_3", modelCatalog: null, money: 0, dataTokens: 0, shopPriceMultiplier: 1 }),
    ).toEqual({ unlocked: true, alreadyUnlocked: true });
  });

  test("recognizes a base model already flagged unlocked in the catalog", () => {
    expect(
      decideUnlockBaseModel({
        baseModelId: "qwither_2",
        modelCatalog: { qwither_2: { isUnlocked: true } },
        money: 0,
        dataTokens: 0,
        shopPriceMultiplier: 1,
      }),
    ).toEqual({ unlocked: true, alreadyUnlocked: true });
  });

  test("blocks a research-locked model without enough data tokens", () => {
    expect(
      decideUnlockBaseModel({ baseModelId: "alpaca_2", modelCatalog: null, money: 0, dataTokens: 1000, shopPriceMultiplier: 1 }),
    ).toEqual({ unlocked: false, reason: "Need 5,000 data tokens to unlock Alpaca 2" });
  });

  test("unlocks a research-locked model by spending data tokens", () => {
    expect(
      decideUnlockBaseModel({ baseModelId: "alpaca_2", modelCatalog: null, money: 0, dataTokens: 5000, shopPriceMultiplier: 1 }),
    ).toEqual({ unlocked: true, alreadyUnlocked: false, payment: "data_tokens", amount: 5000 });
  });

  test("blocks a licensed model without enough money", () => {
    expect(
      decideUnlockBaseModel({ baseModelId: "qwither_2", modelCatalog: null, money: 100, dataTokens: 0, shopPriceMultiplier: 1 }),
    ).toEqual({ unlocked: false, reason: "Need $2000 to unlock Qwither 2 32B" });
  });

  test("unlocks a licensed model by paying money, applying the shop price multiplier", () => {
    expect(
      decideUnlockBaseModel({ baseModelId: "qwither_2", modelCatalog: null, money: 5000, dataTokens: 0, shopPriceMultiplier: 0.9 }),
    ).toEqual({ unlocked: true, alreadyUnlocked: false, payment: "money", amount: 1800 });
  });
});

describe("decideRenameModel", () => {
  test("trims surrounding whitespace", () => {
    expect(decideRenameModel("  Sage Forge  ")).toEqual({ renamed: true, name: "Sage Forge" });
  });

  test("rejects an empty name", () => {
    expect(decideRenameModel("")).toEqual({ renamed: false, reason: "Name cannot be empty" });
  });

  test("rejects a name that is only whitespace", () => {
    expect(decideRenameModel("   ")).toEqual({ renamed: false, reason: "Name cannot be empty" });
  });

  test("truncates names past the max length", () => {
    const longName = "x".repeat(MODEL_NAME_MAX_LENGTH + 10);
    const decision = decideRenameModel(longName);
    expect(decision).toEqual({ renamed: true, name: "x".repeat(MODEL_NAME_MAX_LENGTH) });
  });

  test("leaves a name at exactly the max length untouched", () => {
    const exactName = "y".repeat(MODEL_NAME_MAX_LENGTH);
    expect(decideRenameModel(exactName)).toEqual({ renamed: true, name: exactName });
  });
});
