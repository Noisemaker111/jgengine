import type { ComputePrecision } from "@llmville/game/infrastructure/catalog";

/** Fallback size for models trained before paramsB was tracked. */
export const DEFAULT_MODEL_PARAMS_B = 7;

export interface QuantizationProfile {
  precision: ComputePrecision;
  label: string;
  /** Bytes per parameter at this precision (fp16=2, fp8=1, fp4=0.5). */
  bytesPerParam: number;
  /** Inference throughput multiplier vs FP16 on precision-capable hardware. */
  throughputMult: number;
  /** Output-quality multiplier — lower precision trades a little accuracy (and $/token). */
  qualityMult: number;
  /** Representative method name for UI/flavor. */
  method: string;
}

const QUANTIZATION_PROFILES: Record<ComputePrecision, QuantizationProfile> = {
  fp16: { precision: "fp16", label: "FP16 (full precision)", bytesPerParam: 2, throughputMult: 1, qualityMult: 1, method: "unquantized" },
  fp8: { precision: "fp8", label: "FP8", bytesPerParam: 1, throughputMult: 1.8, qualityMult: 0.97, method: "FP8 / AWQ" },
  fp4: { precision: "fp4", label: "FP4 / INT4", bytesPerParam: 0.5, throughputMult: 3, qualityMult: 0.9, method: "NVFP4 / GPTQ" },
};

/** KV-cache + runtime overhead on top of raw weights. */
export const MODEL_VRAM_OVERHEAD = 1.2;

export function getQuantizationProfile(precision: ComputePrecision | undefined | null): QuantizationProfile {
  return QUANTIZATION_PROFILES[precision ?? "fp16"] ?? QUANTIZATION_PROFILES.fp16;
}

/** VRAM (GB) to serve a model: params × bytes/param × overhead. Quantizing is how a big model fits a small box. */
export function computeModelVramFootprintGb(paramsB: number, precision: ComputePrecision | undefined | null): number {
  const profile = getQuantizationProfile(precision);
  return Math.max(0.1, Math.max(0, paramsB) * profile.bytesPerParam * MODEL_VRAM_OVERHEAD);
}
