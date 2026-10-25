import type { ModelQualityTierId } from "@llmville/game/models/modelQuality";

import { BASE_MODEL_TRAINING_REFERENCE_DURATION_MS } from "./trainingEconomy";

export const BASE_MODEL_SOURCE_TYPE_VALUES = ["open_source", "closed_source"] as const;
export const BASE_MODEL_TRAINING_METHOD_VALUES = ["fine_tune", "distill"] as const;
export const BASE_MODEL_AVAILABILITY_VALUES = ["available", "research_locked"] as const;
export const BASE_MODEL_ID_VALUES = [
  "alpaca_1",
  "llamma_3",
  "alpaca_2",
  "qwither_2",
  "mistrale_moe",
  "deepsheik_r1",
  "gipitty_1_mini_extra_high_fast",
  "claudia_3",
  "geminiii_2_flashy",
] as const;

export type BaseModelSourceType = (typeof BASE_MODEL_SOURCE_TYPE_VALUES)[number];
export type BaseModelTrainingMethod = (typeof BASE_MODEL_TRAINING_METHOD_VALUES)[number];
export type BaseModelAvailability = (typeof BASE_MODEL_AVAILABILITY_VALUES)[number];
export type BaseModelId = (typeof BASE_MODEL_ID_VALUES)[number];

/** The cheap licensed "bad model" used for internet scraping to generate data tokens. */
export const BOOTSTRAP_SCRAPER_BASE_MODEL_ID = "alpaca_1" as const;

export interface BaseModelDefinition {
  id: string;
  name: string;
  creator: string;
  description: string;
  /** Minimum data tokens to commit for open fine-tune; closed distill may use 0 with {@link distillPoolTokens}. */
  requiredDataTokens: number;
  /** Catalog copy only: card/detail hint seconds. Live job length uses data drain or distill pool vs TPS×TFLOPs (server). */
  trainingDurationMs: number;
  tier: ModelQualityTierId | "community";
  licenseCost: number;
  sourceType: BaseModelSourceType;
  trainingMethod: BaseModelTrainingMethod;
  availability: BaseModelAvailability;
  /** Model size in billions of parameters; drives VRAM footprint and quantization tradeoffs. */
  paramsB: number;
  /** $ earned per inference token (product-facing “money / token”). */
  moneyPerToken: number;
  /** Throughput per 1 TFLOP allocated (inference tokens / second @ 1 TFLOP). */
  tokensPerSecond: number;
  /** Data tokens gained per inference token served (open path); closed distilling uses this vs distill pool. */
  tokensPerToken: number;
  /** Marketing family (Llamma, Qwither, DeepSheik, …) for grouping + flavor. */
  family?: string;
  /** Context window in thousands of tokens. */
  contextK?: number;
  /** Headline benchmark score (~0–100); flavor now, demand signal later. */
  benchmarkScore?: number;
  /** Reasoning / test-time-compute model (chain-of-thought). */
  isReasoning?: boolean;
  /** MoE active params per token (billions); absent = dense. */
  activeParamsB?: number;
  /** Flavor: teacher size for a closed model you distill down from. */
  teacherParamsB?: number;
  /** Closed-source distilling: total pool size in inference-token units before reveal. */
  distillPoolTokens?: number;
  /** Closed-source distilling: vendor access charged per in-game hour while the job runs. */
  vendorHourlyUsd?: number;

  /** One-time data-token cost to unlock research_locked models. */
  researchUnlockDataTokens?: number;
}

/** Display label for training volume on base models; mechanics use {@link BaseModelDefinition.requiredDataTokens}. */
export function formatBaseModelTrainingVolumeLabel(
  model: Pick<BaseModelDefinition, "requiredDataTokens" | "distillPoolTokens" | "trainingMethod">,
): string {
  if (model.trainingMethod === "distill" && model.requiredDataTokens <= 0 && (model.distillPoolTokens ?? 0) > 0) {
    return `${(model.distillPoolTokens ?? 0).toLocaleString()} pool`;
  }
  if (model.requiredDataTokens <= 0) return "No minimum";
  return `${model.requiredDataTokens.toLocaleString()} min data`;
}

