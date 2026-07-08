import { createRunDraft, type RunDraft, type RunModifierOffer } from "@jgengine/core/game/runDraft";

import { MAX_WEAPON_LEVEL, type WeaponId } from "../items/weapons/catalog";

export type UpgradeStat = "damageMultiplier";

export type UpgradeData =
  | { kind: "weapon"; weapon: WeaponId }
  | { kind: "vitality" }
  | { kind: "magnet" }
  | { kind: "adrenaline" };

export const UPGRADE_OFFERS: readonly RunModifierOffer<UpgradeStat, UpgradeData>[] = [
  {
    id: "focus_pulse_lance",
    label: "Lance Focus",
    weight: 5,
    maxStacks: MAX_WEAPON_LEVEL - 1,
    data: { kind: "weapon", weapon: "pulseLance" },
  },
  {
    id: "overdrive_rotor",
    label: "Rotor Overdrive",
    weight: 5,
    maxStacks: MAX_WEAPON_LEVEL - 1,
    data: { kind: "weapon", weapon: "rotorBlades" },
  },
  {
    id: "amplify_quake",
    label: "Quake Amplifier",
    weight: 5,
    maxStacks: MAX_WEAPON_LEVEL - 1,
    data: { kind: "weapon", weapon: "quakePulse" },
  },
  {
    id: "vital_plating",
    label: "Vital Plating",
    weight: 4,
    maxStacks: 6,
    data: { kind: "vitality" },
  },
  {
    id: "magnetic_core",
    label: "Magnetic Core",
    weight: 3,
    maxStacks: 5,
    data: { kind: "magnet" },
  },
  {
    id: "adrenal_surge",
    label: "Adrenal Surge",
    weight: 3,
    maxStacks: 5,
    stats: { damageMultiplier: { multiply: 1.12 } },
    data: { kind: "adrenaline" },
  },
];

export function createUpgradeDraft(rng?: () => number): RunDraft<UpgradeStat, UpgradeData> {
  return createRunDraft({ offers: UPGRADE_OFFERS, rng });
}
