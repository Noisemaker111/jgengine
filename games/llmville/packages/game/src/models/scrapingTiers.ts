export const SCRAPE_TIER_VALUES = ["books", "internet", "synthetic"] as const;
export type ScrapeTierId = (typeof SCRAPE_TIER_VALUES)[number];

export const DEFAULT_SCRAPE_TIER: ScrapeTierId = "books";

export const SCRAPE_TICK_INTERVAL_MS = 10_000;

/** FP16 TFLOPs of one starter card (GTX 1060): the yield curve's unit input. */
export const STARTER_SCRAPE_TFLOPS = 11;

/** Data-per-token of the free starter base model: the yield curve's unit source quality. */
export const REFERENCE_SCRAPE_TOKENS_PER_TOKEN = 0.012;

export interface ScrapeTierDef {
  id: ScrapeTierId;
  label: string;
  description: string;
  baseTokensPerProc: number;
  /** FP16 TFLOPs of scraping-dedicated cards required to run this tier. */
  tflopThreshold: number;
}

export const SCRAPE_TIERS: Record<ScrapeTierId, ScrapeTierDef> = {
  books: {
    id: "books",
    label: "Scrape books",
    description: "Crawl digitized libraries. Always available.",
    baseTokensPerProc: 50,
    tflopThreshold: 0,
  },
  internet: {
    id: "internet",
    label: "Scrape internet",
    description: "Crawl the open web. 4× the book yield.",
    baseTokensPerProc: 200,
    tflopThreshold: 400,
  },
  synthetic: {
    id: "synthetic",
    label: "Synthesize data",
    description: "Generate and filter your own corpus. 12× the book yield.",
    baseTokensPerProc: 600,
    tflopThreshold: 2000,
  },
};

export const SCRAPE_TIER_LIST: readonly ScrapeTierDef[] = SCRAPE_TIER_VALUES.map((id) => SCRAPE_TIERS[id]);

export function getScrapeTierDef(tier: ScrapeTierId | string | undefined | null): ScrapeTierDef {
  if (tier && tier in SCRAPE_TIERS) return SCRAPE_TIERS[tier as ScrapeTierId];
  return SCRAPE_TIERS[DEFAULT_SCRAPE_TIER];
}

/** A tier runs only when the scraping lane has any card AND clears the tier's TFLOP threshold. */
export function isScrapeTierRunnable(tier: ScrapeTierId, scrapeTflops: number): boolean {
  return scrapeTflops > 0 && scrapeTflops >= getScrapeTierDef(tier).tflopThreshold;
}

/** Sub-linear in lane compute, linear in the best licensed source's data-per-token. */
export function computeScrapeTokensPerProc(
  tier: ScrapeTierId,
  scrapeTflops: number,
  sourceTokensPerToken: number,
): number {
  if (!isScrapeTierRunnable(tier, scrapeTflops) || sourceTokensPerToken <= 0) return 0;
  const computeFactor = Math.sqrt(scrapeTflops / STARTER_SCRAPE_TFLOPS);
  const sourceFactor = sourceTokensPerToken / REFERENCE_SCRAPE_TOKENS_PER_TOKEN;
  return Math.max(0, Math.round(getScrapeTierDef(tier).baseTokensPerProc * computeFactor * sourceFactor));
}

export interface ScrapeAccrual {
  procs: number;
  tokens: number;
  /** Milliseconds actually consumed (procs × interval); advance the tick anchor by this, keeping the remainder. */
  consumedMs: number;
}

const NO_ACCRUAL: ScrapeAccrual = { procs: 0, tokens: 0, consumedMs: 0 };

export function accrueScrapeTokens(
  tier: ScrapeTierId,
  scrapeTflops: number,
  sourceTokensPerToken: number,
  elapsedMs: number,
): ScrapeAccrual {
  const tokensPerProc = computeScrapeTokensPerProc(tier, scrapeTflops, sourceTokensPerToken);
  if (tokensPerProc <= 0 || elapsedMs < SCRAPE_TICK_INTERVAL_MS) return NO_ACCRUAL;
  const procs = Math.floor(elapsedMs / SCRAPE_TICK_INTERVAL_MS);
  return {
    procs,
    tokens: procs * tokensPerProc,
    consumedMs: procs * SCRAPE_TICK_INTERVAL_MS,
  };
}
