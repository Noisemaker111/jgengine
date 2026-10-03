import { createEmptyEditorDocument } from "../packages/core/src/editor/document";
import type { EditorDocument } from "../packages/core/src/editor/types";
import { defineGameDefinition } from "../packages/core/src/game/defineGame";
import { createGameContext } from "../packages/core/src/runtime/gameContext";
import { createParticleSystem } from "../packages/core/src/vfx/particles";
import { seededRng } from "../packages/core/src/random/rng";

function fixture(enabled: boolean): EditorDocument {
  const doc = createEmptyEditorDocument();
  doc.volumes = Array.from({ length: 32 }, (_, i) => ({ id: `roof-${i}`, kind: "shelter", shape: "box", center: { x: (i % 8) * 8, y: 2, z: Math.floor(i / 8) * 8 }, halfExtents: { x: 2, y: 3, z: 2 } }));
  doc.simulation = {
    weather: { ambient: { mode: "rain", intensity: 0.8, temperatureOffset: -2 }, wind: { direction: [1, 0.3], speed: 3, gust: 1, turbulence: 0.5, seed: "perf" }, zones: Array.from({ length: 8 }, (_, i) => ({ id: `zone-${i}`, center: [i * 8, 10] as const, radius: 10, falloff: 3, wind: { speed: 1, turbulence: 0.2, seed: i }, radial: true })) },
    emitters: enabled ? Array.from({ length: 16 }, (_, i) => ({ id: `effect-${i}`, position: { x: i * 4, y: 3, z: 0 }, config: { rate: 24, max: 512, seed: i }, options: { render: { shape: "smoke" as const } } })) : [],
  };
  return doc;
}

function bench(enabled: boolean) {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "Weather CPU benchmark", multiplayer: "off", authoredDocument: fixture(enabled), persist: false, time: { scale: 1 }, simulation: { hz: 60 } }), content: {}, player: { userId: "bench", isNew: true }, rng: seededRng("fixed-perf") });
  for (let i = 0; i < 128; i++) ctx.environment.watch({ id: `surface-${i}`, x: (i % 16) * 4, y: 0, z: Math.floor(i / 16) * 4 });
  const pools = ctx.particles.emitters().map(spec => createParticleSystem({ ...spec.config, position: spec.config.position }, { acceleration: (position, _velocity, out) => { const value = ctx.environment.windAcceleration(position, 0.6, 2); out[0] = value[0]; out[1] = value[1]; out[2] = value[2]; return out; } }));
  const bufferBytes = () => pools.reduce((sum, pool) => sum + Object.values(pool.buffers()).reduce((bytes, array) => bytes + (ArrayBuffer.isView(array) ? array.byteLength : 0), 0), 0);
  const frame = () => ctx.sim.advance(1 / 60, (dt) => { ctx.sim.runStages("beforeMovement", dt); ctx.sim.runStages("afterMovement", dt); ctx.sim.runStages("afterTick", dt); for (const pool of pools) pool.update(dt); });
  for (let i = 0; i < 1500; i++) frame();
  const samples = new Float64Array(5000);
  Bun.gc(true);
  const before = process.memoryUsage();
  for (let i = 0; i < samples.length; i++) { const start = performance.now(); frame(); samples[i] = performance.now() - start; }
  Bun.gc(true);
  const after = process.memoryUsage();
  const sum = samples.reduce((a, b) => a + b, 0);
  samples.sort();
  const result = { cosmeticParticlePools: pools.length, particleCapacity: pools.length * 512, liveParticles: pools.reduce((sum, pool) => sum + pool.count(), 0), packedBufferBytes: bufferBytes(), watchedSurfaces: 128, authoredShelters: 32, localWindZones: 8, measuredSteps: samples.length, meanMs: sum / samples.length, p50Ms: samples[Math.floor(samples.length * 0.5)], p95Ms: samples[Math.floor(samples.length * 0.95)], heapRetainedDeltaBytes: after.heapUsed - before.heapUsed, arrayBufferRetainedDeltaBytes: after.arrayBuffers - before.arrayBuffers, finalTimeSeconds: ctx.time.now(), finalSnapshot: ctx.environment.snapshot() };
  pools.forEach(pool => pool.clear()); ctx.environment.dispose();
  return { ...result, liveParticlesAfterClear: pools.reduce((sum, pool) => sum + pool.count(), 0), namedEmittersAfterDispose: ctx.particles.emitters().length, watchedSurfacesAfterDispose: ctx.environment.snapshot().watched.length };
}
const off = bench(false);
const on = bench(true);
const { finalSnapshot: offState, ...offMetrics } = off;
const { finalSnapshot: onState, ...onMetrics } = on;
console.log(JSON.stringify({ runtime: Bun.version, scenarios: [offMetrics, onMetrics], authoritativeStateEqual: JSON.stringify(offState) === JSON.stringify(onState), scope: "CPU fixed-step authority plus seeded cosmetic particle pools with capped environment acceleration; no renderer/draw-call or GPU timing claim" }, null, 2));
