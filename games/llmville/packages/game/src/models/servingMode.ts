export const SERVING_MODE_VALUES = ["realtime", "balanced", "batch"] as const;

export type ServingModeId = (typeof SERVING_MODE_VALUES)[number];

export const DEFAULT_SERVING_MODE: ServingModeId = "balanced";

export interface ServingModeProfile {
  mode: ServingModeId;
  label: string;
  latencyLabel: string;
  description: string;
  throughputMult: number;
  revenueMult: number;
}

export const SERVING_MODE_PROFILES: Record<ServingModeId, ServingModeProfile> = {
  realtime: { mode: "realtime", label: "Realtime API", latencyLabel: "Low latency", description: "Premium low-latency serving. Small batches, top $/token, less throughput.", throughputMult: 0.7, revenueMult: 1.5 },
  balanced: { mode: "balanced", label: "Balanced", latencyLabel: "Medium latency", description: "A sensible default mix of latency, price, and throughput.", throughputMult: 1, revenueMult: 1 },
  batch: { mode: "batch", label: "Batch API", latencyLabel: "High latency", description: "Max throughput, half-price tokens. Great when you want volume and data tokens.", throughputMult: 1.6, revenueMult: 0.6 },
};

export function getServingModeProfile(mode: ServingModeId | undefined | null): ServingModeProfile {
  return SERVING_MODE_PROFILES[mode ?? DEFAULT_SERVING_MODE] ?? SERVING_MODE_PROFILES.balanced;
}

export const MODEL_LAUNCH_STATE_VALUES = ["owned", "serving"] as const;

export type ModelLaunchState = (typeof MODEL_LAUNCH_STATE_VALUES)[number];
