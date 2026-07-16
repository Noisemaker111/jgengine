import type { Aim } from "@jgengine/core/scene/spatial";
import type { ShotOriginPolicy } from "@jgengine/core/combat/shotOrigin";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

export type CollisionDebugLayer =
  | "hitboxes"
  | "bodies"
  | "projectiles"
  | "muzzles"
  | "aimLaser";

export const COLLISION_DEBUG_LAYERS: readonly CollisionDebugLayer[] = [
  "hitboxes",
  "bodies",
  "projectiles",
  "muzzles",
  "aimLaser",
] as const;

export type CollisionDebugLayers = Record<CollisionDebugLayer, boolean>;

export interface AimProbeConfig {
  from: string;
  aim: Aim;
  originPolicy?: ShotOriginPolicy;
  maxDistance?: number;
}

export interface ProjectileDebugTrace {
  id: number;
  origin: EntityPosition;
  at: EntityPosition;
  hit: boolean;
  bornMs: number;
}

export interface CollisionDebugState {
  layers: CollisionDebugLayers;
  aimProbe: AimProbeConfig | null;
  projectileTraces: readonly ProjectileDebugTrace[];
  /** Caps retained projectile paths/muzzle marks. */
  maxProjectileTraces: number;
  /** How long a projectile path stays visible (ms). */
  projectileTraceLifeMs: number;
}

export type CollisionDebugListener = () => void;

const DEFAULT_LAYERS: CollisionDebugLayers = {
  hitboxes: false,
  bodies: false,
  projectiles: false,
  muzzles: false,
  aimLaser: false,
};

/** @internal */
export function createDefaultCollisionDebugState(): CollisionDebugState {
  return {
    layers: { ...DEFAULT_LAYERS },
    aimProbe: null,
    projectileTraces: [],
    maxProjectileTraces: 32,
    projectileTraceLifeMs: 2500,
  };
}

/** @internal */
export function anyCollisionLayerOn(layers: CollisionDebugLayers): boolean {
  return (
    layers.hitboxes ||
    layers.bodies ||
    layers.projectiles ||
    layers.muzzles ||
    layers.aimLaser
  );
}

/** @internal */
export function colliderScanNeeded(layers: CollisionDebugLayers): boolean {
  return layers.hitboxes || layers.bodies;
}

/** @internal */
export function projectileListenNeeded(layers: CollisionDebugLayers): boolean {
  return layers.projectiles || layers.muzzles;
}

/** @internal */
export function aimProbeNeeded(layers: CollisionDebugLayers): boolean {
  return layers.aimLaser;
}

export interface CollisionDebugController {
  getState(): CollisionDebugState;
  subscribe(listener: CollisionDebugListener): () => void;
  setLayer(layer: CollisionDebugLayer, on: boolean): void;
  toggleLayer(layer: CollisionDebugLayer): void;
  setLayers(partial: Partial<CollisionDebugLayers>): void;
  setAllLayers(on: boolean): void;
  /** Updates aim probe without notifying subscribers (per-frame safe). */
  setAimProbe(probe: AimProbeConfig | null): void;
  getAimProbe(): AimProbeConfig | null;
  pushProjectileTrace(input: {
    origin: EntityPosition;
    at: EntityPosition;
    hit: boolean;
    nowMs?: number;
  }): void;
  pruneProjectileTraces(nowMs: number): void;
  reset(): void;
  /** True when any overlay work is scheduled. */
  isActive(): boolean;
}

/** @internal */
export function createCollisionDebugController(
  initial: CollisionDebugState = createDefaultCollisionDebugState(),
): CollisionDebugController {
  let state: CollisionDebugState = {
    ...initial,
    layers: { ...initial.layers },
    projectileTraces: [...initial.projectileTraces],
  };
  const listeners = new Set<CollisionDebugListener>();
  let nextTraceId = 1;

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function replace(next: CollisionDebugState): void {
    state = next;
    emit();
  }

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setLayer(layer, on) {
      if (state.layers[layer] === on) return;
      replace({ ...state, layers: { ...state.layers, [layer]: on } });
    },
    toggleLayer(layer) {
      replace({ ...state, layers: { ...state.layers, [layer]: !state.layers[layer] } });
    },
    setLayers(partial) {
      const layers = { ...state.layers, ...partial };
      replace({ ...state, layers });
    },
    setAllLayers(on) {
      const layers: CollisionDebugLayers = {
        hitboxes: on,
        bodies: on,
        projectiles: on,
        muzzles: on,
        aimLaser: on,
      };
      replace({ ...state, layers });
    },
    setAimProbe(probe) {
      state = { ...state, aimProbe: probe };
    },
    getAimProbe() {
      return state.aimProbe;
    },
    pushProjectileTrace(input) {
      if (!projectileListenNeeded(state.layers)) return;
      const trace: ProjectileDebugTrace = {
        id: nextTraceId++,
        origin: input.origin,
        at: input.at,
        hit: input.hit,
        bornMs: input.nowMs ?? 0,
      };
      const next = [...state.projectileTraces, trace];
      while (next.length > state.maxProjectileTraces) next.shift();
      replace({ ...state, projectileTraces: next });
    },
    pruneProjectileTraces(nowMs) {
      if (state.projectileTraces.length === 0) return;
      const life = state.projectileTraceLifeMs;
      const next = state.projectileTraces.filter((trace) => nowMs - trace.bornMs <= life);
      if (next.length === state.projectileTraces.length) return;
      replace({ ...state, projectileTraces: next });
    },
    reset() {
      nextTraceId = 1;
      replace(createDefaultCollisionDebugState());
    },
    isActive() {
      return anyCollisionLayerOn(state.layers);
    },
  };
}

export const collisionDebug: CollisionDebugController = createCollisionDebugController();
