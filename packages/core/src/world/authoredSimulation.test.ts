import { expect, test } from "bun:test";
import { createEmptyEditorDocument } from "../editor/document";
import type { EditorDocument } from "../editor/types";
import { defineGameDefinition } from "../game/defineGame";
import { createGameContext } from "../runtime/gameContext";
import { createContextSimSnapshot } from "../runtime/simSnapshot";
import { seededRng } from "../random/rng";

function document(): EditorDocument {
  return { ...createEmptyEditorDocument(), volumes: [{ id: "roof", kind: "shelter", shape: "box", center: { x: 0, y: 1, z: 0 }, halfExtents: { x: 2, y: 2, z: 2 } }], simulation: {
    weather: { ambient: { mode: "rain", intensity: 1 }, profiles: [{ id: "snow", mode: "snow", intensity: 1, temperatureOffset: -5 }], schedule: [{ atSeconds: 1, profileId: "snow", transitionSeconds: 0.5 }], wind: { direction: [1, 0], speed: 10 } },
    fires: [{ id: "fire", position: { x: 8, y: 0, z: 0 }, config: { cols: 2, rows: 1, cellSize: 1, burnRate: 0.2 }, ignitions: [{ col: 0, row: 0 }] }],
    emitters: [{ id: "rain", position: { x: 0, y: 4, z: 0 }, config: { rate: 20, max: 32, seed: 4 }, options: { render: { shape: "streak" } } }],
    forces: [{ center: [5, 0, 0], shape: { kind: "sphere", radius: 4 }, strength: 2, vortex: { axis: [0, 1, 0], strength: 3 }, directionality: 0.5, direction: [0, 1, 0], mask: 1 }],
  } };
}
function context(cosmetics: boolean) {
  const authored = document();
  if (!cosmetics) authored.simulation!.emitters = [];
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "Weather authority", multiplayer: "off", authoredDocument: authored, simulation: { hz: 20 }, time: { scale: 2 }, persist: false }), content: {}, player: { userId: "observer", isNew: true }, rng: seededRng("weather") });
  ctx.environment.watch({ id: "open", x: 8, y: 0, z: 0 });
  ctx.environment.watch({ id: "covered", x: 0, y: 0, z: 0 });
  return ctx;
}
function advance(ctx: ReturnType<typeof context>, seconds: number) {
  ctx.sim.advance(seconds, (dt) => { ctx.sim.runStages("beforeMovement", dt); ctx.sim.runStages("afterMovement", dt); ctx.sim.runStages("afterTick", dt); });
}
test("fixed game time drives schedules, shelter accumulation and wind independent of cosmetics", () => {
  const visible = context(true), hidden = context(false);
  for (let i = 0; i < 5; i++) { advance(visible, 0.1); advance(hidden, 0.1); }
  expect(visible.time.now()).toBeCloseTo(1);
  expect(visible.environment.sample(8, 0)).toEqual(hidden.environment.sample(8, 0));
  expect(visible.environment.snapshot()).toEqual(hidden.environment.snapshot());
  expect(visible.environment.surfaces.sample("open")!.wetness).toBeGreaterThan(0);
  expect(visible.environment.surfaces.sample("covered")!.wetness).toBe(0);
  expect(visible.environment.windAcceleration([8, 0, 0], 2, 4)).toEqual([4, 0, 0]);
  expect(visible.environment.accelerationAt([6, 0, 0], 1, 0, 100, 0)).toEqual([0, 0, 0]);
  expect(visible.environment.accelerationAt([6, 0, 0], 1, 0, 100, 1)[1]).toBeGreaterThan(0);
});
test("pause, whole simulation restore and durable runtime restore retain state without authored writeback", () => {
  const ctx = context(true), authored = document();
  advance(ctx, 0.1);
  const registry = createContextSimSnapshot(ctx), saved = registry.snapshot(), world = ctx.state(), baseline = ctx.environment.snapshot();
  ctx.time.pause();
  advance(ctx, 0.1);
  expect(ctx.environment.snapshot()).toEqual(baseline);
  ctx.time.play();
  advance(ctx, 0.1);
  const progressed = ctx.environment.snapshot();
  registry.restore(saved);
  advance(ctx, 0.1);
  expect(ctx.environment.snapshot()).toEqual(progressed);
  const reopened = context(true);
  reopened.restore(world);
  expect(reopened.environment.snapshot()).toEqual(baseline);
  expect(authored.simulation!.fires![0]!.config.burnRate).toBe(0.2);
});
test("weather retuning preserves progressed fire and teardown releases authored effects", () => {
  const ctx = context(true);
  advance(ctx, 0.1);
  const fuel = ctx.environment.fire("fire")!.cell(0, 0).fuel;
  const next = document(); next.simulation!.weather!.ambient = { mode: "clear", intensity: 0 };
  ctx.environment.retune(next);
  expect(ctx.environment.fire("fire")!.cell(0, 0).fuel).toBe(fuel);
  expect(ctx.particles.emitters()).toHaveLength(1);
  ctx.environment.dispose();
  expect(ctx.particles.emitters()).toHaveLength(0);
});

