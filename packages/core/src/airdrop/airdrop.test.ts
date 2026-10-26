import { describe, expect, test } from "bun:test";

import { createAirdropField, type AirdropOptions } from "./airdrop";

/** A seeded generator, so each run rolls the same. */
function rngOf(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

const OPTIONS: AirdropOptions = {
  tiers: [
    { id: "white", minLevel: 3 },
    { id: "red", minLevel: 60 },
  ],
  sites: [
    { id: "beach", at: [0, 2, 0], tiers: [{ tier: "white", weight: 1 }] },
    { id: "peak", at: [500, 80, 500], tiers: [{ tier: "red", weight: 1 }] },
  ],
  dropHeight: 150,
  fallSeconds: 120,
  lastsSeconds: 600,
  respawnSeconds: [300, 600],
  roll: (tier) => (tier === "white" ? [{ item: "thatch", count: 40 }, { item: "stone", count: 10 }] : [{ item: "metal", count: 30 }]),
};

describe("airdrops", () => {
  test("a world under way already has crates down, one per site at most", () => {
    const field = createAirdropField(OPTIONS);
    const rng = rngOf(7);
    field.tick(10_000, rng);
    // Over an hour every site sends crates, never two at once.
    let landings = 0;
    for (let now = 10_000; now < 13_600; now += 5) {
      landings += field.tick(now, rng).landed.length;
      for (const site of ["beach", "peak"]) expect(field.list(now).filter((drop) => drop.site === site).length).toBeLessThanOrEqual(1);
    }
    expect(landings).toBeGreaterThanOrEqual(4);
  });

  test("a crate falls from its drop height over its fall time, then lands with its tier's loot", () => {
    const field = createAirdropField({ ...OPTIONS, sites: [OPTIONS.sites[0]!] });
    const rng = rngOf(3);
    let now = 0;
    let released = null as ReturnType<typeof field.list>[number] | null;
    // The first tick seeds a world under way, so wait for a crate released now, still up in the sky.
    for (; now < 5000 && released === null; now += 1) released = field.tick(now, rng).released.find((drop) => drop.releasedAt > now - 1) ?? null;
    if (released === null) throw new Error("no crate released");
    const mid = released.releasedAt + 60;
    expect(field.altitude(released, released.releasedAt)).toBeCloseTo(150, 6);
    expect(field.altitude(released, mid)).toBeCloseTo(75, 6);
    expect(field.nearest([0, 2, 0], 5, mid)).toBeNull();
    const landed = field.tick(released.landsAt, rng).landed;
    expect(landed).toHaveLength(1);
    expect(landed[0]!.contents).toEqual([{ item: "thatch", count: 40 }, { item: "stone", count: 10 }]);
    expect(field.altitude(landed[0]!, released.landsAt)).toBe(0);
    expect(field.nearest([1, 2, 1], 5, released.landsAt)?.id).toBe(landed[0]!.id);
  });

  test("only a player of the tier's level opens it, and an emptied crate is gone until the site sends another", () => {
    const field = createAirdropField({ ...OPTIONS, sites: [OPTIONS.sites[1]!] });
    const rng = rngOf(11);
    let now = 0;
    let crate = null as ReturnType<typeof field.nearest>;
    for (; now < 5000 && crate === null; now += 1) {
      field.tick(now, rng);
      crate = field.nearest([500, 80, 500], 3, now);
    }
    expect(crate).not.toBeNull();
    expect(field.opens("red", 59)).toBe(false);
    expect(field.opens("red", 60)).toBe(true);
    expect(field.levelFor("red")).toBe(60);
    // Room for ten of the thirty metal: the rest waits in the crate.
    expect(field.take(crate!.id, () => 10, now, rng)).toEqual([{ item: "metal", count: 10 }]);
    expect(field.nearest([500, 80, 500], 3, now)?.contents).toEqual([{ item: "metal", count: 20 }]);
    expect(field.take(crate!.id, (stack) => stack.count, now, rng)).toEqual([{ item: "metal", count: 20 }]);
    expect(field.list(now)).toHaveLength(0);
    // The next one starts down between five and ten minutes later.
    expect(field.tick(now + 299, rng).released).toHaveLength(0);
    let released = 0;
    for (let t = now + 300; t <= now + 600; t += 1) released += field.tick(t, rng).released.length;
    expect(released).toBe(1);
  });

  test("calling a drop sends one now of the asked tier, replacing the site's crate, and leaves the other sites on their timers", () => {
    const field = createAirdropField({ ...OPTIONS, sites: [{ id: "beach", at: [0, 2, 0], tiers: [{ tier: "white", weight: 1 }, { tier: "red", weight: 1 }] }, OPTIONS.sites[1]!] });
    const rng = rngOf(13);
    const first = field.call("beach", 100, rng, "red")!;
    expect(first.tier).toBe("red");
    expect(field.altitude(first, 100)).toBeCloseTo(150, 6);
    expect(field.call("nowhere", 100, rng)).toBeNull();
    expect(() => field.call("beach", 100, rng, "gold")).toThrow("unknown tier");
    // Landed, then called again: the landed crate is gone, a fresh one falls in its place.
    expect(field.tick(220, rng).landed.map((drop) => drop.id)).toEqual([first.id]);
    const second = field.call("beach", 230, rng, "white")!;
    expect(field.list(230).filter((drop) => drop.site === "beach").map((drop) => drop.id)).toEqual([second.id]);
    // The peak was never called, and still sends its own within a crate's life plus its longest wait.
    let peak = 0;
    for (let now = 230; now < 230 + 120 + 600 + 600; now += 5) peak += field.tick(now, rng).released.filter((drop) => drop.site === "peak").length;
    expect(peak).toBeGreaterThanOrEqual(1);
  });

  test("a crate left alone breaks apart when its time is up, and the save keeps falling and landed crates", () => {
    const field = createAirdropField(OPTIONS);
    const rng = rngOf(5);
    for (let now = 0; now < 2000; now += 5) field.tick(now, rng);
    const before = field.list(2000).map((drop) => drop.id);
    const copy = createAirdropField(OPTIONS);
    copy.restore(structuredClone(field.snapshot()));
    expect(copy.list(2000).map((drop) => drop.id)).toEqual(before);
    const landedCrate = field.list(2000).find((drop) => drop.until !== null);
    if (landedCrate !== undefined) {
      const expired = field.tick(landedCrate.until! + 1, rng).expired.map((drop) => drop.id);
      expect(expired).toContain(landedCrate.id);
    }
    expect(() => createAirdropField({ ...OPTIONS, sites: [{ id: "x", at: [0, 0, 0], tiers: [{ tier: "gold", weight: 1 }] }] })).toThrow("unknown tier");
  });
});
