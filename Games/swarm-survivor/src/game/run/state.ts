import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createAbilityKit, type AbilityKit } from "@jgengine/core/combat/abilityKit";
import { createSpawnDirectorState, type SpawnDirectorState } from "@jgengine/core/ai/spawnDirector";
import { seededRng } from "@jgengine/core/item/affix";
import type { RunDraft, RunModifierOffer } from "@jgengine/core/game/runDraft";

import { SPAWN_DIRECTOR_CONFIG } from "../entities/enemies/catalog";
import { WEAPON_IDS, weaponCooldownMs, type WeaponId } from "../items/weapons/catalog";
import { createUpgradeDraft, type UpgradeData, type UpgradeStat } from "../upgrades/catalog";

export const ARENA_RADIUS = 34;
export const WIN_DURATION_SECONDS = 180;
export const SPAWN_RING_RADIUS = 26;
export const BASE_MAGNET_RADIUS = 4.5;
export const MAGNET_RADIUS_PER_STACK = 1.6;
export const GEM_COLLECT_RADIUS = 0.7;
export const GEM_PULL_SPEED = 15;
export const CONTACT_RADIUS = 1.05;
export const VITALITY_HEALTH_BONUS = 16;

export type RunOutcome = "playing" | "won" | "lost";

export interface WeaponRuntime {
  level: number;
}

export interface BoltVisual {
  id: number;
  origin: readonly [number, number, number];
  target: readonly [number, number, number];
  firedAt: number;
  travelSeconds: number;
}

export interface PulseVisual {
  id: number;
  at: readonly [number, number, number];
  firedAt: number;
  durationSeconds: number;
  maxRadius: number;
}

export interface RunState {
  rng(): number;
  spawn: SpawnDirectorState;
  weapons: Record<WeaponId, WeaponRuntime>;
  weaponKit: AbilityKit;
  rebuildWeaponKit(): void;
  magnetRadius: number;
  damageMultiplier: number;
  enemyNextHitAt: Map<string, number>;
  outcome: RunOutcome;
  kills: number;
  levelUpQueue: number;
  draft: RunDraft<UpgradeStat, UpgradeData>;
  pendingOffers: RunModifierOffer<UpgradeStat, UpgradeData>[] | null;
  bolts: BoltVisual[];
  pulses: PulseVisual[];
  nextFxId(): number;
  subscribe(listener: () => void): () => void;
  notify(): void;
  disposeEvents?: () => void;
}

function buildWeaponKit(weapons: Record<WeaponId, WeaponRuntime>): AbilityKit {
  return createAbilityKit(WEAPON_IDS.map((id) => ({ id, cooldownMs: weaponCooldownMs(id, weapons[id]!.level) })));
}

export function createRunState(seed: string | number = "swarm-survivor"): RunState {
  const weapons: Record<WeaponId, WeaponRuntime> = {
    pulseLance: { level: 1 },
    rotorBlades: { level: 1 },
    quakePulse: { level: 1 },
  };
  let fxCounter = 0;
  const listeners = new Set<() => void>();
  const state: RunState = {
    rng: seededRng(seed),
    spawn: createSpawnDirectorState(SPAWN_DIRECTOR_CONFIG),
    weapons,
    weaponKit: buildWeaponKit(weapons),
    rebuildWeaponKit() {
      state.weaponKit = buildWeaponKit(state.weapons);
    },
    magnetRadius: BASE_MAGNET_RADIUS,
    damageMultiplier: 1,
    enemyNextHitAt: new Map(),
    outcome: "playing",
    kills: 0,
    levelUpQueue: 0,
    draft: createUpgradeDraft(seededRng(`${seed}-draft`)),
    pendingOffers: null,
    bolts: [],
    pulses: [],
    nextFxId() {
      fxCounter += 1;
      return fxCounter;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify() {
      for (const listener of listeners) listener();
    },
  };
  return state;
}

const RUN_STATES = new WeakMap<GameContext, RunState>();

export function getRunState(ctx: GameContext): RunState {
  let existing = RUN_STATES.get(ctx);
  if (existing === undefined) {
    existing = createRunState();
    RUN_STATES.set(ctx, existing);
  }
  return existing;
}
