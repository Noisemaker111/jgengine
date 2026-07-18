import { describe, expect, test } from "bun:test";
import { createStats } from "@jgengine/core/stats/statModifiers";

type PlayerStat = "speed" | "jumpHeight" | "gravity";

describe("stat modifiers", () => {
  test("resolves base value with no sources", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    expect(stats.get("speed")).toBe(10);
  });

  test("applies a single add modifier", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    stats.addSource("boots", { speed: { add: 4 } });
    expect(stats.get("speed")).toBe(14);
  });

  test("applies a single multiply modifier", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    stats.addSource("haste", { speed: { multiply: 1.5 } });
    expect(stats.get("speed")).toBe(15);
  });

  test("combines adds then multiplies across multiple sources", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    stats.addSource("armor", { speed: { add: 2 } });
    stats.addSource("potion", { speed: { add: 3, multiply: 2 } });
    stats.addSource("curse", { speed: { multiply: 0.5 } });

    expect(stats.get("speed")).toBe((10 + 2 + 3) * 2 * 0.5);
  });

  test("re-adding an existing sourceId replaces its modifiers", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    stats.addSource("armor", { speed: { add: 5 } });
    expect(stats.get("speed")).toBe(15);

    stats.addSource("armor", { speed: { add: 1 } });
    expect(stats.get("speed")).toBe(11);
    expect(stats.sources()).toEqual(["armor"]);
  });

  test("removeSource restores the prior value", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    stats.addSource("armor", { speed: { add: 5 } });
    stats.removeSource("armor");

    expect(stats.get("speed")).toBe(10);
    expect(stats.hasSource("armor")).toBe(false);
  });

  test("expired sources are ignored by get when nowMs is passed", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    stats.addSource("potion", { speed: { add: 10 } }, { expiresAtMs: 1000 });

    expect(stats.get("speed", 500)).toBe(20);
    expect(stats.get("speed", 1000)).toBe(10);
    expect(stats.get("speed", 1500)).toBe(10);
  });

  test("get with nowMs auto-removes expired sources so hasSource cleans up", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    stats.addSource("potion", { speed: { add: 10 } }, { expiresAtMs: 1000 });

    expect(stats.hasSource("potion")).toBe(true);
    expect(stats.get("speed", 1000)).toBe(10);
    expect(stats.hasSource("potion")).toBe(false);
  });

  test("hasSource with nowMs expires without a separate prune call", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    stats.addSource("potion", { speed: { add: 10 } }, { expiresAtMs: 1000 });

    expect(stats.hasSource("potion", 500)).toBe(true);
    expect(stats.hasSource("potion", 1000)).toBe(false);
    expect(stats.get("speed")).toBe(10);
  });

  test("expiry is not evaluated when nowMs is omitted and no clock is bound", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    stats.addSource("potion", { speed: { add: 10 } }, { expiresAtMs: 1 });

    expect(stats.get("speed")).toBe(20);
  });

  test("a bound clock auto-expires timed sources on get without an explicit nowMs", () => {
    let nowMs = 500;
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 }, { now: () => nowMs });
    stats.addSource("potion", { speed: { add: 10 } }, { expiresAtMs: 1000 });

    expect(stats.get("speed")).toBe(20);
    nowMs = 1000;
    expect(stats.get("speed")).toBe(10);
    expect(stats.hasSource("potion")).toBe(false);
  });

  test("pruneExpired removes expired sources and returns their ids", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    stats.addSource("potion", { speed: { add: 10 } }, { expiresAtMs: 1000 });
    stats.addSource("armor", { speed: { add: 1 } });

    const pruned = stats.pruneExpired(1000);

    expect(pruned).toEqual(["potion"]);
    expect(stats.hasSource("potion")).toBe(false);
    expect(stats.hasSource("armor")).toBe(true);
    expect(stats.get("speed")).toBe(11);
  });

  test("a modifier set entry for a stat the source does not target is inert", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    stats.addSource("armor", { jumpHeight: { add: 2 } });

    expect(stats.get("speed")).toBe(10);
    expect(stats.get("jumpHeight")).toBe(7);
    expect(stats.get("gravity")).toBe(20);
  });

  test("setBase and getBase update the underlying base value", () => {
    const stats = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    stats.setBase("speed", 25);

    expect(stats.getBase("speed")).toBe(25);
    expect(stats.get("speed")).toBe(25);
  });

  test("snapshot round-trips through JSON and resumes against an injected clock", () => {
    let nowMs = 400;
    const original = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 }, { now: () => nowMs });
    original.addSource("potion", { speed: { add: 6 } }, { expiresAtMs: 1000 });
    original.addSource("boots", { jumpHeight: { multiply: 1.5 } });

    const decoded = JSON.parse(JSON.stringify(original.snapshot()));
    const restored = createStats<PlayerStat>({ speed: 0, jumpHeight: 0, gravity: 0 }, { now: () => nowMs });
    restored.restore(decoded);

    expect(restored.get("speed")).toBe(16);
    expect(restored.get("jumpHeight")).toBe(7.5);
    nowMs = 1000;
    expect(restored.get("speed")).toBe(10);
    expect(restored.sources()).toEqual(["boots"]);
  });

  test("snapshot and restore detach nested modifier data and replace prior state", () => {
    const original = createStats<PlayerStat>({ speed: 10, jumpHeight: 5, gravity: 20 });
    original.addSource("boots", { speed: { add: 4 } });
    const snapshot = original.snapshot();

    original.setBase("speed", 100);
    original.addSource("boots", { speed: { add: 99 } });
    expect(snapshot.base.speed).toBe(10);
    expect(snapshot.sources[0]?.modifiers.speed?.add).toBe(4);

    original.restore(snapshot);
    expect(original.get("speed")).toBe(14);
    expect(original.sources()).toEqual(["boots"]);
  });
});
