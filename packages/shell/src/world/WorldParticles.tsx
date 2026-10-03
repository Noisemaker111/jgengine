import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { Group } from "three";

import { devtools } from "@jgengine/core/devtools/devtools";
import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";
import { createParticleSystem, type ParticleEvent, type ParticleSystem, type Vec3 } from "@jgengine/core/vfx/particles";
import type { ParticleCollisionEffect, ParticleEmitterSpec, ParticleRenderHint } from "@jgengine/core/vfx/particleDirector";
import { useGameContext } from "@jgengine/react/provider";

import { ParticleField, type ParticleFieldMetrics } from "../vfx/ParticleField";

const QUALITY_POOL_CAP: Record<GraphicsQuality, number> = { low: 128, medium: 256, high: 512, ultra: 1024 };

/** The requested visual pool clamped to the graphics tier. */
export function resolveParticleBudget(quality: GraphicsQuality, requested: number | undefined, particleCap?: number): number {
  const rawCap = particleCap ?? QUALITY_POOL_CAP[quality];
  const cap = Number.isFinite(rawCap) ? Math.max(1, Math.floor(rawCap)) : QUALITY_POOL_CAP[quality];
  return Number.isFinite(requested) ? Math.max(1, Math.floor(Math.min(requested!, cap))) : cap;
}

interface ParticlePose { position: Vec3; yaw: number; found: boolean }

interface EmitterInstance {
  spec: ParticleEmitterSpec;
  system: ParticleSystem;
  poolMax: number;
  group: Group | null;
  pose: ParticlePose;
}

interface BurstInstance {
  seq: number;
  system: ParticleSystem;
  blending: "additive" | "normal";
  render?: ParticleRenderHint;
  position: Vec3;
  rotationY: number;
  collisionEffect?: ParticleCollisionEffect;
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

/** Renders the existing director and pooled simulator; named bursts reuse the standing pool. @internal */
export function WorldParticles({ quality, particleCap, diagnostics = false }: { quality: GraphicsQuality; particleCap?: number; diagnostics?: boolean }): ReactElement {
  const ctx = useGameContext();
  const emittersRef = useRef(new Map<string, EmitterInstance>());
  const burstsRef = useRef<BurstInstance[]>([]);
  const previousTime = useRef(ctx.time.now());
  const timing = useRef({ poolsCreated: 0, poolsRetired: 0, updateSamples: 0, lastUpdateMs: 0, totalUpdateMs: 0, maxUpdateMs: 0, droppedCatchupSeconds: 0 });
  const resources = useRef<ParticleFieldMetrics>({ fieldsMounted: 0, fieldsUnmounted: 0, liveFields: 0, attributeBytes: 0, totalUploadMs: 0, maxUploadMs: 0, uploadSamples: 0 });
  const [, setGeneration] = useState(0);

  function pose(spec: ParticleEmitterSpec): ParticlePose {
    const offset = spec.offset ?? [0, 0, 0];
    const entity = spec.follow === undefined ? undefined : ctx.scene.entity.get(spec.follow);
    if (entity === undefined || entity === null) return { position: offset, yaw: 0, found: spec.follow === undefined };
    if (spec.space === "local") return { position: transformParticleVector(offset, entity.position, entity.rotationY), yaw: entity.rotationY, found: true };
    return { position: [entity.position[0] + offset[0], entity.position[1] + offset[1], entity.position[2] + offset[2]], yaw: 0, found: true };
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
      const resolved = frozenPose ?? emittersRef.current.get(current.id)?.pose ?? pose(current);
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
      const resolved = frozenPose ?? emittersRef.current.get(current.id)?.pose ?? pose(current);
      const local = current.space === "local";
      const world = local ? transformParticleVector(position, resolved.position, resolved.yaw, false, worldScratch) : position;
      const force = ctx.environment.accelerationAt(world, ctx.time.now(), influence.windResponse ?? 0, influence.maxAcceleration ?? 100, influence.mask ?? 0xffffffff, forceScratch);
      const result = local ? transformParticleVector(force, ZERO, resolved.yaw, true, forceScratch) : force;
      out[0] = result[0]; out[1] = result[1]; out[2] = result[2];
      return out;
    };
  }

