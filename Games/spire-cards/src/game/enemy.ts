export type IntentKind = "attack" | "defend" | "buff" | "debuff";
export type StatusKind = "weak" | "vulnerable";
export type EnemyTier = "normal" | "elite" | "boss";

export interface Intent {
  kind: IntentKind;
  value: number;
  hits?: number;
  status?: StatusKind;
}

interface IntentStep {
  kind: IntentKind;
  base: number;
  hits?: number;
  status?: StatusKind;
}

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  tier: EnemyTier;
  pattern: readonly IntentStep[];
}

export const HERO_CATALOG_ID = "hero_ironclad";
export const ENEMY_CATALOG_ID = "enemy_generic";
export const ENEMY_ID = "enemy";

export const TURN_HERO = "hero";
export const TURN_ENEMY = "enemy";
export const ENERGY_POOL = "energy";
export const HAND_SIZE = 5;
export const MAX_ENERGY = 3;

export const ENCOUNTERS: readonly EnemyDef[] = [
  {
    id: "slime",
    name: "Acid Slime",
    maxHp: 48,
    tier: "normal",
    pattern: [
      { kind: "attack", base: 9 },
      { kind: "attack", base: 9 },
      { kind: "defend", base: 7 },
      { kind: "buff", base: 3 },
    ],
  },
  {
    id: "cultist",
    name: "Cultist",
    maxHp: 52,
    tier: "normal",
    pattern: [
      { kind: "buff", base: 4 },
      { kind: "attack", base: 11 },
      { kind: "attack", base: 11 },
      { kind: "debuff", base: 2, status: "weak" },
    ],
  },
  {
    id: "jaw_worm",
    name: "Jaw Worm",
    maxHp: 58,
    tier: "normal",
    pattern: [
      { kind: "attack", base: 13 },
      { kind: "defend", base: 9 },
      { kind: "buff", base: 3 },
      { kind: "attack", base: 8, hits: 2 },
    ],
  },
  {
    id: "sentry",
    name: "Iron Sentry",
    maxHp: 70,
    tier: "elite",
    pattern: [
      { kind: "debuff", base: 2, status: "vulnerable" },
      { kind: "attack", base: 10, hits: 2 },
      { kind: "defend", base: 12 },
      { kind: "attack", base: 16 },
    ],
  },
  {
    id: "guardian",
    name: "The Guardian",
    maxHp: 95,
    tier: "boss",
    pattern: [
      { kind: "defend", base: 15 },
      { kind: "attack", base: 11, hits: 2 },
      { kind: "debuff", base: 2, status: "weak" },
      { kind: "attack", base: 24 },
    ],
  },
];

function resolveIntent(step: IntentStep, enemyStrength: number): Intent {
  if (step.kind === "attack") return { kind: "attack", value: step.base + enemyStrength, hits: step.hits };
  if (step.kind === "debuff") return { kind: "debuff", value: step.base, status: step.status };
  return { kind: step.kind, value: step.base };
}

export function intentForEncounter(enemy: EnemyDef, turn: number, enemyStrength: number): Intent {
  const step = enemy.pattern[turn % enemy.pattern.length]!;
  return resolveIntent(step, enemyStrength);
}
