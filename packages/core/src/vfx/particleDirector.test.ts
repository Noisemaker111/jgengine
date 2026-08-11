import { describe, expect, test } from "bun:test";

import { createParticleDirector } from "./particleDirector";

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