  useEffect(() => {
    const emitters = emittersRef.current;
    function sync(): void {
      let changed = false;
      const liveIds = new Set<string>();
      for (const spec of ctx.particles.emitters()) {
        liveIds.add(spec.id);
        const poolMax = resolveParticleBudget(quality, spec.config.max, particleCap);
        const current = emitters.get(spec.id);
        if (current === undefined || current.poolMax !== poolMax) {
          const next: EmitterInstance = { spec, poolMax, group: current?.group ?? null, pose: pose(spec),
            system: createParticleSystem({ ...spec.config, max: poolMax, seed: spec.config.seed ?? spec.id }, { collision: collisionFor(() => next.spec), acceleration: accelerationFor(() => next.spec) }) };
          if (current !== undefined) {
            next.system.restore(current.system.snapshot());
            next.system.configure({ ...spec.config, max: poolMax, seed: spec.config.seed ?? spec.id }, true);
          }
          timing.current.poolsCreated++;
          if (current !== undefined) timing.current.poolsRetired++;
          emitters.set(spec.id, next);
          syncPose(next);
          changed = true;
        } else if (current.spec !== spec) {
          if (specNeedsRender(current.spec, spec)) changed = true;
          current.system.configure({ ...spec.config, max: poolMax, seed: spec.config.seed ?? spec.id }, true);
          current.spec = spec;
          syncPose(current);
        }
      }
      for (const id of emitters.keys()) {
        if (liveIds.has(id)) continue;
        emitters.delete(id);
        timing.current.poolsRetired++;
        changed = true;
      }
      for (const burst of ctx.particles.drainBursts()) {
        const named = burst.emitterId === undefined ? undefined : emitters.get(burst.emitterId);
        if (named !== undefined) {
          syncPose(named);
          named.system.emit(burst.count);
          continue;
        }
        const poolMax = resolveParticleBudget(quality, Math.min(burst.count, burst.config.max ?? burst.count), particleCap);
        const spec: ParticleEmitterSpec = { id: `burst:${burst.seq}`, config: burst.config, ...burst.options };
        const resolved = pose(spec);
        const system = createParticleSystem({ ...burst.config, rate: 0, max: poolMax, seed: burst.config.seed ?? burst.seq }, { collision: collisionFor(() => spec, resolved), acceleration: accelerationFor(() => spec, resolved) });
        if (spec.space !== "local") {
          const base = spec.follow === undefined ? burst.config.position ?? [0, 0, 0] : [0, 0, 0];
          system.configure({ position: [resolved.position[0] + base[0], resolved.position[1] + base[1], resolved.position[2] + base[2]] });
        }
        system.emit(burst.count);
        timing.current.poolsCreated++;
        burstsRef.current.push({ seq: burst.seq, system, blending: burst.blending ?? "additive", render: spec.render, collisionEffect: spec.collisionEffect,
          position: spec.space === "local" ? resolved.position : [0, 0, 0], rotationY: spec.space === "local" ? resolved.yaw : 0 });
        if (burstsRef.current.length > MAX_CONCURRENT_BURSTS) { burstsRef.current.shift(); timing.current.poolsRetired++; }
        changed = true;
      }
      if (changed) setGeneration((n) => n + 1);
    }
    sync();
    const off = ctx.particles.subscribe(sync);
    return off;
  }, [ctx, quality, particleCap]);

