/**
 * Canonical founder/avatar ids and gameplay balance. Used by web (`features/user`) and Convex.
 */

export const CANONICAL_AVATAR_IDS = [
  "sam_altman",
  "lee_rob",
  "elon_xai",
  "dario_amodei",
  "logan_kilpatrick",
] as const;

export type CanonicalAvatarId = (typeof CANONICAL_AVATAR_IDS)[number];

export function isCanonicalAvatarId(value: string): value is CanonicalAvatarId {
  return (CANONICAL_AVATAR_IDS as readonly string[]).includes(value);
}

export function getDefaultAvatarId(): CanonicalAvatarId {
  return CANONICAL_AVATAR_IDS[0];
}

export function normalizeAvatarId(raw: string | undefined | null): CanonicalAvatarId {
  if (raw === undefined || raw === null || raw === "") {
    return getDefaultAvatarId();
  }
  if (isCanonicalAvatarId(raw)) {
    return raw;
  }
  return getDefaultAvatarId();
}

/** Magnitude for UI copy (e.g. 5 → “5%”). */
export const FOUNDER_PERK_DISPLAY_PERCENT: Record<CanonicalAvatarId, number> = {
  sam_altman: 5,
  lee_rob: 5,
  elon_xai: 5,
  dario_amodei: 5,
  logan_kilpatrick: 5,
};

/** All founder effects in one struct (defaults = no bonus). */
export type FounderMultipliers = {
  servingMoneyIncomeMultiplier: number;
  servingDataTokensIncomeMultiplier: number;
  servingThroughputMultiplier: number;
  /** Multiply shop, upgrade, and license purchase prices (1 = full; 0.95 = 5% off). */
  shopPriceMultiplier: number;
  /** Multiply electricity bill amounts (0.95 = 5% lower). */
  electricityBillMultiplier: number;
  /** Multiply effective FP16 TFLOPs from racks for training/serving allocation. */
  trainingPowerFp16Multiplier: number;
};

const DEFAULT_MULTIPLIERS: FounderMultipliers = {
  servingMoneyIncomeMultiplier: 1,
  servingDataTokensIncomeMultiplier: 1,
  servingThroughputMultiplier: 1,
  shopPriceMultiplier: 1,
  electricityBillMultiplier: 1,
  trainingPowerFp16Multiplier: 1,
};

const MULTIPLIERS_BY_AVATAR: Record<CanonicalAvatarId, FounderMultipliers> = {
  sam_altman: {
    ...DEFAULT_MULTIPLIERS,
    servingMoneyIncomeMultiplier: 1.05,
    servingDataTokensIncomeMultiplier: 1.05,
    servingThroughputMultiplier: 1.05,
  },
  lee_rob: {
    ...DEFAULT_MULTIPLIERS,
    shopPriceMultiplier: 0.95,
  },
  elon_xai: {
    ...DEFAULT_MULTIPLIERS,
    electricityBillMultiplier: 0.95,
  },
  dario_amodei: {
    ...DEFAULT_MULTIPLIERS,
    trainingPowerFp16Multiplier: 1.05,
  },
  logan_kilpatrick: {
    ...DEFAULT_MULTIPLIERS,
    servingMoneyIncomeMultiplier: 1.05,
  },
};

export function getFounderMultipliers(
  avatarId: string | undefined | null,
): FounderMultipliers {
  const id = normalizeAvatarId(avatarId);
  return MULTIPLIERS_BY_AVATAR[id] ?? DEFAULT_MULTIPLIERS;
}

