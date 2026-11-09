// @skill jgengine-world
import type { ReactElement } from "react";
import * as THREE from "three";

import { useGameContext } from "@jgengine/react/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { devtools } from "@jgengine/core/devtools/devtools";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { childFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { warmupSpawnables } from "@jgengine/core/render/shaderWarmup.draw";
import { DEFAULT_GRAPHICS_PROFILES } from "@jgengine/core/settings/graphicsProfile";
import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";
import { createParticleSystem, type ParticleEvent, type ParticleSystem } from "@jgengine/core/vfx/particles";
import { planParticleBudget } from "@jgengine/core/vfx/particleBudget";
import type { ParticleCollisionEffect, ParticleEmitterSpec, ParticleRenderHint } from "@jgengine/core/vfx/particleDirector";
import type { Vec3 } from "@jgengine/core/world/geometry";

import { fieldPrograms, particleFieldDraw, type ParticleFieldMetrics } from "./ParticleField.draw";

interface ParticlePose { position: Vec3; yaw: number; found: boolean }

interface EmitterInstance {
  spec: ParticleEmitterSpec;
  system: ParticleSystem;
  poolMax: number;
  group: THREE.Group | null;
  pose: ParticlePose;
  draw: EngineDraw | null;
  fieldKey: string;
}

interface BurstInstance {
  seq: number;
  system: ParticleSystem;
  blending: "additive" | "normal";
  render?: ParticleRenderHint | undefined;
  position: Vec3;
  rotationY: number;
  collisionEffect?: ParticleCollisionEffect | undefined;
  group: THREE.Group;
  draw: EngineDraw | null;
}

const MAX_CONCURRENT_BURSTS = 32;
const ZERO: Vec3 = [0, 0, 0];

/** @internal Config retunes stay imperative; output changes require React rendering. */
export function specNeedsRender(prev: ParticleEmitterSpec, next: ParticleEmitterSpec): boolean {
  if (prev.blending !== next.blending || prev.follow !== next.follow || prev.space !== next.space) return true;
  if (prev.render?.shape !== next.render?.shape || prev.render?.stretch !== next.render?.stretch) return true;
  const a = prev.offset, b = next.offset;
  if (a === b) return false;
  if (a === undefined || b === undefined) return true;
  return a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2];
}

/** @internal Transform a simulation vector through a followed yaw and origin. */
export function transformParticleVector(point: Vec3, origin: Vec3, yaw: number, inverse = false, out: [number, number, number] = [0, 0, 0]): Vec3 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const x = inverse ? point[0] - origin[0] : point[0];
  const y = inverse ? point[1] - origin[1] : point[1];
  const z = inverse ? point[2] - origin[2] : point[2];
  out[0] = inverse ? c * x - s * z : origin[0] + c * x + s * z;
  out[1] = inverse ? y : origin[1] + y;
  out[2] = inverse ? s * x + c * z : origin[2] - s * x + c * z;
  return out;
}

/** @internal Cosmetic catch-up follows game time, with bounded work after suspension. */
export function resolveParticleDelta(previousTime: number, gameTime: number): number {
  return Number.isFinite(previousTime) && Number.isFinite(gameTime) ? Math.max(0, Math.min(0.1, gameTime - previousTime)) : 0;
}

function fieldKeyOf(blending: "additive" | "normal", render: ParticleRenderHint | undefined): string {
  return `${blending}|${render?.shape ?? "point"}|${render?.stretch ?? 0.08}`;
}

/**
 * Renders the existing director and pooled simulator; named bursts reuse the standing pool.
 * @internal
 */
