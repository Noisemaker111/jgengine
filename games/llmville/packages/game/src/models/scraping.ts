import { BASE_MODELS, type BaseModelDefinition } from "./baseModels";

export interface ScrapingModelStats {
  tokensPerToken: number;
}

export interface ModelCatalogLike {
  [baseModelId: string]: { isUnlocked?: boolean } | undefined;
}

export interface PlayerModelLike {
  launchState: string;
  isLicensedBaseServe?: boolean;
  baseModelId?: string;
  tokensPerToken: number;
}

function isScrapeCapableBase(base: Pick<BaseModelDefinition, "trainingMethod">): boolean {
  return base.trainingMethod !== "distill";
}

function isDistillDerived(baseModelId: string | undefined): boolean {
  const base = BASE_MODELS.find((candidate) => candidate.id === baseModelId);
  return base !== undefined && !isScrapeCapableBase(base);
}

export function isBaseModelUnlockedForGame(
  gameCatalog: ModelCatalogLike | null | undefined,
  baseModel: BaseModelDefinition,
): boolean {
  if (
    baseModel.sourceType === "open_source"
    && baseModel.licenseCost <= 0
    && baseModel.availability !== "research_locked"
  ) {
    return true;
  }
  return gameCatalog?.[baseModel.id]?.isUnlocked === true;
}

export function collectCatalogScrapingSources(
  gameCatalog: ModelCatalogLike | null | undefined,
): ScrapingModelStats[] {
  return BASE_MODELS
    .filter((base) => isScrapeCapableBase(base) && isBaseModelUnlockedForGame(gameCatalog, base))
    .map((base) => ({ tokensPerToken: base.tokensPerToken }));
}

export function collectPlayerScrapingSources(models: readonly PlayerModelLike[]): ScrapingModelStats[] {
  return models
    .filter(
      (model) =>
        model.isLicensedBaseServe !== true && model.launchState === "owned" && !isDistillDerived(model.baseModelId),
    )
    .map((model) => ({ tokensPerToken: model.tokensPerToken }));
}

export function collectScrapingModelSources(
  gameCatalog: ModelCatalogLike | null | undefined,
  playerModels: readonly PlayerModelLike[] = [],
): ScrapingModelStats[] {
  return [...collectCatalogScrapingSources(gameCatalog), ...collectPlayerScrapingSources(playerModels)];
}

export function hasScrapingModelAvailable(
  gameCatalog: ModelCatalogLike | null | undefined,
  playerModels: readonly PlayerModelLike[] = [],
): boolean {
  return collectScrapingModelSources(gameCatalog, playerModels).length > 0;
}

/** Licensed cheap bases meant for scraping, not fine-tuning your own weights. */
export function isScrapeFocusedBaseModel(
  model: Pick<BaseModelDefinition, "licenseCost" | "requiredDataTokens" | "trainingMethod">,
): boolean {
  return model.licenseCost > 0 && model.requiredDataTokens <= 0 && model.trainingMethod === "fine_tune";
}

export function hasLicensedScraperModel(gameCatalog: ModelCatalogLike | null | undefined): boolean {
  return BASE_MODELS.some(
    (base) => isScrapeFocusedBaseModel(base) && isBaseModelUnlockedForGame(gameCatalog, base),
  );
}

export function pickBestScrapingSource(sources: readonly ScrapingModelStats[]): ScrapingModelStats | null {
  if (sources.length === 0) return null;
  return sources.reduce((best, current) => (current.tokensPerToken > best.tokensPerToken ? current : best));
}

/** Data-per-token of the best source the player can point at the scrape lane. */
export function bestScrapingTokensPerToken(
  gameCatalog: ModelCatalogLike | null | undefined,
  playerModels: readonly PlayerModelLike[] = [],
): number {
  const best = pickBestScrapingSource(collectScrapingModelSources(gameCatalog, playerModels));
  return best === null ? 0 : best.tokensPerToken;
}