export const BASE_MODELS: readonly BaseModelDefinition[] = [
  {
    id: "alpaca_1",
    name: "Alpaca 1",
    creator: "Stanferd AI",
    description: "License (~$200) a purpose-built scraper: 2.5× the data-per-token of the free starter model on every scraping GPU. Use earned tokens to fine-tune your own closed models (which you serve for money).",
    requiredDataTokens: 0, // bootstrap scraper: license cheaply and allocate TFLOPs to scraping to farm tokens (no data needed initially)
    trainingDurationMs: BASE_MODEL_TRAINING_REFERENCE_DURATION_MS,
    tier: "community",
    licenseCost: 200,
    sourceType: "open_source",
    trainingMethod: "fine_tune",
    availability: "available",
    benchmarkScore: 50,
    paramsB: 7,
    moneyPerToken: 0.05,
    tokensPerSecond: 5,
    tokensPerToken: 0.03,
  },
  {
    id: "llamma_3",
    name: "Llamma 3 Mini",
    creator: "Meta Mind",
    description: "A compact 2B starter that fits one entry-level GPU. Train your first model while another GPU gathers data.",
    requiredDataTokens: 500,
    trainingDurationMs: BASE_MODEL_TRAINING_REFERENCE_DURATION_MS,
    tier: "community",
    licenseCost: 0,
    sourceType: "open_source",
    trainingMethod: "fine_tune",
    availability: "available",
    family: "Llamma",
    contextK: 128,
    benchmarkScore: 62,
    paramsB: 2,
    moneyPerToken: 0.06,
    tokensPerSecond: 6,
    tokensPerToken: 0.012,
  },
  {
    id: "alpaca_2",
    name: "Alpaca 2",
    creator: "Stanferd AI",
    description: "A stronger sequel, but the lab still needs to unlock the research path before using it.",
    requiredDataTokens: 5000,
    trainingDurationMs: BASE_MODEL_TRAINING_REFERENCE_DURATION_MS,
    tier: "community",
    licenseCost: 0,
    sourceType: "open_source",
    trainingMethod: "fine_tune",
    availability: "research_locked",
    researchUnlockDataTokens: 5000,
    benchmarkScore: 58,
    paramsB: 13,
    moneyPerToken: 0.06,
    tokensPerSecond: 6,
    tokensPerToken: 0.012,
  },
  {
    id: "qwither_2",
    name: "Qwither 2 32B",
    creator: "Alibobo Cloud",
    description: "Strong open multilingual base. License once, then fine-tune. Heavier to serve than 8B.",
    requiredDataTokens: 8000,
    trainingDurationMs: BASE_MODEL_TRAINING_REFERENCE_DURATION_MS,
    tier: "uncommon",
    licenseCost: 2000,
    sourceType: "open_source",
    trainingMethod: "fine_tune",
    availability: "available",
    family: "Qwither",
    contextK: 128,
    benchmarkScore: 71,
    paramsB: 32,
    moneyPerToken: 0.09,
    tokensPerSecond: 7,
    tokensPerToken: 0.014,
  },
  {
    id: "mistrale_moe",
    name: "Mistrale 8x22B (MoE)",
    creator: "Mistrale AI",
    description: "Sparse mixture-of-experts: 141B total, ~39B active per token. Big VRAM, strong quality.",
    requiredDataTokens: 15000,
    trainingDurationMs: BASE_MODEL_TRAINING_REFERENCE_DURATION_MS,
    tier: "rare",
    licenseCost: 6000,
    sourceType: "open_source",
    trainingMethod: "fine_tune",
    availability: "available",
    family: "Mistrale",
    contextK: 64,
    benchmarkScore: 75,
    paramsB: 141,
    activeParamsB: 39,
    moneyPerToken: 0.13,
    tokensPerSecond: 9,
    tokensPerToken: 0.016,
  },
  {
    id: "deepsheik_r1",
    name: "DeepSheik R1 (reasoning)",
    creator: "DeepSheik",
    description: "671B MoE reasoning model, ~37B active. Open weights, research-locked. Enormous footprint — quantize it.",
    requiredDataTokens: 40000,
    trainingDurationMs: BASE_MODEL_TRAINING_REFERENCE_DURATION_MS,
    tier: "sota",
    licenseCost: 0,
    sourceType: "open_source",
    trainingMethod: "fine_tune",
    availability: "research_locked",
    researchUnlockDataTokens: 50000,
    family: "DeepSheik",
    contextK: 128,
    benchmarkScore: 88,
    isReasoning: true,
    paramsB: 671,
    activeParamsB: 37,
    moneyPerToken: 0.22,
    tokensPerSecond: 12,
    tokensPerToken: 0.02,
  },
  {
    id: "gipitty_1_mini_extra_high_fast",
    name: "Gipitty 1 Mini Extra High Fast",
    creator: "Gipitty Labs",
    description: "Closed-source fast stack. License access, pay vendor time while distilling, then reveal your copy.",
    requiredDataTokens: 0,
    trainingDurationMs: 90_000,
    tier: "rare",
    licenseCost: 10000,
    sourceType: "closed_source",
    trainingMethod: "distill",
    availability: "available",
    benchmarkScore: 68,
    paramsB: 8,
    moneyPerToken: 0.1,
    tokensPerSecond: 20,
    tokensPerToken: 1,
    distillPoolTokens: 100_000,
    vendorHourlyUsd: 350,
  },
  {
    id: "claudia_3",
    name: "Claudia 3.5 (distill)",
    creator: "Anthropofic",
    description: "Closed reasoning frontier. License access, pay vendor time, distill a compact student you own.",
    requiredDataTokens: 0,
    trainingDurationMs: 90_000,
    tier: "sota",
    licenseCost: 15000,
    sourceType: "closed_source",
    trainingMethod: "distill",
    availability: "available",
    family: "Claudia",
    contextK: 200,
    benchmarkScore: 90,
    isReasoning: true,
    teacherParamsB: 400,
    paramsB: 14,
    moneyPerToken: 0.16,
    tokensPerSecond: 22,
    tokensPerToken: 1,
    distillPoolTokens: 150_000,
    vendorHourlyUsd: 500,
  },
  {
    id: "geminiii_2_flashy",
    name: "Geminiii 2 Flashy (distill)",
    creator: "Goggle DeepMind",
    description: "Closed long-context API. Distill a fast, cheap student with a million-token window.",
    requiredDataTokens: 0,
    trainingDurationMs: 90_000,
    tier: "sota",
    licenseCost: 18000,
    sourceType: "closed_source",
    trainingMethod: "distill",
    availability: "available",
    family: "Geminiii",
    contextK: 1000,
    benchmarkScore: 89,
    teacherParamsB: 500,
    paramsB: 20,
    moneyPerToken: 0.18,
    tokensPerSecond: 24,
    tokensPerToken: 1,
    distillPoolTokens: 180_000,
    vendorHourlyUsd: 600,
  },
] as const;

export function getBaseModelDefinition(id: string): BaseModelDefinition | undefined {
  return BASE_MODELS.find((model) => model.id === id);
}

export function getResearchUnlockDataTokens(model: BaseModelDefinition): number {
  return model.researchUnlockDataTokens ?? model.requiredDataTokens;
}
