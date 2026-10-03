import { describe, expect, test } from "bun:test";

import { createParticleDirector, validateParticleAttachOptions } from "./particleDirector";

describe("particleDirector", () => {
  test("bursts queue with monotonic seq and drain exactly once", () => {
    const director = createParticleDirector();
    director.burst({ colorStart: 0xff8800 }, 12, "additive");
    director.burst({ colorStart: 0x334455 }, 6);
    const drained = director.drainBursts();
    expect(drained.map((b) => b.seq)).toEqual([1, 2]);
    expect(drained[0]!.count).toBe(12);
    expect(drained[0]!.blending).toBe("additive");
    expect(director.drainBursts()).toEqual([]);
  });

  test("zero or negative burst counts are ignored", () => {
    const director = createParticleDirector();
    director.burst({}, 0);
    director.burst({}, -3);
    expect(director.drainBursts()).toEqual([]);
  });

  test("attach upserts, retune patches config, detach removes", () => {
    const director = createParticleDirector();
    director.attach("exhaust", { rate: 4 }, { follow: "kart", offset: [0, 0.4, -1] });
    director.retune("exhaust", { rate: 24 });
    expect(director.emitters()).toEqual([
      { id: "exhaust", config: { rate: 24 }, follow: "kart", offset: [0, 0.4, -1] },
    ]);
    director.attach("exhaust", { rate: 1 });
    expect(director.emitters()[0]!.follow).toBeUndefined();
    director.detach("exhaust");
    expect(director.emitters()).toEqual([]);
  });

  test("retune and detach on unknown ids are no-ops", () => {
    const director = createParticleDirector();
    let notified = 0;
    director.subscribe(() => notified++);
    director.retune("ghost", { rate: 1 });
    director.detach("ghost");
    expect(notified).toBe(0);
  });

  test("snapshot/restore round-trips emitters and seq, drops transient bursts", () => {
    const director = createParticleDirector();
    director.attach("dust", { rate: 8 }, { blending: "normal" });
    director.burst({}, 5);
    const state = director.snapshot();

    const twin = createParticleDirector();
    twin.burst({}, 99);
    twin.restore(state);
    expect(twin.emitters()).toEqual(director.emitters());
    expect(twin.drainBursts()).toEqual([]);
    twin.burst({}, 1);
    expect(twin.drainBursts()[0]!.seq).toBe(state.nextSeq);
  });

  test("subscribe fires on every mutation and unsubscribes cleanly", () => {
    const director = createParticleDirector();
    let notified = 0;
    const off = director.subscribe(() => notified++);
    director.burst({}, 1);
    director.attach("a", {});
    director.retune("a", { rate: 2 });
    director.detach("a");
    director.clear();
    expect(notified).toBe(5);
    off();
    director.burst({}, 1);
    expect(notified).toBe(5);
  });
});

describe("named particle lifecycle", () => {
  test("start and stop are idempotent and retain retunable config and binding", () => {
    const director = createParticleDirector();
    director.attach("torch", { rate: 3 }, { follow: "hero", space: "local", render: { shape: "flame" } });
    let changes = 0;
    director.subscribe(() => changes++);
    director.stop("torch");
    director.stop("torch");
    director.retune("torch", { rate: 5 }, { offset: [0, 1, 0] });
    expect(director.emitters()[0]).toMatchObject({ active: false, config: { rate: 5 }, follow: "hero", space: "local", offset: [0, 1, 0] });
    director.start("torch");
    director.start("torch");
    expect(changes).toBe(3);
    expect(director.emitters()[0]!.active).toBe(true);
  });

  test("named bursts carry stable source data and consume once even while stopped", () => {
    const director = createParticleDirector();
    director.attach("trail", { rate: 10, seed: "authored" }, { render: { shape: "ribbon" }, space: "world" });
    director.stop("trail");
    director.burstNamed("trail", 4);
    director.retune("trail", { rate: 20 });
    const burst = director.drainBursts()[0]!;
    expect(burst.emitterId).toBe("trail");
    expect(burst.config).toEqual({ rate: 10, seed: "authored" });
    expect(burst.options).toMatchObject({ active: false, render: { shape: "ribbon" } });
    expect(director.drainBursts()).toEqual([]);
  });

  test("transient queues, standing registry, and events obey their independent bounds", () => {
    const director = createParticleDirector({ maxEmitters: 1, maxBursts: 2, maxEvents: 1 });
    director.attach("a", {});
    expect(() => director.attach("b", {})).toThrow("Particle emitter capacity 1 exceeded by b");
    expect(director.limits()).toEqual({ maxEmitters: 1, maxBursts: 2, maxEvents: 1 });
    director.attach("a", { rate: 3 });
    director.burst({}, 1); director.burst({}, 2); director.burst({}, 3); director.burst({}, NaN);
    expect(director.emitters()).toHaveLength(1);
    expect(director.drainBursts().map((burst) => burst.count)).toEqual([1, 2]);
    const event = { type: "death" as const, particleId: 1, position: [0, 0, 0] as const, velocity: [0, 0, 0] as const };
    director.reportEvents("a", [event, event]);
    director.reportEvents("a", [event]);
    expect(director.drainEvents()).toEqual([{ ...event, emitterId: "a" }]);
    expect(director.drainEvents()).toEqual([]);
  });

  test("authored descriptors and snapshots are isolated from caller mutation", () => {
    const director = createParticleDirector();
    const config = { position: [1, 2, 3] as [number, number, number] };
    director.attach("a", config, { active: false });
    config.position[0] = 99;
    const snap = director.snapshot();
    snap.emitters[0]!.config.position = [4, 5, 6];
    expect(director.emitters()[0]!.config.position).toEqual([1, 2, 3]);
    const twin = createParticleDirector();
    twin.restore(director.snapshot());
    expect(twin.emitters()).toEqual(director.emitters());
    expect(twin.emitters()[0]!.active).toBe(false);
  });
});


test("authored particle output and collision-child validation", () => {
  expect(validateParticleAttachOptions({ space: "local", active: false, render: { shape: "flame" }, collisionEffect: { config: { lifetime: { min: 0.4, max: 0.4 } }, count: 3, render: { shape: "ripple" } } })).toEqual([]);
  expect(validateParticleAttachOptions({ follow: 1, space: "camera", render: { shape: "bad", stretch: -1 }, collisionEffect: { config: { rate: NaN }, count: Infinity } })).toHaveLength(6);
});
