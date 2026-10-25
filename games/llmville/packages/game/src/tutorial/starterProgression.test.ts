import { describe, expect, test } from "bun:test";
import { getDailyModifier } from "../economy/dailyMarket";
import { computeServingSnapshot } from "../economy/servingTick";
import { getBaseModelDefinition } from "../models/baseModels";
import { decideTrainingStart, estimatePostTrainingDurationSeconds } from "../models/trainingTransition";
import { DEFAULT_STARTING_MONEY } from "../world/worldBootstrap";
import { getFounderMultipliers } from "../user/founder";
import { getHardwareDefinition, getRackCatalogDefinition, STARTER_RACK_CATALOG_ID } from "../infrastructure/catalog";
import { getPlacementBounds } from "../build/build";
import { cellsForBounds } from "../datacenter/grid";
import { planFootprintClaims } from "../datacenter/claims";
const STARTER_GPU_ID = "gpu_1";
import { advanceTutorialNode, TUTORIAL_NODE } from "./tutorialMachine";
import { deriveTutorialWorldSignals, TUTORIAL_SCRAPE_MODEL_ID, TUTORIAL_TRAIN_BASE_MODEL_ID } from "./tutorialProgress";

const baseModel = getBaseModelDefinition(TUTORIAL_TRAIN_BASE_MODEL_ID)!;
const founder = getFounderMultipliers("sam_altman");
const racks = [{ rackId: "starter", rackType: "starter_rack", installedHardwareModuleIds: [STARTER_GPU_ID, STARTER_GPU_ID] }];
const signals = deriveTutorialWorldSignals({
  rackPlaced: true, ownedGpuCount: 2, installedGpuCount: 2,
  modelCatalog: { [TUTORIAL_SCRAPE_MODEL_ID]: { isUnlocked: true } },
  dataTokens: baseModel.requiredDataTokens, scrapingGpuCount: 1, models: [],
});

describe("starter progression", () => {
  test("starting money covers individually purchased equipment, footprint tiles, and scraper license", () => {
    const license = getBaseModelDefinition(TUTORIAL_SCRAPE_MODEL_ID)!;
    const equipmentCost = getRackCatalogDefinition(STARTER_RACK_CATALOG_ID).buyPrice + 2 * getHardwareDefinition(STARTER_GPU_ID).buyPrice;
    const tiles = planFootprintClaims({ cells: cellsForBounds(getPlacementBounds(STARTER_RACK_CATALOG_ID, { x: 10.5, z: 10.5 }, 0)), ownerGameId: "starter", claims: [], money: DEFAULT_STARTING_MONEY - equipmentCost - license.licenseCost });
    expect(tiles.ok).toBe(true);
    if (!tiles.ok) throw new Error(tiles.reason);
    expect(equipmentCost + license.licenseCost + tiles.totalCost).toBeLessThanOrEqual(DEFAULT_STARTING_MONEY);
  });

  test("waits for enough data for the actual training run", () => {
    expect(advanceTutorialNode(TUTORIAL_NODE.scrapeTokens, { ...signals, dataTokens: baseModel.requiredDataTokens - 1 }).node).toBe(TUTORIAL_NODE.scrapeTokens);
    expect(advanceTutorialNode(TUTORIAL_NODE.scrapeTokens, signals).node).toBe(TUTORIAL_NODE.fineTune);
  });

  test("keeps the paid scraper objective until the license is owned", () => {
    expect(advanceTutorialNode(TUTORIAL_NODE.licenseScraper, { ...signals, hasLicensedScraper: false }).node).toBe(TUTORIAL_NODE.licenseScraper);
    expect(advanceTutorialNode(TUTORIAL_NODE.licenseScraper, { ...signals, dataTokens: 0 }).node).toBe(TUTORIAL_NODE.scrapeTokens);
  });

  test("one starter GPU can train while the other collects data", () => {
    const result = decideTrainingStart({
      baseModel, isUnlocked: true, overtrainBracket: 1,
      gameDataTokens: baseModel.requiredDataTokens, hasActiveTraining: false,
      racks, computeAssignments: { "starter:0": { lane: "training" }, "starter:1": { lane: "scraping" } },
      tier: "garage", founder, trainingDurationMultiplier: 1,
      powerCapacityKw: 600, startedBy: "starter-player", now: 0,
    });
    expect(result.started).toBe(true);
    if (!result.started) throw new Error(result.reason);
    expect(result.reserveDataTokens).toBe(baseModel.requiredDataTokens);
    expect(result.spec.drainTokensPerSecond).toBeGreaterThan(0);
  });

  test("does not promise a completion time without training compute", () => {
    expect(estimatePostTrainingDurationSeconds({ baseModel, availableTrainingPowerFp16: 0 })).toBe(Infinity);
  });

  test("a starter GPU earns income and tutorial completion requires that income", () => {
    const model = { modelId: "first-model", tokensPerSecond: baseModel.tokensPerSecond, moneyPerToken: baseModel.moneyPerToken, tokensPerToken: baseModel.tokensPerToken, paramsB: baseModel.paramsB, precision: "fp16" as const, benchmarkScore: baseModel.benchmarkScore };
    const inputs = {
      racks, servingModels: [model], hostedModels: [], hasRunningTrainingJobs: false,
      servingMode: "realtime" as const, reputation: 0, servingStabilityBonus: 0,
      founderMultipliers: founder, frontierBenchmark: baseModel.benchmarkScore,
      dailyModifier: getDailyModifier(new Date("2026-09-05T12:00:00Z")), powerCapacityKw: 600,
    };
    const idle = computeServingSnapshot({ ...inputs, computeAssignments: {} });
    const serving = computeServingSnapshot({ ...inputs, computeAssignments: { "starter:0": { lane: "serving", targetModelId: model.modelId } } });
    expect(idle.servingGainPerSecond).toBe(0);
    expect(serving.servingGainPerSecond).toBeGreaterThan(0);
    const progress = (income: number) => deriveTutorialWorldSignals({
      rackPlaced: true, ownedGpuCount: 2, installedGpuCount: 2, dataTokens: 0,
      servingIncomeRate: income,
      models: [{ launchState: "serving", tokensPerToken: baseModel.tokensPerToken, isRevealed: true }],
    });
    expect(advanceTutorialNode(TUTORIAL_NODE.serve, progress(idle.servingGainPerSecond)).completed).toBe(false);
    expect(advanceTutorialNode(TUTORIAL_NODE.serve, progress(serving.servingGainPerSecond)).completed).toBe(true);
  });
});
