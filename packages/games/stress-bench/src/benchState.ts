import { useSyncExternalStore } from "react";

import { PhysicsWorld, type PhysicsBounds } from "@jgengine/core/physics/physicsWorld";

import { mulberry32, type BenchParams } from "./params";

const SMALL_HALF = 0.5;
const LARGE_HALF = 1.0;
const CHAOS_HALF = 0.6;
const PLOW_HALF = 1.6;
const BOULDER_HALF = 0.9;
const SPACING = 1.02;
const BED_COLOR: readonly [number, number, number] = [0.56, 0.58, 0.62];
const LARGE_COLOR: readonly [number, number, number] = [0.5, 0.55, 0.64];
const CHAOS_COLOR: readonly [number, number, number] = [0.96, 0.5, 0.16];
const PLOW_COLOR: readonly [number, number, number] = [0.2, 0.85, 0.95];

export interface BenchStats {
  fps: number;
  fpsLow1: number;
  total: number;
  awake: number;
  sleeping: number;
  contacts: number;
  pairs: number;
  physicsMs: number;
  renderMs: number;
  frameMs: number;
  drawCalls: number;
  substeps: number;
  settled: boolean;
}

export const benchStats: BenchStats = {
  fps: 0,
  fpsLow1: 0,
  total: 0,
  awake: 0,
  sleeping: 0,
  contacts: 0,
  pairs: 0,
  physicsMs: 0,
  renderMs: 0,
  frameMs: 0,
  drawCalls: 0,
  substeps: 0,
  settled: false,
};

export interface BenchWorld {
  world: PhysicsWorld;
  bounds: PhysicsBounds;
  baseColors: Float32Array;
  chaosStart: number;
  chaosCount: number;
  /** Kinematic body driven by the player each frame — the plow that shoves the pile. */
  plow: number;
  plowHalf: number;
  /** Dynamic bodies mirrored onto real scene entities (rendered through the model path). */
  boulderStart: number;
  boulderCount: number;
  boulderHalf: number;
  /** Bodies handed to the instanced renderer; the trailing boulders render as entities instead. */
  instancedCount: number;
  params: BenchParams;
}

function boundsFor(params: BenchParams): { bounds: PhysicsBounds; side: number; footprint: number; bedTop: number } {
  const footprint = Math.ceil(params.small / params.layers);
  const side = Math.max(1, Math.ceil(Math.sqrt(footprint)));
  const halfXZ = (side * SPACING) / 2 + 2;
  const bedTop = params.layers * SPACING + SMALL_HALF;
  const height = bedTop + 24;
  return {
    bounds: { min: [-halfXZ, 0, -halfXZ], max: [halfXZ, height, halfXZ] },
    side,
    footprint,
    bedTop,
  };
}

function setColor(colors: Float32Array, index: number, rgb: readonly [number, number, number]): void {
  const o = index * 3;
  colors[o] = rgb[0];
  colors[o + 1] = rgb[1];
  colors[o + 2] = rgb[2];
}

