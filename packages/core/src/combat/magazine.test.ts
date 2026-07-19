import { describe, expect, test } from "bun:test";

import { createMagazine } from "@jgengine/core/combat/magazine";

describe("createMagazine", () => {
  test("starts full with a self-managed reserve", () => {
    const mag = createMagazine({ capacity: 8, reloadMs: 1000, reserve: 24 });
    expect(mag.loaded()).toBe(8);
    expect(mag.capacity()).toBe(8);
    expect(mag.reserve()).toBe(24);
    expect(mag.isFull()).toBe(true);
    expect(mag.isEmpty()).toBe(false);
  });

  test("fire spends loaded rounds and fails when insufficient", () => {
    const mag = createMagazine({ capacity: 2, reloadMs: 1000, reserve: 10 });
    expect(mag.fire()).toBe(true);
    expect(mag.loaded()).toBe(1);
    expect(mag.fire(2)).toBe(false);
    expect(mag.loaded()).toBe(1);
    expect(mag.fire()).toBe(true);
    expect(mag.isEmpty()).toBe(true);
    expect(mag.fire()).toBe(false);
  });

  test("full magazine cannot reload", () => {
    const mag = createMagazine({ capacity: 6, reloadMs: 1000, reserve: 30 });
    expect(mag.canReload()).toBe(false);
    expect(mag.startReload()).toBe(false);
  });

  test("reload refills from reserve after the timer elapses, not before", () => {
    const mag = createMagazine({ capacity: 6, reloadMs: 1000, reserve: 30 });
    mag.fire(4);
    expect(mag.loaded()).toBe(2);
    expect(mag.startReload()).toBe(true);
    expect(mag.isReloading()).toBe(true);
    mag.tick(0.6);
    expect(mag.loaded()).toBe(2);
    expect(mag.reloadFraction()).toBeCloseTo(0.6);
    mag.tick(0.4);
    expect(mag.loaded()).toBe(6);
    expect(mag.reserve()).toBe(26);
    expect(mag.isReloading()).toBe(false);
  });

  test("reload is capped by a scarce reserve — partial refill, no negative reserve", () => {
    const mag = createMagazine({ capacity: 10, reloadMs: 500, reserve: 3 });
    mag.fire(10);
    mag.startReload();
    mag.tick(0.5);
    expect(mag.loaded()).toBe(3);
    expect(mag.reserve()).toBe(0);
  });

  test("canReload is false once reserve is empty", () => {
    const mag = createMagazine({ capacity: 4, reloadMs: 500, reserve: 0 });
    mag.fire(4);
    expect(mag.canReload()).toBe(false);
    expect(mag.startReload()).toBe(false);
  });

  test("cancelReload aborts the timer without moving ammo", () => {
    const mag = createMagazine({ capacity: 8, reloadMs: 1000, reserve: 20 });
    mag.fire(8);
    mag.startReload();
    mag.tick(0.5);
    mag.cancelReload();
    expect(mag.isReloading()).toBe(false);
    expect(mag.loaded()).toBe(0);
    expect(mag.reserve()).toBe(20);
    mag.tick(10);
    expect(mag.loaded()).toBe(0);
  });

  test("omitted reserve is infinite — always reloadable, addReserve is a no-op", () => {
    const mag = createMagazine({ capacity: 5, reloadMs: 200 });
    expect(mag.reserve()).toBeNull();
    mag.fire(5);
    mag.addReserve(999);
    expect(mag.startReload()).toBe(true);
    mag.tick(0.2);
    expect(mag.loaded()).toBe(5);
    expect(mag.reserve()).toBeNull();
  });

  test("addReserve tops up a self-managed reserve from a pickup", () => {
    const mag = createMagazine({ capacity: 6, reloadMs: 100, reserve: 0 });
    mag.addReserve(12);
    expect(mag.reserve()).toBe(12);
  });

  test("bridges reload draws into an externally-owned reserve (e.g. a shared stat)", () => {
    let external = 5;
    const mag = createMagazine({
      capacity: 8,
      reloadMs: 100,
      reserve: {
        current: () => external,
        spend(amount) {
          if (amount > external) return false;
          external -= amount;
          return true;
        },
      },
    });
    mag.fire(8);
    mag.startReload();
    mag.tick(0.1);
    expect(mag.loaded()).toBe(5);
    expect(external).toBe(0);
    expect(mag.reserve()).toBe(0);
  });

  test("starting loaded/capacity/reloadMs clamp to non-negative", () => {
    const mag = createMagazine({ capacity: -3, reloadMs: -10, loaded: -1, reserve: -5 });
    expect(mag.capacity()).toBe(0);
    expect(mag.loaded()).toBe(0);
    expect(mag.reserve()).toBe(0);
  });

  test("snapshot round-trips through JSON and resumes a reload identically", () => {
    const original = createMagazine({ capacity: 8, reloadMs: 1000, reserve: 20 });
    original.fire(6);
    original.startReload();
    original.tick(0.4);

    const decoded = JSON.parse(JSON.stringify(original.snapshot()));
    const restored = createMagazine({ capacity: 8, reloadMs: 1000, reserve: 0, loaded: 0 });
    expect(restored.restore(decoded)).toBe(true);
    expect(restored.snapshot()).toEqual(decoded);

    original.tick(0.6);
    restored.tick(0.6);
    expect(restored.snapshot()).toEqual(original.snapshot());
    expect(restored.loaded()).toBe(8);
    expect(restored.reserve()).toBe(14);
  });

  test("restore reconciles caller-owned reserve state or rejects without partial magazine changes", () => {
    let external = 3;
    const mag = createMagazine({
      capacity: 8,
      reloadMs: 1000,
      loaded: 2,
      reserve: {
        current: () => external,
        spend(amount) {
          if (amount > external) return false;
          external -= amount;
          return true;
        },
      },
    });

    expect(mag.restore({ loaded: 7, reloadElapsedMs: null, reserve: 5 })).toBe(false);
    expect(mag.loaded()).toBe(2);
    expect(external).toBe(3);

    external = 5; // caller restores its own reserve before restoring the magazine
    expect(mag.restore({ loaded: 7, reloadElapsedMs: null, reserve: 5 })).toBe(true);
    expect(mag.loaded()).toBe(7);
  });

  test("restore rejects finite/infinite reserve mismatches", () => {
    const infinite = createMagazine({ capacity: 4, reloadMs: 100 });
    expect(infinite.restore({ loaded: 1, reloadElapsedMs: null, reserve: 4 })).toBe(false);
    expect(infinite.loaded()).toBe(4);
  });
});