test("unrelated retunes preserve emitter identity and rejected capacity edits remain atomic", async () => {
  const { createAuthoredSimulation } = await import("./authoredSimulation");
  const { createParticleDirector } = await import("../vfx/particleDirector");
  const director = createParticleDirector({ maxEmitters: 2 });
  director.attach("game-effect", { max: 2, rate: 1 });
  const original = document();
  const runtime = createAuthoredSimulation({ document: original, timeSeconds: () => 0, particles: director });
  const emitter = director.emitters().find((entry) => entry.id === "authored:rain");
  let notifications = 0;
  director.subscribe(() => notifications++);
  const clear = document(); clear.simulation!.weather!.ambient = { mode: "clear", intensity: 0 };
  runtime.retune(clear);
  expect(director.emitters().find((entry) => entry.id === "authored:rain")).toBe(emitter);
  expect(notifications).toBe(0);
  const before = runtime.snapshot();
  const rejected = document(); rejected.simulation!.emitters = [...rejected.simulation!.emitters!, { id: "overflow", position: { x: 0, y: 0, z: 0 }, config: { max: 2 } }];
  expect(() => runtime.retune(rejected)).toThrow("capacity");
  expect(runtime.snapshot()).toEqual(before);
  expect(runtime.sample(0, 0).mode).toBe("clear");
  expect(director.emitters().find((entry) => entry.id === "authored:rain")).toBe(emitter);
  expect(notifications).toBe(0);
  expect(() => runtime.accelerationAt([0, NaN, 0], 0, 0, 1)).toThrow();
  expect(() => runtime.accelerationAt([0, 0, 0], 0, 0, 1, -1)).toThrow();
  runtime.dispose();
});

test("malformed restored fires, watches and flock vectors leave all authority untouched", async () => {
  const { createAuthoredSimulation } = await import("./authoredSimulation");
  const authored = document();
  authored.simulation!.habitats = [{ id: "birds", species: "swallow", position: { x: 0, y: 3, z: 0 }, radius: 5, count: 2, seed: 7, role: "cosmetic", steering: { maxSpeed: 3, separationRadius: 1, neighborRadius: 4 } }];
  const runtime = createAuthoredSimulation({ document: authored, timeSeconds: () => 0.1 });
  runtime.watch({ id: "a", x: 8, z: 0 });
  runtime.watch({ id: "b", x: 9, z: 0 });
  runtime.step(0.1);
  const baseline = runtime.snapshot();
  const malformed = [
    (state: typeof baseline) => { state.watched[1] = state.watched[0]!; },
    (state: typeof baseline) => { state.fires = []; },
    (state: typeof baseline) => { state.fires[0]!.cells[0]!.heat = NaN; },
    (state: typeof baseline) => { state.flocks[0]!.agents[0]!.position = [1, 2] as unknown as readonly [number, number, number]; },
    (state: typeof baseline) => { state.flocks[0]!.routeIndex = 1; },
  ];
  for (const mutate of malformed) {
    const state = structuredClone(baseline);
    state.surfaces.surfaces[0]!.value.wetness = 0.9;
    mutate(state);
    expect(() => runtime.restore(state)).toThrow();
    expect(runtime.snapshot()).toEqual(baseline);
  }
  runtime.dispose();
});

