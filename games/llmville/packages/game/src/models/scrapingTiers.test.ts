import { describe, expect, test } from "bun:test";
import {
  accrueScrapeTokens,
  computeScrapeTokensPerProc,
  isScrapeTierRunnable,
  REFERENCE_SCRAPE_TOKENS_PER_TOKEN,
  SCRAPE_TICK_INTERVAL_MS,
  SCRAPE_TIERS,
  STARTER_SCRAPE_TFLOPS,
} from "@llmville/game/models/scrapingTiers";
import { bestScrapingTokensPerToken } from "@llmville/game/models/scraping";

const FREE = REFERENCE_SCRAPE_TOKENS_PER_TOKEN;
const FOUR_MID_CARDS = 480;
const EIGHT_HIGH_CARDS = 4992;

describe("computeScrapeTokensPerProc", () => {
  test("one starter card on the free model keeps the book tier at its base rate", () => {
    expect(computeScrapeTokensPerProc("books", STARTER_SCRAPE_TFLOPS, FREE)).toBe(50);
  });

  test("scales sub-linearly with scraping-lane compute", () => {
    const fourMid = computeScrapeTokensPerProc("books", FOUR_MID_CARDS, FREE);
    expect(fourMid).toBe(330);
    expect(fourMid / 50).toBeGreaterThan(5);
    expect(fourMid / 50).toBeLessThan(10);
    expect(computeScrapeTokensPerProc("books", EIGHT_HIGH_CARDS, FREE)).toBe(1065);
  });

  test("a licensed scraper multiplies yield by its data-per-token edge", () => {
    const licensed = bestScrapingTokensPerToken({ alpaca_1: { isUnlocked: true } });
    expect(licensed).toBeGreaterThan(FREE);
    expect(computeScrapeTokensPerProc("books", STARTER_SCRAPE_TFLOPS, licensed)).toBe(125);
  });

  test("higher tiers pay more but only above their compute gate", () => {
    expect(computeScrapeTokensPerProc("internet", STARTER_SCRAPE_TFLOPS, FREE)).toBe(0);
    expect(computeScrapeTokensPerProc("internet", FOUR_MID_CARDS, FREE)).toBe(1321);
    expect(computeScrapeTokensPerProc("synthetic", FOUR_MID_CARDS, FREE)).toBe(0);
    expect(computeScrapeTokensPerProc("synthetic", EIGHT_HIGH_CARDS, FREE)).toBe(12782);
  });

  test("tier ladder rises with its gate", () => {
    expect(SCRAPE_TIERS.internet.baseTokensPerProc).toBe(4 * SCRAPE_TIERS.books.baseTokensPerProc);
    expect(SCRAPE_TIERS.synthetic.baseTokensPerProc).toBe(12 * SCRAPE_TIERS.books.baseTokensPerProc);
    expect(SCRAPE_TIERS.synthetic.tflopThreshold).toBeGreaterThan(SCRAPE_TIERS.internet.tflopThreshold);
    expect(isScrapeTierRunnable("internet", FOUR_MID_CARDS)).toBe(true);
    expect(isScrapeTierRunnable("internet", 399)).toBe(false);
  });
});

describe("accrueScrapeTokens", () => {
  test("catches up on every whole interval elapsed and keeps the remainder", () => {
    const accrual = accrueScrapeTokens("books", STARTER_SCRAPE_TFLOPS, FREE, SCRAPE_TICK_INTERVAL_MS * 3 + 400);
    expect(accrual).toEqual({ procs: 3, tokens: 150, consumedMs: SCRAPE_TICK_INTERVAL_MS * 3 });
  });

  test("yields nothing without a source model or below one interval", () => {
    expect(accrueScrapeTokens("books", STARTER_SCRAPE_TFLOPS, 0, 60_000).tokens).toBe(0);
    expect(accrueScrapeTokens("books", STARTER_SCRAPE_TFLOPS, FREE, 9_999).tokens).toBe(0);
  });
});
