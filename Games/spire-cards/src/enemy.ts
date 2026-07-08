export type IntentKind = "attack" | "defend" | "buff";

export interface Intent {
  kind: IntentKind;
  value: number;
}

export const HERO_CATALOG_ID = "hero_ironclad";
export const ENEMY_CATALOG_ID = "enemy_slime";
export const ENEMY_ID = "enemy";
export const ENEMY_NAME = "Acid Slime";

export const TURN_HERO = "hero";
export const TURN_ENEMY = "enemy";
export const ENERGY_POOL = "energy";
export const HAND_SIZE = 5;
export const MAX_ENERGY = 3;

const PATTERN: readonly IntentKind[] = ["attack", "attack", "defend", "buff"];

export function intentForTurn(turn: number, enemyStrength: number): Intent {
  const kind = PATTERN[turn % PATTERN.length]!;
  if (kind === "attack") return { kind, value: 9 + enemyStrength };
  if (kind === "defend") return { kind, value: 7 };
  return { kind: "buff", value: 3 };
}
