import type { ForkSpec } from "./catalog";

export function etaSeconds(remainingMeters: number, speedMps: number): number {
  if (remainingMeters <= 0) return 0;
  if (speedMps <= 0.05) return Number.POSITIVE_INFINITY;
  return remainingMeters / speedMps;
}

export interface ForkEta {
  readonly fastSeconds: number;
  readonly safeSeconds: number;
}

export function forkEtas(fork: ForkSpec, truckProgress: number, speedMps: number, fastGrip: number): ForkEta {
  const remaining = Math.max(0, fork.gateProgress - Math.max(truckProgress, fork.forkProgress));
  return {
    fastSeconds: etaSeconds(remaining, speedMps * fastGrip),
    safeSeconds: etaSeconds(remaining, speedMps),
  };
}