export function buildBenchWorld(params: BenchParams): BenchWorld {
  const { bounds, side, footprint, bedTop } = boundsFor(params);
  const capacity = params.small + params.large + params.chaos + 1 + params.boulders;
  const world = new PhysicsWorld({
    capacity,
    bounds,
    cellSize: params.cellSize,
    gravity: params.gravity,
    restitution: 0.1,
    friction: 0.8,
    linearDamping: 0.8,
    solverIterations: 6,
    sleepLinearVelocity: 0.12,
    wakeThreshold: 0.6,
  });
  const baseColors = new Float32Array(capacity * 3);
  const rng = mulberry32(params.seed);
  const centerOffset = ((side - 1) * SPACING) / 2;

  for (let k = 0; k < params.small; k += 1) {
    const layer = Math.floor(k / footprint);
    const withinLayer = k - layer * footprint;
    const gx = withinLayer % side;
    const gz = Math.floor(withinLayer / side);
    const index = world.addBody({
      position: [gx * SPACING - centerOffset, SMALL_HALF + layer * SPACING, gz * SPACING - centerOffset],
      halfExtents: [SMALL_HALF, SMALL_HALF, SMALL_HALF],
      asleep: true,
    });
    setColor(baseColors, index, BED_COLOR);
  }

  const largeSide = Math.max(1, Math.ceil(Math.sqrt(params.large)));
  const largeSpacing = LARGE_HALF * 2.6;
  const largeOffset = ((largeSide - 1) * largeSpacing) / 2;
  for (let k = 0; k < params.large; k += 1) {
    const gx = k % largeSide;
    const gz = Math.floor(k / largeSide);
    const index = world.addBody({
      position: [gx * largeSpacing - largeOffset, bedTop + LARGE_HALF, gz * largeSpacing - largeOffset],
      halfExtents: [LARGE_HALF, LARGE_HALF, LARGE_HALF],
      mass: 6,
      asleep: true,
    });
    setColor(baseColors, index, LARGE_COLOR);
  }

  const chaosStart = world.count;
  const halfXZ = bounds.max[0] - 2;
  for (let k = 0; k < params.chaos; k += 1) {
    const index = world.addBody({
      position: [(rng() - 0.5) * halfXZ, bounds.max[1] - 3 - rng() * 4, (rng() - 0.5) * halfXZ],
      halfExtents: [CHAOS_HALF, CHAOS_HALF, CHAOS_HALF],
      velocity: [(rng() - 0.5) * 24, -(6 + rng() * 14), (rng() - 0.5) * 24],
      mass: 2,
    });
    setColor(baseColors, index, CHAOS_COLOR);
  }

  const instancedCount = world.count;
  const plow = world.addBody({
    position: [0, PLOW_HALF, -(bounds.max[2] as number) + PLOW_HALF + 1],
    halfExtents: [PLOW_HALF, PLOW_HALF, PLOW_HALF],
    kinematic: true,
  });
  setColor(baseColors, plow, PLOW_COLOR);

  const boulderStart = world.count;
  const boulderSpan = bounds.max[0] - 4;
  for (let k = 0; k < params.boulders; k += 1) {
    world.addBody({
      position: [
        (rng() - 0.5) * boulderSpan,
        bedTop + BOULDER_HALF + 4 + k * 2.2,
        (rng() - 0.5) * boulderSpan,
      ],
      halfExtents: [BOULDER_HALF, BOULDER_HALF, BOULDER_HALF],
      mass: 4,
    });
  }

  return {
    world,
    bounds,
    baseColors,
    chaosStart,
    chaosCount: params.chaos,
    plow,
    plowHalf: PLOW_HALF,
    boulderStart,
    boulderCount: params.boulders,
    boulderHalf: BOULDER_HALF,
    instancedCount: instancedCount + 1,
    params,
  };
}

export function rekickChaos(state: BenchWorld): void {
  const rng = mulberry32((state.params.seed + state.world.count * 2654435761) >>> 0);
  const world = state.world;
  const top = state.bounds.max[1] - 3;
  const halfXZ = state.bounds.max[0] - 2;
  for (let i = state.chaosStart; i < state.chaosStart + state.chaosCount; i += 1) {
    world.posX[i] = (rng() - 0.5) * halfXZ;
    world.posY[i] = top - rng() * 4;
    world.posZ[i] = (rng() - 0.5) * halfXZ;
    world.velX[i] = (rng() - 0.5) * 40;
    world.velY[i] = -(8 + rng() * 20);
    world.velZ[i] = (rng() - 0.5) * 40;
    world.wake(i);
  }
}

const benchRef: { current: BenchWorld | null } = { current: null };

export function currentBench(): BenchWorld | null {
  return benchRef.current;
}

export function initBench(params: BenchParams): BenchWorld {
  const next = buildBenchWorld(params);
  benchRef.current = next;
  emit();
  return next;
}

let tint = false;
let epoch = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function toggleDebugTint(): void {
  tint = !tint;
  emit();
}

export function resetBench(): void {
  const state = benchRef.current;
  if (state === null) return;
  benchRef.current = buildBenchWorld(state.params);
  epoch += 1;
  emit();
}

export interface BenchControls {
  tint: boolean;
  epoch: number;
  world: BenchWorld | null;
}

let snapshot: BenchControls = { tint, epoch, world: benchRef.current };

function getSnapshot(): BenchControls {
  if (snapshot.tint !== tint || snapshot.epoch !== epoch || snapshot.world !== benchRef.current) {
    snapshot = { tint, epoch, world: benchRef.current };
  }
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBenchControls(): BenchControls {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
