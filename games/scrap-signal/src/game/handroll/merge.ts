import { seededRng } from "@jgengine/core/random/rng";

import { RARITY_TIERS, type GunDef, type GunElement, type GunFamily, type Rarity } from "./guns";
import { personalityOf, type PersonalityId } from "./personality";
import { rarityRank, rollGun } from "./roll";

/**
 * The garage workbench: two weapons go in, one comes out. The body (and the voice that lives in it)
 * comes from the first, the mod from the second. Condition takes the better of the two, and two of
 * the same condition below Mint step up one: two Used guns make a Like New. Heirlooms cannot be
 * made, only inherited, so a merge tops out at Mint.
 */
export interface MergePlan {
  body: GunFamily;
  mod: string;
  rarity: Rarity;
  level: number;
  personality: PersonalityId;
  element: GunElement;
}

const MERGE_CAP: Rarity = "epic";

export function mergePlan(bodyDonor: GunDef, modDonor: GunDef): MergePlan {
  const capRank = rarityRank(MERGE_CAP);
  const a = Math.min(capRank, rarityRank(bodyDonor.rarity));
  const b = Math.min(capRank, rarityRank(modDonor.rarity));
  const stepped = a === b && a < capRank ? a + 1 : Math.max(a, b);
  const element = modDonor.element !== "none" ? modDonor.element : bodyDonor.element;
  return {
    body: bodyDonor.family,
    mod: modDonor.manufacturer,
    rarity: RARITY_TIERS[Math.min(capRank, stepped)]!.id,
    level: Math.max(bodyDonor.level, modDonor.level),
    personality: personalityOf(bodyDonor).id,
    element,
  };
}

/** What the bench charges: a little cash per level and one core for the solder. */
export function mergeCost(plan: Pick<MergePlan, "level">): { cash: number; cores: number } {
  return { cash: 30 * Math.max(1, plan.level), cores: 1 };
}

/** Build the merged weapon. Deterministic from the two donors' ids, off every shared stream. */
export function mergeGuns(bodyDonor: GunDef, modDonor: GunDef): GunDef {
  if (bodyDonor.id === modDonor.id) throw new Error("mergeGuns: a gun cannot be merged with itself");
  const plan = mergePlan(bodyDonor, modDonor);
  const gun = rollGun(seededRng(`junk-merge:${bodyDonor.id}+${modDonor.id}`), plan.level, {
    family: plan.body,
    maker: plan.mod,
    rarity: plan.rarity,
    level: plan.level,
    element: plan.element,
  });
  gun.personality = plan.personality;
  return gun;
}
