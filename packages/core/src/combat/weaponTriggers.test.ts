import { describe, expect, test } from "bun:test";

import { createMagazine, statPoolReserve } from "./magazine";
import { createWeaponTriggers, type WeaponTriggerShot } from "./weaponTriggers";

function ammoStore(initial: number) {
  const pool = { current: initial };
  return {
    pool,
    stats: {
      get: () => ({ current: pool.current }),
      delta: (_owner: string, _stat: string, amount: number) => { pool.current += amount; },
    },
  };
}

describe("createWeaponTriggers", () => {
  test("cadence is kept per shooter and weapon on the caller's clock", () => {
    const triggers = createWeaponTriggers();
    const pull = { shooter: "p1", weapon: "smg", intervalMs: 100 };
    expect(triggers.pull({ ...pull, nowMs: 0 }).status).toBe("fired");
    expect(triggers.pull({ ...pull, nowMs: 99 }).status).toBe("cooling");
    expect(triggers.pull({ ...pull, weapon: "pistol", nowMs: 99 }).status).toBe("fired");
    expect(triggers.pull({ ...pull, shooter: "cop", nowMs: 99 }).status).toBe("fired");
    expect(triggers.readyAtMs("p1", "smg")).toBe(100);
    expect(triggers.pull({ ...pull, nowMs: 100 }).status).toBe("fired");
    // A live fire-rate change applies from the next shot.
    expect(triggers.pull({ ...pull, intervalMs: 50, nowMs: 150 }).status).toBe("cooling");
    expect(triggers.pull({ ...pull, intervalMs: 50, nowMs: 200 }).status).toBe("fired");
    expect(triggers.readyAtMs("p1", "smg")).toBe(250);
  });

  test("a magazine fed from a shared reserve counts the same through fire and reload", () => {
    const { pool, stats } = ammoStore(7);
    const magazine = createMagazine({ capacity: 3, reloadMs: 500, reserve: statPoolReserve(stats, "p1", "ammo") });
    const triggers = createWeaponTriggers();
    const pull = { shooter: "p1", weapon: "pistol", intervalMs: 100, ammo: magazine };
    const loadedAfter: (number | null)[] = [];
    let now = 0;
    for (let i = 0; i < 4; i += 1, now += 100) {
      const result = triggers.pull({ ...pull, nowMs: now });
      loadedAfter.push(result.shot?.loaded ?? null);
      if (result.status === "empty") expect(magazine.startReload()).toBe(true);
    }
    expect(loadedAfter).toEqual([2, 1, 0, null]);
    expect(triggers.pull({ ...pull, nowMs: now }).status).toBe("reloading");
    magazine.tick(0.5);
    expect([magazine.loaded(), pool.current]).toEqual([3, 4]);
    const shot = triggers.pull({ ...pull, nowMs: now + 500 }).shot;
    expect(shot).toMatchObject({ shot: 4, spent: 1, loaded: 2, reserve: 4 });
  });

  test("a reserve-only weapon spends straight from the pool and reports empty when short", () => {
    const { pool, stats } = ammoStore(2);
    const triggers = createWeaponTriggers();
    const pull = { shooter: "p1", weapon: "shotgun", intervalMs: 0, rounds: 1, ammo: statPoolReserve(stats, "p1", "ammo_shell") };
    expect(triggers.pull({ ...pull, nowMs: 0 }).shot).toMatchObject({ spent: 1, loaded: null, reserve: 1 });
    expect(triggers.pull({ ...pull, nowMs: 1 }).status).toBe("fired");
    expect(triggers.pull({ ...pull, nowMs: 2 }).status).toBe("empty");
    expect(pool.current).toBe(0);
    expect(triggers.pull({ ...pull, rounds: 0, nowMs: 3 }).status).toBe("fired");
  });

  test("a free shot is gated and presented but spends nothing; check has no effect", () => {
    const magazine = createMagazine({ capacity: 2, reloadMs: 100 });
    const triggers = createWeaponTriggers();
    const pull = { shooter: "p1", weapon: "rifle", nowMs: 0, intervalMs: 100, ammo: magazine };
    expect(triggers.check(pull)).toBe("fired");
    expect(triggers.check(pull)).toBe("fired");
    expect(magazine.loaded()).toBe(2);
    expect(triggers.pull({ ...pull, free: true }).shot).toMatchObject({ spent: 0, free: true, loaded: 2 });
    expect(triggers.check(pull)).toBe("cooling");
  });

  test("dry pulls start the interval only with dryPull cooldown", () => {
    const empty = statPoolReserve(ammoStore(0).stats, "p1", "ammo");
    const free = createWeaponTriggers();
    expect(free.pull({ shooter: "p1", weapon: "g", nowMs: 0, intervalMs: 100, ammo: empty }).status).toBe("empty");
    expect(free.pull({ shooter: "p1", weapon: "g", nowMs: 1, intervalMs: 100, ammo: empty }).status).toBe("empty");
    const throttled = createWeaponTriggers({ dryPull: "cooldown" });
    expect(throttled.pull({ shooter: "p1", weapon: "g", nowMs: 0, intervalMs: 100, ammo: empty }).status).toBe("empty");
    expect(throttled.pull({ shooter: "p1", weapon: "g", nowMs: 1, intervalMs: 100, ammo: empty }).status).toBe("cooling");
    expect(throttled.pull({ shooter: "p1", weapon: "g", nowMs: 100, intervalMs: 100, ammo: empty }).status).toBe("empty");
  });

  test("every fired shot reaches each listener once, in order, and blocked pulls reach none", () => {
    const triggers = createWeaponTriggers();
    const seen: string[] = [];
    const shots: WeaponTriggerShot[] = [];
    triggers.onShot((shot) => { seen.push(`a${shot.shot}`); shots.push(shot); });
    const off = triggers.onShot((shot) => seen.push(`b${shot.shot}`));
    const pull = { shooter: "p1", weapon: "smg", intervalMs: 100 };
    triggers.pull({ ...pull, nowMs: 0 });
    triggers.pull({ ...pull, nowMs: 50 });
    triggers.pull({ ...pull, nowMs: 100 });
    off();
    triggers.pull({ ...pull, nowMs: 200 });
    expect(seen).toEqual(["a1", "b1", "a2", "b2", "a3"]);
    expect(shots.map((shot) => shot.nowMs)).toEqual([0, 100, 200]);
    expect(shots[0]).toEqual({ shooter: "p1", weapon: "smg", nowMs: 0, shot: 1, spent: 0, free: false, loaded: null, reserve: null });
  });

  test("snapshot and restore keep cadence and shot numbers; clear forgets them", () => {
    const triggers = createWeaponTriggers();
    triggers.pull({ shooter: "p1", weapon: "smg", nowMs: 0, intervalMs: 100 });
    const snapshot = JSON.parse(JSON.stringify(triggers.snapshot()));
    const copy = createWeaponTriggers();
    copy.restore(snapshot);
    expect(copy.check({ shooter: "p1", weapon: "smg", nowMs: 50, intervalMs: 100 })).toBe("cooling");
    expect(copy.pull({ shooter: "p1", weapon: "smg", nowMs: 100, intervalMs: 100 }).shot?.shot).toBe(2);
    copy.clear();
    expect(copy.readyAtMs("p1", "smg")).toBe(Number.NEGATIVE_INFINITY);
  });
});