test("habitats opt into capped weather force and preserve poses while steering retunes", async () => {
  const { createAuthoredSimulation } = await import("./authoredSimulation");
  const authored = document();
  authored.simulation!.weather = { wind: { direction: [1, 0], speed: 100 } };
  authored.simulation!.habitats = [{ id: "birds", species: "swallow", position: { x: 0, y: 3, z: 0 }, radius: 1, count: 1, seed: 7, role: "cosmetic", windResponse: 1, maxAcceleration: 2, forceMask: 0, steering: { maxSpeed: 20, separationRadius: 1, neighborRadius: 4, seekWeight: 0 } }];
  const runtime = createAuthoredSimulation({ document: authored, timeSeconds: () => 0.1 });
  const initial = runtime.snapshot().flocks[0]!.agents[0]!;
  runtime.step(0.1);
  const progressed = runtime.snapshot().flocks[0]!.agents[0]!;
  expect(progressed.velocity).toEqual([0.2, 0, 0]);
  expect(progressed.position[0] - initial.position[0]).toBeCloseTo(0.02);
  const next = structuredClone(authored);
  next.simulation!.habitats![0]!.steering.maxSpeed = 30;
  runtime.retune(next);
  expect(runtime.snapshot().flocks[0]!.agents[0]).toEqual(progressed);
  const saved = runtime.snapshot();
  runtime.step(0.1);
  const advanced = runtime.snapshot();
  runtime.restore(saved);
  runtime.step(0.1);
  expect(runtime.snapshot()).toEqual(advanced);
  runtime.dispose();
});

test("fire binding stops spawning on extinction and appearance signals keep Celsius separate", () => {
  const ctx = context(true);
  const next = document();
  next.simulation!.emitters = [{ id: "flame", fireAreaId: "fire", position: { x: 8, y: 0, z: 0 }, config: { rate: 12, max: 32 }, options: { render: { shape: "flame" } } }];
  ctx.environment.retune(next);
  expect(ctx.particles.emitters()[0]!.active).toBe(true);
  const signal = ctx.environment.appearanceAt("open", [8, 0, 0]);
  expect(signal.heat).toBe(1);
  expect(signal.wind).toEqual([10, 0, 0]);
  expect(signal.temperatureOffsetC).toBe(0);
  const out: [number, number, number] = [9, 9, 9];
  expect(ctx.environment.accelerationAt([8, 0, 0], 0, 1, 3, 0, out)).toBe(out);
  expect(out).toEqual([3, 0, 0]);
  ctx.environment.fire("fire")!.extinguish(8, 0);
  advance(ctx, 0.05);
  expect(ctx.particles.emitters()[0]!.active).toBe(false);
  ctx.environment.fire("fire")!.ignite(8, 0);
  advance(ctx, 0.05);
  expect(ctx.particles.emitters()[0]!.active).toBe(true);
  next.simulation!.emitters[0]!.options!.active = false;
  ctx.environment.retune(next);
  expect(ctx.particles.emitters()[0]!.active).toBe(false);
  ctx.environment.dispose();
});


test("environment rejects overflowing coupling before writing the caller's acceleration buffer", () => {
  const ctx = context(true);
  const out: [number, number, number] = [7, 8, 9];
  expect(() => ctx.environment.accelerationAt([0, 0, 0], 0, 1e308, 5, 0, out)).toThrow();
  expect(out).toEqual([7, 8, 9]);
  expect(() => ctx.environment.windAcceleration([0, 0, 0], 1e308, 5)).toThrow();
  const acceleration = ctx.environment.accelerationAt([0, 0, 0], 0, 1e12, 5);
  expect(acceleration.every(Number.isFinite)).toBe(true);
  expect(Math.hypot(...acceleration)).toBeCloseTo(5);
  ctx.environment.dispose();
});
