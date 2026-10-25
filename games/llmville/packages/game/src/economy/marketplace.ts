import { BASE_MODELS, getBaseModelDefinition, type BaseModelDefinition } from "@llmville/game/models/baseModels";
import {
  computeModelVramFootprintGb,
  DEFAULT_MODEL_PARAMS_B,
} from "@llmville/game/models/quantization";
import { getHostingRevenueShare } from "@llmville/game/economy/reputation";

export interface VendorHostingOpportunity {
  vendorModelId: string;
  name: string;
  creator: string;
  description: string;
  benchmarkScore: number;
  paramsB: number;
  isReasoning: boolean;
  moneyPerToken: number;
  tokensPerSecond: number;
  tokensPerToken: number;
  /** Default host share at 0 reputation; actual share scales with reputation. */
  baseRevenueShareHost: number;
}

const HOSTING_BENCHMARK_MIN = 68;

function isVendorHostingCandidate(model: BaseModelDefinition): boolean {
  if (model.sourceType === "closed_source") return true;
  const score = model.benchmarkScore ?? 0;
  return (model.tier === "sota" || model.tier === "rare") && score >= HOSTING_BENCHMARK_MIN;
}

export function listVendorHostingOpportunities(): readonly VendorHostingOpportunity[] {
  return BASE_MODELS.filter(isVendorHostingCandidate).map((model) => ({
    vendorModelId: model.id,
    name: model.name,
    creator: model.creator,
    description: model.description,
    benchmarkScore: model.benchmarkScore ?? 50,
    paramsB: model.paramsB,
    isReasoning: model.isReasoning === true,
    moneyPerToken: model.moneyPerToken,
    tokensPerSecond: model.tokensPerSecond,
    tokensPerToken: model.tokensPerToken,
    baseRevenueShareHost: getHostingRevenueShare(0),
  }));
}

export function getVendorHostingOpportunity(
  vendorModelId: string,
): VendorHostingOpportunity | undefined {
  return listVendorHostingOpportunities().find((entry) => entry.vendorModelId === vendorModelId);
}

export function resolveHostingRevenueShare(
  reputation: number,
  requestedShare?: number,
): number {
  const maxShare = getHostingRevenueShare(reputation);
  if (requestedShare === undefined) return maxShare;
  return Math.max(0.3, Math.min(maxShare, requestedShare));
}

export function getHostedVendorModelDefinition(vendorModelId: string): BaseModelDefinition | undefined {
  const opportunity = getVendorHostingOpportunity(vendorModelId);
  if (!opportunity) return undefined;
  return getBaseModelDefinition(vendorModelId);
}

export interface StartHostingInputs {
  vendorModelId: string;
  existingVendorModelIds: readonly string[];
  totalVramGb: number;
  reputation: number;
  requestedRevenueShare?: number;
}

export type StartHostingDecision =
  | { started: false; reason: string }
  | { started: true; revenueShareHost: number };

export function decideStartHosting(inputs: StartHostingInputs): StartHostingDecision {
  const opportunity = getVendorHostingOpportunity(inputs.vendorModelId);
  if (!opportunity) return { started: false, reason: "Model is not available for hosting" };

  const vendor = getHostedVendorModelDefinition(inputs.vendorModelId);
  if (!vendor) return { started: false, reason: "Unknown vendor model" };

  if (inputs.existingVendorModelIds.includes(inputs.vendorModelId)) {
    return { started: false, reason: "Already hosting this model" };
  }

  const footprintGb = computeModelVramFootprintGb(vendor.paramsB ?? DEFAULT_MODEL_PARAMS_B, "fp16");
  if (footprintGb > inputs.totalVramGb) {
    return {
      started: false,
      reason: `Needs ${footprintGb.toFixed(0)} GB VRAM to host, only ${inputs.totalVramGb.toFixed(0)} GB installed`,
    };
  }

  return {
    started: true,
    revenueShareHost: resolveHostingRevenueShare(inputs.reputation, inputs.requestedRevenueShare),
  };
}
