import type { WorldActionDecl, WorldFactsDecl, WorldModel } from "@jgengine/core/worldModel/worldModel";
import { upgradePathActions, upgradePathFacts, type UpgradePathsDecl } from "@jgengine/core/worldModel/upgradePaths";

import type { BuildableDef } from "./objects/catalog";

export const REFIT_SHARE = 0.4;

export const REFITS = {
  efficient: { label: "Efficient refit", upkeep: -0.3, wear: -0.4, capacity: 0, service: 0, appeal: -0.5 },
  premium: { label: "Premium refit", upkeep: 0.5, wear: 0.25, capacity: 0.5, service: 0.15, appeal: 1.5 },
} as const;

export type RefitId = keyof typeof REFITS;

export const SHUT_UPKEEP = 0.25;

/** Park seconds a shut ride takes to wear off one run. */
export const REFURB_SECONDS = 6;

export const RIDE_RUN_FACTS: WorldFactsDecl = {
  upkeep_scale: 1,
  wear_scale: 1,
  capacity_scale: 1,
  service_scale: 1,
  refit_appeal: 0,
  shut: false,
  upkeep_delta: 0,
};

const FACT_NAMES = { tier: "refit_tier", branch: "refit", branchTier: "refit_step" } as const;

function percent(share: number): string {
  return `${share > 0 ? "+" : ""}${Math.round(share * 100)}%`;
}

function refitDetail(id: RefitId): string {
  const refit = REFITS[id];
  const parts: string[] = [];
  if (refit.capacity !== 0) parts.push(`${percent(refit.capacity)} seats`);
  parts.push(`${refit.appeal > 0 ? "+" : ""}${refit.appeal} appeal`, `${percent(refit.upkeep)} upkeep`, `${percent(refit.wear)} wear`);
  if (refit.service !== 0) parts.push(`${percent(refit.service)} boarding`);
  return parts.join(", ");
}

export function refitLadder(def: BuildableDef): UpgradePathsDecl {
  const price = Math.round(def.cost * REFIT_SHARE);
  const branch = (id: RefitId) => {
    const refit = REFITS[id];
    return {
      id,
      label: refit.label,
      detail: refitDetail(id),
      steps: [{
        label: refit.label,
        detail: refitDetail(id),
        // Booked with building and land, the books' remainder line.
        cost: { "park.cash": -price },
        effect: { upkeep_scale: refit.upkeep, wear_scale: refit.wear, capacity_scale: refit.capacity, service_scale: refit.service, refit_appeal: refit.appeal },
        note: `{target}: ${refit.label.toLowerCase()} done.`,
        refuse: "This ride has had its refit",
      }],
    };
  };
  return { kind: def.id, branches: [branch("efficient"), branch("premium")], facts: FACT_NAMES };
}

export function rideRunFacts(def: BuildableDef): WorldFactsDecl {
  return { ...RIDE_RUN_FACTS, ...upgradePathFacts(refitLadder(def)) };
}

export const shutAction = (kind: string): string => `shut_${kind}`;
export const reopenAction = (kind: string): string => `reopen_${kind}`;

export function rideRunActions(def: BuildableDef): Record<string, WorldActionDecl> {
  return {
    ...upgradePathActions(refitLadder(def)),
    [shutAction(def.id)]: {
      label: `Close the ${def.label} for refurbishment`,
      on: def.id,
      whenTarget: { shut: false, broken: false },
      refuse: "Only a working, open ride can close for refurbishment",
      effect: { shut: true },
      note: "The {target} is closed for refurbishment.",
    },
    [reopenAction(def.id)]: {
      label: `Reopen the ${def.label}`,
      on: def.id,
      whenTarget: { shut: true },
      refuse: "The ride is not closed",
      effect: { shut: false },
      note: "The {target} is open again.",
    },
  };
}

export function refitOf(w: WorldModel, id: string): RefitId | null {
  const taken = w.fact(`${id}.${FACT_NAMES.branch}`);
  return taken === "efficient" || taken === "premium" ? taken : null;
}

export const isShut = (w: WorldModel, id: string): boolean => w.fact(`${id}.shut`) === true;

export function rideUpkeep(w: WorldModel, id: string, def: BuildableDef): number {
  return def.upkeep * w.num(`${id}.upkeep_scale`) * (isShut(w, id) ? SHUT_UPKEEP : 1);
}

export function retuneRideUpkeep(w: WorldModel, id: string, def: BuildableDef): void {
  const delta = Math.round((rideUpkeep(w, id, def) - def.upkeep) * 100) / 100;
  if (w.num(`${id}.upkeep_delta`) !== delta) w.set(`${id}.upkeep_delta`, delta);
}
