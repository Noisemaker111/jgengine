import type { AbilityCastType } from "@jgengine/core/combat/abilityKit";

/**
 * The town's own two answers, outside any worker: a Blackout flipped on one stretch of street, and
 * Do Not Disturb, which slows every gadget, snaps every worker out of their phone and silences
 * notifications for a few seconds. Cooldowns run on the engine ability kit; the town council
 * shortens them and makes the blackout bigger.
 */
export interface AbilityDef {
  id: string;
  label: string;
  detail: string;
  icon: "bolt" | "moon";
  cooldownMs: number;
  castType: AbilityCastType;
  /** Key that arms or rings it. */
  key: string;
  /** The input action (and command) the key runs. */
  action: string;
  /** The button's colour on the HUD. */
  tint: string;
}

export const ABILITIES: readonly AbilityDef[] = [
  {
    id: "blackout",
    label: "Blackout",
    detail: "Click the street: the breaker flips there a moment later, 120 damage and a short-circuit",
    icon: "bolt",
    cooldownMs: 40_000,
    castType: "targeted",
    key: "KeyQ",
    action: "abilityBlackout",
    tint: "#2a3a6a",
  },
  {
    id: "dnd",
    label: "Do Not Disturb",
    detail: "Every gadget slows to a crawl for 4 s, every worker looks up from their phone, and notifications go quiet",
    icon: "moon",
    cooldownMs: 55_000,
    castType: "instant",
    key: "KeyE",
    action: "abilityQuiet",
    tint: "#7a2a4a",
  },
];

/** Blackout's numbers before the council. */
export const BLACKOUT = { damage: 120, radius: 3.5, delayMs: 900, burn: 10 } as const;
/** Do Not Disturb: tech keeps this share of its speed (a boss keeps more), for this long. */
export const DO_NOT_DISTURB = { factor: 0.4, bossFactor: 0.7, durationMs: 4000 } as const;

export function abilityDef(id: string): AbilityDef | null {
  return ABILITIES.find((ability) => ability.id === id) ?? null;
}