export function particleEmittersDraw(
  ctx: GameContext,
  { quality, particleCap, particleBudget, diagnostics = false }: { quality: GraphicsQuality; particleCap?: number | undefined; particleBudget?: number | undefined; diagnostics?: boolean | undefined },
): EngineDraw {
  const emitters = new Map<string, EmitterInstance>();
  const bursts: BurstInstance[] = [];
  let previousTime = ctx.time.now();
  const budget = { cap: 0, particles: 0, dropped: [] as string[] };
  const timing = { poolsCreated: 0, poolsRetired: 0, updateSamples: 0, lastUpdateMs: 0, totalUpdateMs: 0, maxUpdateMs: 0, droppedCatchupSeconds: 0 };
  const resources: ParticleFieldMetrics = { fieldsMounted: 0, fieldsUnmounted: 0, liveFields: 0, attributeBytes: 0, totalUploadMs: 0, maxUploadMs: 0, uploadSamples: 0 };
  const mountDispose: (() => void)[] = [];
  let state: EngineFrameState | null = null;
  let unsubscribe: (() => void) | null = null;
  let unregisterProbe: (() => void) | null = null;

  function pose(spec: ParticleEmitterSpec): ParticlePose {
    const offset = spec.offset ?? [0, 0, 0];
    const entity = spec.follow === undefined ? undefined : ctx.scene.entity.get(spec.follow);
    if (entity === undefined || entity === null) return { position: offset, yaw: 0, found: spec.follow === undefined };
    if (spec.space === "local") return { position: transformParticleVector(offset, entity.position, entity.rotationY), yaw: entity.rotationY, found: true };
    return { position: [entity.position[0] + offset[0], entity.position[1] + offset[1], entity.position[2] + offset[2]], yaw: 0, found: true };
  }

  function fieldState(parent: THREE.Group): EngineFrameState {
    return childFrameState(state as EngineFrameState, parent);
  }

  function mountField(parent: THREE.Group, system: ParticleSystem, blending: "additive" | "normal", render: ParticleRenderHint | undefined): EngineDraw | null {
    if (state === null) return null;
    const draw = particleFieldDraw(system, { advance: false, blending, render, metrics: diagnostics ? resources : undefined });
    draw.mount?.(fieldState(parent));
    return draw;
  }

  function dropGroup(group: THREE.Group): void {
    group.parent?.remove(group);
    group.clear();
  }

  function dropEmitter(id: string): void {
    const instance = emitters.get(id);
    if (instance === undefined) return;
    if (instance.draw !== null && instance.group !== null && state !== null) instance.draw.dispose?.(fieldState(instance.group));
    if (instance.group !== null) dropGroup(instance.group);
    emitters.delete(id);
    timing.poolsRetired++;
  }

  function syncPose(instance: EmitterInstance): void {
    const resolved = pose(instance.spec);
    instance.pose = resolved;
    if (instance.spec.space === "local" && resolved.found) {
      instance.group?.position.set(...resolved.position);
      if (instance.group !== null) instance.group.rotation.y = resolved.yaw;
    } else if (instance.spec.space !== "local") {
      const base = instance.spec.follow === undefined ? instance.spec.config.position ?? [0, 0, 0] : [0, 0, 0];
      instance.system.configure({ position: [resolved.position[0] + base[0], resolved.position[1] + base[1], resolved.position[2] + base[2]] });
    }
    if (resolved.found && instance.spec.active !== false) instance.system.start();
    else instance.system.stop();
  }

  function collisionFor(spec: () => ParticleEmitterSpec, frozenPose?: { position: Vec3; yaw: number }) {
    return (from: Vec3, to: Vec3) => {
      const current = spec();
      const local = current.space === "local";
      const resolved = frozenPose ?? emitters.get(current.id)?.pose ?? pose(current);
      const start = local ? transformParticleVector(from, resolved.position, resolved.yaw) : from;
      const end = local ? transformParticleVector(to, resolved.position, resolved.yaw) : to;
      const direction: Vec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
      const maxDistance = Math.hypot(...direction);
      if (maxDistance === 0) return null;
      const hit = ctx.scene.raycast({ origin: start, direction, maxDistance,
        filter: { entities: false, objects: true, terrain: true, walls: true } });
      if (hit === null) return null;
      return { position: local ? transformParticleVector(hit.point, resolved.position, resolved.yaw, true) : hit.point,
        normal: local ? transformParticleVector(hit.normal, [0, 0, 0], resolved.yaw, true) : hit.normal };
    };
  }

  function accelerationFor(spec: () => ParticleEmitterSpec, frozenPose?: { position: Vec3; yaw: number }) {
    const worldScratch: [number, number, number] = [0, 0, 0];
    const forceScratch: [number, number, number] = [0, 0, 0];
    return (position: Vec3, _velocity: Vec3, out: [number, number, number]): Vec3 => {
      const current = spec();
      const influence = current.environment;
      if (influence === undefined) { out[0] = out[1] = out[2] = 0; return out; }
      const resolved = frozenPose ?? emitters.get(current.id)?.pose ?? pose(current);
      const local = current.space === "local";
      const world = local ? transformParticleVector(position, resolved.position, resolved.yaw, false, worldScratch) : position;
      const force = ctx.environment.accelerationAt(world, ctx.time.now(), influence.windResponse ?? 0, influence.maxAcceleration ?? 100, influence.mask ?? 0xffffffff, forceScratch);
      const result = local ? transformParticleVector(force, ZERO, resolved.yaw, true, forceScratch) : force;
      out[0] = result[0]; out[1] = result[1]; out[2] = result[2];
      return out;
    };
  }

  function sync(): void {
    if (state === null) return;
    const tier = DEFAULT_GRAPHICS_PROFILES[quality];
    const cap = particleBudget ?? tier.particleBudget;
    const specs = ctx.particles.emitters();
    const queued = ctx.particles.drainBursts();
    const plan = planParticleBudget([
      ...specs.map((spec) => ({ id: spec.id, priority: spec.priority ?? 0, ...(spec.config.max === undefined ? {} : { requested: spec.config.max }) })),
      ...queued.map((burst) => ({ id: `burst:${burst.seq}`, priority: burst.priority ?? 0, requested: Math.min(burst.count, burst.config.max ?? burst.count) })),
    ], cap, { effectCap: particleCap !== undefined && Number.isFinite(particleCap) ? particleCap : tier.particleCap });
    const granted = new Map(plan.grants.map((grant) => [grant.id, grant.particles]));
    budget.cap = cap; budget.particles = plan.particles; budget.dropped = plan.dropped;
    const liveIds = new Set<string>();
    for (const spec of specs) {
      const poolMax = granted.get(spec.id) ?? 0;
      if (poolMax <= 0) { dropEmitter(spec.id); continue; }
      liveIds.add(spec.id);
      const current = emitters.get(spec.id);
      const blending = spec.blending ?? "normal";
      const key = fieldKeyOf(blending, spec.render);
      if (current === undefined || current.poolMax !== poolMax) {
        const group = new THREE.Group();
        state.scene.add(group);
        const next: EmitterInstance = { spec, poolMax, group, pose: pose(spec), fieldKey: key,
          system: createParticleSystem({ ...spec.config, max: poolMax, seed: spec.config.seed ?? spec.id }, { collision: collisionFor(() => next.spec), acceleration: accelerationFor(() => next.spec) }),
          draw: null };
        next.draw = mountField(group, next.system, blending, spec.render);
        if (current !== undefined) {
          next.system.restore(current.system.snapshot());
          next.system.configure({ ...spec.config, max: poolMax, seed: spec.config.seed ?? spec.id }, true);
          dropEmitter(spec.id);
        }
        timing.poolsCreated++;
        emitters.set(spec.id, next);
        syncPose(next);
      } else if (current.spec !== spec) {
        if (current.fieldKey !== key) {
          // Field-affecting props changed: swap the field draw, keep the pool.
          if (current.draw !== null && current.group !== null) current.draw.dispose?.(fieldState(current.group));
          current.group?.clear();
          current.draw = mountField(current.group as THREE.Group, current.system, blending, spec.render);
          current.fieldKey = key;
        }
        current.system.configure({ ...spec.config, max: poolMax, seed: spec.config.seed ?? spec.id }, true);
        current.spec = spec;
        syncPose(current);
      }
    }
    for (const id of emitters.keys()) {
      if (liveIds.has(id)) continue;
      dropEmitter(id);
    }
    for (const burst of queued) {
      const named = burst.emitterId === undefined ? undefined : emitters.get(burst.emitterId);
      if (named !== undefined) {
        syncPose(named);
        named.system.emit(burst.count);
        continue;
      }
      const poolMax = granted.get(`burst:${burst.seq}`) ?? 0;
      if (poolMax <= 0) continue;
      const spec: ParticleEmitterSpec = { id: `burst:${burst.seq}`, config: burst.config, ...burst.options };
      const resolved = pose(spec);
      const system = createParticleSystem({ ...burst.config, rate: 0, max: poolMax, seed: burst.config.seed ?? burst.seq }, { collision: collisionFor(() => spec, resolved), acceleration: accelerationFor(() => spec, resolved) });
      if (spec.space !== "local") {
        const base = spec.follow === undefined ? burst.config.position ?? [0, 0, 0] : [0, 0, 0];
        system.configure({ position: [resolved.position[0] + base[0], resolved.position[1] + base[1], resolved.position[2] + base[2]] });
      }
      system.emit(Math.min(burst.count, poolMax));
      timing.poolsCreated++;
      const group = new THREE.Group();
      const burstPosition: Vec3 = spec.space === "local" ? resolved.position : [0, 0, 0];
      const burstYaw = spec.space === "local" ? resolved.yaw : 0;
      group.position.set(...burstPosition);
      group.rotation.y = burstYaw;
      state.scene.add(group);
      const blending = burst.blending ?? "additive";
      const draw = mountField(group, system, blending, spec.render);
      bursts.push({ seq: burst.seq, system, blending, render: spec.render, collisionEffect: spec.collisionEffect,
        position: burstPosition, rotationY: burstYaw, group, draw });
      if (bursts.length > MAX_CONCURRENT_BURSTS) {
        const dropped = bursts.shift();
        if (dropped !== undefined) {
          dropped.draw?.dispose?.(fieldState(dropped.group));
          dropGroup(dropped.group);
          timing.poolsRetired++;
        }
      }
    }
  }

  return {
    mount(mountState: EngineFrameState) {
      state = mountState;
      previousTime = ctx.time.now();
      // A burst mounts its field on the frame it fires; its program is linked under the loading cover instead.
      const programs = fieldPrograms();
      const scene = mountState.rootScene ?? mountState.scene;
      const unregisterWarmup = warmupSpawnables(scene, () => programs.objects);
      mountDispose.push(() => {
        unregisterWarmup();
        programs.dispose();
      });
      sync();
      unsubscribe = ctx.particles.subscribe(sync);
      if (diagnostics) {
        unregisterProbe = devtools.probes.register("particles", () => {
          let count = 0, capacity = 0, renderBufferBytes = 0;
          const read = (system: ParticleSystem) => {
            const buffers = system.buffers();
            count += system.count();
            capacity += buffers.positions.length / 3;
            renderBufferBytes += buffers.positions.byteLength + buffers.previousPositions.byteLength + buffers.velocities.byteLength + buffers.sizes.byteLength + buffers.colors.byteLength + buffers.alphas.byteLength + buffers.ids.byteLength;
          };
          for (const instance of emitters.values()) read(instance.system);
          for (const burst of bursts) read(burst.system);
          const sample = timing, fields = resources;
          return { scope: "ParticleEmitters", emitters: emitters.size, bursts: bursts.length, count, capacity, renderBufferBytes,
            cap: budget.cap, budgetParticles: budget.particles, dropped: budget.dropped.length, droppedIds: budget.dropped,
            poolsCreated: sample.poolsCreated, poolsRetired: sample.poolsRetired,
            updateSamples: sample.updateSamples, lastUpdateMs: sample.lastUpdateMs, maxUpdateMs: sample.maxUpdateMs,
            avgUpdateMs: sample.updateSamples === 0 ? 0 : sample.totalUpdateMs / sample.updateSamples,
            droppedCatchupSeconds: sample.droppedCatchupSeconds,
            resources: { ...fields, avgUploadMsPerField: fields.uploadSamples === 0 ? 0 : fields.totalUploadMs / fields.uploadSamples } };
        });
      }
    },
    frame(frameState: EngineFrameState) {
      const started = diagnostics ? performance.now() : 0;
      const gameTime = ctx.time.now();
      const dt = resolveParticleDelta(previousTime, gameTime);
      if (diagnostics) timing.droppedCatchupSeconds += Math.max(0, gameTime - previousTime - dt);
      previousTime = gameTime;
      const impacts: { effect: ParticleCollisionEffect; event: ParticleEvent }[] = [];
      const collect = (id: string, system: ParticleSystem, effect?: ParticleCollisionEffect, origin?: Vec3, yaw = 0) => {
        const events = system.drainEvents();
        for (const event of events) {
          if (origin !== undefined) {
            event.position = transformParticleVector(event.position, origin, yaw);
            event.velocity = transformParticleVector(event.velocity, [0, 0, 0], yaw);
            if (event.normal !== undefined) event.normal = transformParticleVector(event.normal, [0, 0, 0], yaw);
          }
          if (effect !== undefined && event.type === "collision" && impacts.length < 16) impacts.push({ effect, event });
        }
        ctx.particles.reportEvents(id, events);
      };
      for (const instance of emitters.values()) {
        syncPose(instance);
        instance.system.update(dt);
        const resolved = instance.spec.space === "local" ? instance.pose : undefined;
        collect(instance.spec.id, instance.system, instance.spec.collisionEffect, resolved?.position, resolved?.yaw);
      }
      let finished = false;
      for (const burst of bursts) {
        burst.system.update(dt);
        collect(`burst:${burst.seq}`, burst.system, burst.collisionEffect, burst.position, burst.rotationY);
        if (burst.system.count() === 0) finished = true;
      }
      if (finished) {
        for (let i = bursts.length - 1; i >= 0; i -= 1) {
          const burst = bursts[i]!;
          if (burst.system.count() > 0) continue;
          burst.draw?.dispose?.(fieldState(burst.group));
          dropGroup(burst.group);
          bursts.splice(i, 1);
          timing.poolsRetired++;
        }
      }
      for (const { effect, event } of impacts) {
        const { collision: _, ...config } = effect.config;
        ctx.particles.burst({ ...config, position: event.position, rate: 0, deathEvents: false }, effect.count, effect.blending, { render: effect.render });
      }
      // Fields pack their buffers after the systems advance so a frame never shows last tick's sim.
      for (const instance of emitters.values()) instance.draw?.frame?.(frameState);
      for (const burst of bursts) burst.draw?.frame?.(frameState);
      if (diagnostics) {
        const elapsed = performance.now() - started;
        timing.lastUpdateMs = elapsed; timing.totalUpdateMs += elapsed; timing.maxUpdateMs = Math.max(timing.maxUpdateMs, elapsed); timing.updateSamples++;
      }
    },
    dispose() {
      unsubscribe?.();
      unsubscribe = null;
      unregisterProbe?.();
      unregisterProbe = null;
      for (const dispose of mountDispose.splice(0)) dispose();
      timing.poolsRetired += emitters.size + bursts.length;
      for (const id of [...emitters.keys()]) dropEmitter(id);
      for (const burst of bursts.splice(0)) {
        burst.draw?.dispose?.(fieldState(burst.group));
        dropGroup(burst.group);
      }
      state = null;
    },
  };
}

/** Renders the director's emitters and bursts. @internal */
export function ParticleEmitters({ quality, particleCap, particleBudget, diagnostics = false }: { quality: GraphicsQuality; particleCap?: number; particleBudget?: number; diagnostics?: boolean }): ReactElement {
  const ctx = useGameContext();
  useEngineDraw(() => particleEmittersDraw(ctx, { quality, particleCap, particleBudget, diagnostics }), [ctx, quality, particleCap, particleBudget, diagnostics]);
  return <></>;
}
