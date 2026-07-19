import { describe, expect, test } from "bun:test";
import { createFireCadence, createWeaponRuntime } from "./weaponFire";
import type { DamageHitInput } from "./damageResolution";

describe("createFireCadence", () => {
  test("starts ready, blocks until the interval elapses, and reports progress", () => {
    const cadence = createFireCadence({ intervalMs: 250 });
    expect(cadence.ready()).toBe(true);
    expect(cadence.fire()).toBe(true);
    expect(cadence.ready()).toBe(false);
    expect(cadence.remainingMs()).toBe(250);
    expect(cadence.fire()).toBe(false);

    cadence.tick(0.1);
    expect(cadence.readyFraction()).toBeCloseTo(0.4, 5);
    expect(cadence.ready()).toBe(false);

    cadence.tick(0.2);
    expect(cadence.ready()).toBe(true);
    expect(cadence.readyFraction()).toBe(1);
  });

  test("intervalMs <= 0 means always ready", () => {
    const cadence = createFireCadence({ intervalMs: 0 });
    expect(cadence.fire()).toBe(true);
    expect(cadence.ready()).toBe(true);
  });

  test("elapsedMs round-trips through restore", () => {
    const a = createFireCadence({ intervalMs: 200, ready: false });
    a.tick(0.05);
    const b = createFireCadence({ intervalMs: 200 });
    b.restore(a.elapsedMs());
    expect(b.elapsedMs()).toBe(a.elapsedMs());
    expect(b.remainingMs()).toBe(a.remainingMs());
  });
});

interface TestHit {
  target: string;
  wall?: boolean;
}

function damageFor(hit: TestHit): DamageHitInput | null {
  if (hit.wall === true) return null;
  return { channel: "kinetic", impact: 10, target: hit.target };
}

describe("createWeaponRuntime", () => {
  test("gates on cadence: a second immediate shot is blocked without spending resolution", () => {
    let calls = 0;
    const weapon = createWeaponRuntime<{ dir: number }, TestHit>({
      cadenceMs: 500,
      resolveHits: () => {
        calls += 1;
        return [{ target: "dummy" }];
      },
      damageFor,
    });

    const first = weapon.fire({ dir: 0 });
    expect(first.status).toBe("fired");
    expect(first.resolutions).toHaveLength(1);
    expect(first.resolutions[0]?.impact).toBe(10);

    const second = weapon.fire({ dir: 0 });
    expect(second.status).toBe("cooling");
    expect(second.hits).toHaveLength(0);
    expect(calls).toBe(1);

    weapon.tick(0.5);
    expect(weapon.fire({ dir: 0 }).status).toBe("fired");
    expect(calls).toBe(2);
  });

  test("skips damage for hits that map to null but keeps them in hits", () => {
    const weapon = createWeaponRuntime<null, TestHit>({
      cadenceMs: 0,
      resolveHits: () => [{ target: "a" }, { wall: true, target: "wall" }, { target: "b" }],
      damageFor,
    });
    const result = weapon.fire(null);
    expect(result.status).toBe("fired");
    expect(result.hits).toHaveLength(3);
    expect(result.resolutions).toHaveLength(2);
  });

  test("magazine gates firing, reload refills, and loaded is reported", () => {
    const weapon = createWeaponRuntime<null, TestHit>({
      cadenceMs: 0,
      magazine: { capacity: 2, reloadMs: 1000, reserve: 10 },
      resolveHits: () => [{ target: "dummy" }],
      damageFor,
    });

    expect(weapon.fire(null).loaded).toBe(1);
    expect(weapon.fire(null).loaded).toBe(0);
    expect(weapon.fire(null).status).toBe("empty");

    expect(weapon.startReload()).toBe(true);
    expect(weapon.fire(null).status).toBe("reloading");
    weapon.tick(1);
    expect(weapon.canFire()).toBe(true);
    expect(weapon.fire(null).loaded).toBe(1);
    expect(weapon.magazine?.reserve()).toBe(8);
  });

  test("forwards a deterministic rng into status rolls", () => {
    const rng = (): number => 0.99; // above a 0.5 applyChance → status should not apply
    const weapon = createWeaponRuntime<null, TestHit>({
      cadenceMs: 0,
      rng,
      resolveHits: () => [{ target: "dummy" }],
      damageFor: (hit) => ({
        channel: "kinetic",
        impact: 5,
        target: hit.target,
        status: { status: "burn", chance: 0.5, magnitude: 1, durationMs: 1000 },
      }),
    });
    const result = weapon.fire(null);
    expect(result.resolutions[0]?.status?.kind).toBe("missed");
    expect(result.resolutions[0]?.status?.instance).toBeNull();
  });
});
