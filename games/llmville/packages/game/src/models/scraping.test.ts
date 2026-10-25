import { describe, expect, test } from "bun:test";
import {
  bestScrapingTokensPerToken,
  hasLicensedScraperModel,
  hasScrapingModelAvailable,
} from "@llmville/game/models/scraping";
import { getBaseModelDefinition } from "@llmville/game/models/baseModels";

describe("scraping sources", () => {
  test("the free starter model scrapes but is not a licensed scraper", () => {
    expect(hasScrapingModelAvailable(undefined)).toBe(true);
    expect(hasLicensedScraperModel(undefined)).toBe(false);
  });

  test("licensing Alpaca 1 beats every free source", () => {
    expect(hasLicensedScraperModel({ alpaca_1: { isUnlocked: true } })).toBe(true);
    expect(bestScrapingTokensPerToken({ alpaca_1: { isUnlocked: true } })).toBe(
      getBaseModelDefinition("alpaca_1")!.tokensPerToken,
    );
    expect(bestScrapingTokensPerToken({ alpaca_1: { isUnlocked: true } })).toBeGreaterThan(
      bestScrapingTokensPerToken(undefined),
    );
  });

  test("a better owned model outranks the catalog", () => {
    expect(
      bestScrapingTokensPerToken(undefined, [{ launchState: "owned", tokensPerToken: 0.4 }]),
    ).toBe(0.4);
    expect(
      bestScrapingTokensPerToken(undefined, [{ launchState: "serving", tokensPerToken: 0.4 }]),
    ).toBe(bestScrapingTokensPerToken(undefined));
  });

  test("distill bases and their descendants never count as scrapers", () => {
    const baseline = bestScrapingTokensPerToken(undefined);
    expect(bestScrapingTokensPerToken({ claudia_3: { isUnlocked: true } })).toBe(baseline);
    expect(
      bestScrapingTokensPerToken(undefined, [{ launchState: "owned", baseModelId: "claudia_3", tokensPerToken: 1 }]),
    ).toBe(baseline);
  });
});
