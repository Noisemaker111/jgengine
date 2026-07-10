import type { SpawnDirectorConfig } from "../ai/spawnDirector";
import type { Curve } from "../game/progression";
import type { ActionCodesMap } from "../input/actionBindings";
import type { GameContext } from "../runtime/gameContext";

export type Leveled =
  | number
  | { base: number; perLevel: number; min?: number; max?: number }
  | { table: readonly number[] };

export function leveled(value: Leveled, level: number): number {
  if (typeof value === "number") return value;
  if ("table" in value) {
    const index = Math.min(value.table.length - 1, Math.max(0, level - 1));
    return value.table[index] ?? 0;
  }
  const raw = value.base + value.perLevel * (level - 1);
  const floored = value.min === undefined ? raw : Math.max(value.min, raw);
  return value.max === undefined ? floored : Math.min(value.max, floored);
}

export interface CartridgePlayer {
  kind: string;
  health: number;
  walkSpeed: number;
  spawnAt?: readonly [number, number, number];
}

export interface CartridgeEnemy {
  label: string;
  health: number;
  walkSpeed: number;
  xp: number;
  contact: { damage: number; intervalSeconds: number };
  behavior?: "chase";
}

export interface WeaponCommon {
  label: string;
  damage: Leveled;
  cooldownMs: Leveled;
  maxLevel: number;
  fxColor?: string;
  fxEmissive?: string;
}

export type CartridgeWeapon =
  | (WeaponCommon & { kind: "projectile"; range: number; speed: number })
  | (WeaponCommon & {
      kind: "orbit";
      blades: Leveled;
      radius: Leveled;
      hitRadius: number;
      angularSpeed: number;
    })
  | (WeaponCommon & { kind: "pulse"; radius: Leveled; durationSeconds: number })
  | (WeaponCommon & {
      kind: "custom";
      fire(ctx: GameContext, run: CartridgeRun, args: WeaponFireArgs): void;
    });

export interface WeaponFireArgs {
  weaponId: string;
  level: number;
  damage: number;
  playerId: string;
  playerPosition: readonly [number, number, number];
  enemyIds: readonly string[];
  dt: number;
}

export type UpgradeEffect =
  | { kind: "weaponLevel"; weapon: string }
  | { kind: "statBonus"; stat: string; amount: number }
  | { kind: "fieldAdd"; field: string; amount: number }
  | { kind: "fieldMultiply"; field: string; factor: number }
  | { kind: "custom"; apply(ctx: GameContext, run: CartridgeRun, stacks: number): void };

export interface CartridgeUpgrade {
  id: string;
  label: string;
  weight: number;
  maxStacks: number;
  effect: UpgradeEffect;
}

export interface CartridgeProgression {
  xp: Curve;
  maxLevel: number;
  draft: { choices: number; upgrades: readonly CartridgeUpgrade[] };
}

export interface CartridgeSpawning {
  director: SpawnDirectorConfig;
  placement:
    | { kind: "ring"; radius: number }
    | { kind: "custom"; position(ctx: GameContext, run: CartridgeRun): readonly [number, number, number] };
}

export interface CartridgeXpGems {
  collectRadius: number;
  pullSpeed: number;
  rarityThresholds: readonly (readonly [number, string])[];
  defaultRarity: string;
}

export interface CartridgeRules {
  win?: { kind: "survive"; seconds: number } | { kind: "custom"; check(ctx: GameContext, run: CartridgeRun): boolean };
  lose?: { kind: "playerDeath" };
  killLeaderboardStat?: string;
}

export interface CartridgeSpec {
  seed?: string | number;
  player: CartridgePlayer;
  enemies: Record<string, CartridgeEnemy>;
  combat: { contactRadius: number };
  spawning: CartridgeSpawning;
  weapons: Record<string, CartridgeWeapon>;
  progression: CartridgeProgression;
  xpGems: CartridgeXpGems;
  rules: CartridgeRules;
  fields?: Record<string, number>;
  input?: ActionCodesMap;
  systems?: readonly ((ctx: GameContext, run: CartridgeRun, dt: number) => void)[];
}

export interface BoltFx {
  id: number;
  weaponId: string;
  origin: readonly [number, number, number];
  target: readonly [number, number, number];
  firedAt: number;
  travelSeconds: number;
}

export interface PulseFx {
  id: number;
  weaponId: string;
  at: readonly [number, number, number];
  firedAt: number;
  durationSeconds: number;
  maxRadius: number;
}

export type CartridgeOutcome = "playing" | "won" | "lost";

export interface CartridgeRun {
  outcome: CartridgeOutcome;
  kills: number;
  weaponLevel(weaponId: string): number;
  field(name: string): number;
  pendingOffers: readonly { id: string; label: string }[] | null;
  bolts: readonly BoltFx[];
  pulses: readonly PulseFx[];
  subscribe(listener: () => void): () => void;
}

export const WASD_KEYBINDS: ActionCodesMap = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
};

export const XP_GEM_BASE_TYPE = "xp_gem";
export const HIT_EFFECT = "hit";
