import {
  hasLicensedScraperModel,
  type ModelCatalogLike,
  type PlayerModelLike,
} from "../models/scraping";
import { getBaseModelDefinition } from "../models/baseModels";

export const REQUIRED_TUTORIAL_GPU_COUNT = 2;
export const TUTORIAL_TRAIN_BASE_MODEL_ID = "llamma_3";
export const MIN_SCRAPED_DATA_TOKENS = getBaseModelDefinition(TUTORIAL_TRAIN_BASE_MODEL_ID)!.requiredDataTokens;
/** Cheapest paid scraper license — the tutorial requires owning one before scraping. */
export const TUTORIAL_SCRAPE_MODEL_ID = "alpaca_1";

export interface TutorialModelSignal extends PlayerModelLike {
  isRevealed?: boolean;
}

export interface TutorialWorldSignals {
  rackPlaced: boolean;
  ownedGpuCount: number;
  installedGpuCount: number;
  hasLicensedScraper: boolean;
  dataTokens: number;
  scrapingAllocated: boolean;
  fineTunedModelCount: number;
  hasRevealedPlayerModel: boolean;
  playerServingModelCount: number;
}

export function isPlayerOwnedModel(model: TutorialModelSignal): boolean {
  return model.isLicensedBaseServe !== true;
}

export function deriveTutorialWorldSignals({
  rackPlaced,
  ownedGpuCount,
  installedGpuCount,
  modelCatalog,
  dataTokens,
  scrapingGpuCount,
  servingIncomeRate = 0,
  models,
}: {
  rackPlaced: boolean;
  ownedGpuCount: number;
  installedGpuCount: number;
  modelCatalog?: ModelCatalogLike | null;
  dataTokens: number;
  /** GPUs dedicated to the scraping lane (per-card model). */
  scrapingGpuCount?: number | null;
  servingIncomeRate?: number;
  models: readonly TutorialModelSignal[];
}): TutorialWorldSignals {
  const playerModels = models.filter(isPlayerOwnedModel);
  const hasLicensedScraper = hasLicensedScraperModel(modelCatalog);
  const scrapingAllocated = (scrapingGpuCount ?? 0) >= 1;

  return {
    rackPlaced,
    ownedGpuCount: Math.max(0, Math.floor(ownedGpuCount)),
    installedGpuCount: Math.max(0, Math.floor(installedGpuCount)),
    hasLicensedScraper,
    dataTokens: Math.max(0, Math.floor(dataTokens)),
    scrapingAllocated,
    fineTunedModelCount: playerModels.length,
    hasRevealedPlayerModel: playerModels.some((model) => model.isRevealed === true),
    playerServingModelCount: servingIncomeRate > 0 ? playerModels.filter((model) => model.launchState === "serving").length : 0,
  };
}