  useEffect(() => {
    if (!diagnostics) return;
    return devtools.probes.register("particles", () => {
      let count = 0, capacity = 0, renderBufferBytes = 0;
      const read = (system: ParticleSystem) => {
        const buffers = system.buffers();
        count += system.count();
        capacity += buffers.positions.length / 3;
        renderBufferBytes += buffers.positions.byteLength + buffers.previousPositions.byteLength + buffers.velocities.byteLength + buffers.sizes.byteLength + buffers.colors.byteLength + buffers.alphas.byteLength + buffers.ids.byteLength;
      };
      for (const instance of emittersRef.current.values()) read(instance.system);
      for (const burst of burstsRef.current) read(burst.system);
      const sample = timing.current, fields = resources.current;
      return { scope: "WorldParticles", emitters: emittersRef.current.size, bursts: burstsRef.current.length, count, capacity, renderBufferBytes,
        poolsCreated: sample.poolsCreated, poolsRetired: sample.poolsRetired,
        updateSamples: sample.updateSamples, lastUpdateMs: sample.lastUpdateMs, maxUpdateMs: sample.maxUpdateMs,
        avgUpdateMs: sample.updateSamples === 0 ? 0 : sample.totalUpdateMs / sample.updateSamples,
        droppedCatchupSeconds: sample.droppedCatchupSeconds,
        resources: { ...fields, avgUploadMsPerField: fields.uploadSamples === 0 ? 0 : fields.totalUploadMs / fields.uploadSamples } };
    });
  }, [ctx, diagnostics]);

  useEffect(() => {
    previousTime.current = ctx.time.now();
    return () => {
      timing.current.poolsRetired += emittersRef.current.size + burstsRef.current.length;
      emittersRef.current.clear(); burstsRef.current = [];
    };
  }, [ctx]);

  useFrame(() => {
    const started = diagnostics ? performance.now() : 0;
    const gameTime = ctx.time.now();
    const dt = resolveParticleDelta(previousTime.current, gameTime);
    if (diagnostics) timing.current.droppedCatchupSeconds += Math.max(0, gameTime - previousTime.current - dt);
    previousTime.current = gameTime;
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
    for (const instance of emittersRef.current.values()) {
      syncPose(instance);
      instance.system.update(dt);
      const resolved = instance.spec.space === "local" ? instance.pose : undefined;
      collect(instance.spec.id, instance.system, instance.spec.collisionEffect, resolved?.position, resolved?.yaw);
    }
    let finished = false;
    for (const burst of burstsRef.current) {
      burst.system.update(dt);
      collect(`burst:${burst.seq}`, burst.system, burst.collisionEffect, burst.position, burst.rotationY);
      if (burst.system.count() === 0) { finished = true; timing.current.poolsRetired++; }
    }
    if (finished) {
      burstsRef.current = burstsRef.current.filter((burst) => burst.system.count() > 0);
      setGeneration((n) => n + 1);
    }
    for (const { effect, event } of impacts) {
      const { collision: _, ...config } = effect.config;
      ctx.particles.burst({ ...config, position: event.position, rate: 0, deathEvents: false }, effect.count, effect.blending, { render: effect.render });
    }
    if (diagnostics) {
      const elapsed = performance.now() - started, sample = timing.current;
      sample.lastUpdateMs = elapsed; sample.totalUpdateMs += elapsed; sample.maxUpdateMs = Math.max(sample.maxUpdateMs, elapsed); sample.updateSamples++;
    }
  });

  return <>
    {Array.from(emittersRef.current.values()).map((instance) => <group key={instance.spec.id}
      ref={(group) => { instance.group = group; }}>
      <ParticleField system={instance.system} advance={false} blending={instance.spec.blending ?? "normal"} render={instance.spec.render} metrics={diagnostics ? resources.current : undefined} />
    </group>)}
    {burstsRef.current.map((burst) => <group key={burst.seq} position={burst.position} rotation={[0, burst.rotationY, 0]}>
      <ParticleField system={burst.system} advance={false} blending={burst.blending} render={burst.render} metrics={diagnostics ? resources.current : undefined} />
    </group>)}
  </>;
}
