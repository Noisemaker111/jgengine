import type { AbilityCastType } from "@jgengine/core/combat/abilityKit";

export interface AbilityDef {
  id: string;
  label: string;
  detail: string;
  icon: "fire" | "frost";
  cooldownMs: number;
  castType: AbilityCastType;
  key: string;
  action: string;
  tint: string;
}

export const ABILITIES: readonly AbilityDef[] = [
  {
    id: "beacon_fire",
    label: "Beacon Fire",
    detail: "Click the road: fire falls there a moment later, 120 damage and a burn",
    icon: "fire",
    cooldownMs: 40_000,
    castType: "targeted",
    key: "KeyQ",
    action: "abilityFire",
    tint: "#6b3418",
  },
  {
    id: "frost_bell",
    label: "Frost Bell",
    detail: "Every raider on the road slows to a crawl for 4 s",
    icon: "frost",
    cooldownMs: 55_000,
    castType: "instant",
    key: "KeyE",
    action: "abilityBell",
    tint: "#2d4a5e",
  },
];

/** Beacon Fire's numbers before the council. */
export const BEACON_FIRE = { damage: 120, radius: 3.5, delayMs: 900, burn: 10 } as const;
export const FROST_BELL = { factor: 0.4, bossFactor: 0.7, durationMs: 4000 } as const;

export function abilityDef(id: string): AbilityDef | null {
  return ABILITIES.find((ability) => ability.id === id) ?? null;
}
