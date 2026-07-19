import { describe, expect, test } from "bun:test";
import { createWeaponRuntime } from "./weaponFire";
import type { MagazineReserve } from "./magazine";
import type { DamageHitInput } from "./damageResolution";

/**
 * Proves an existing project drives the portable weapon runtime with ITS OWN aim, raycaster, entity
 * list, and ammo store — no GameContext, entity store, renderer, or default weapon. The runtime only
 * gates fire cadence + ammo and resolves damage; the caller owns everything spatial and visual.
 */

interface ExistingEnemy {
  id: string;
  x: number;
  z: number;
  armored: boolean;
}

interface ExistingAim {
  originX: number;
  originZ: number;
  dirX: number;
  dirZ: number;
}

// The caller's own hitscan against its own entity array — the engine never sees this.
function callerRaycast(enemies: readonly ExistingEnemy[], aim: ExistingAim, range: number): ExistingEnemy[] {
  const hits: ExistingEnemy[] = [];
  for (const enemy of enemies) {
    const toX = enemy.x - aim.originX;
    const toZ = enemy.z - aim.originZ;
    const along = toX * aim.dirX + toZ * aim.dirZ;
    if (along < 0 || along > range) continue;
    const perp = Math.abs(toX * aim.dirZ - toZ * aim.dirX);
    if (perp <= 0.5) hits.push(enemy);
  }
  return hits;
}

describe("portable weapon adoption", () => {
  test("caller-owned raycaster + ammo store drive cadence, damage provenance, and reload", () => {
    const enemies: ExistingEnemy[] = [
      { id: "grunt", x: 5, z: 0, armored: false },
      { id: "tank", x: 8, z: 0, armored: true },
      { id: "offlane", x: 5, z: 3, armored: false },
    ];

    // Caller owns its ammo economy; the magazine reload draws from it through a structural adapter.
    const store = { reserveAmmo: 30 };
    const reserve: MagazineReserve = {
      current: () => store.reserveAmmo,
      spend(amount) {
        if (amount > store.reserveAmmo) return false;
        store.reserveAmmo -= amount;
        return true;
      },
      gain(amount) {
        store.reserveAmmo += amount;
      },
    };

    const weapon = createWeaponRuntime<ExistingAim, ExistingEnemy>({
      cadenceMs: 100,
      magazine: { capacity: 2, reloadMs: 800, reserve },
      resolveHits: (aim) => callerRaycast(enemies, aim, 12),
      damageFor: (enemy): DamageHitInput => ({
        channel: "kinetic",
        impact: 25,
        target: enemy.id,
        targetTraits: enemy.armored ? ["armored"] : [],
        matchup: { entries: { kinetic: { armored: { impact: 0.4 } } } },
      }),
    });

    const downRange: ExistingAim = { originX: 0, originZ: 0, dirX: 1, dirZ: 0 };

    const shot = weapon.fire(downRange);
    expect(shot.status).toBe("fired");
    expect(shot.loaded).toBe(1);
    // Only the two on-axis enemies are hit; the offlane one is missed by the caller's own raycast.
    expect(shot.hits.map((h) => h.id).sort()).toEqual(["grunt", "tank"]);
    // Armored trait halved the tank's impact (25 → 10) via the caller-supplied matchup.
    const impacts = shot.resolutions.map((r) => r.impact).sort((a, b) => a - b);
    expect(impacts).toEqual([10, 25]);

    // Cadence blocks an immediate re-fire without touching the raycaster or ammo.
    expect(weapon.fire(downRange).status).toBe("cooling");
    expect(store.reserveAmmo).toBe(30);

    // Advance time, empty the magazine, then reload from the caller's reserve.
    weapon.tick(0.1);
    expect(weapon.fire(downRange).loaded).toBe(0);
    weapon.tick(0.1); // clear cadence so the next block is ammo, not cooldown
    expect(weapon.fire(downRange).status).toBe("empty");
    expect(weapon.startReload()).toBe(true);
    weapon.tick(0.8);
    expect(weapon.magazine?.loaded()).toBe(2);
    expect(store.reserveAmmo).toBe(28);
  });

  test("cadence state survives a JSON snapshot/restore round-trip", () => {
    const weapon = createWeaponRuntime<null, { id: string }>({
      cadenceMs: 500,
      resolveHits: () => [{ id: "dummy" }],
      damageFor: (hit) => ({ channel: "kinetic", impact: 1, target: hit.id }),
    });
    weapon.fire(null);
    weapon.tick(0.2);

    const snapshot = JSON.parse(JSON.stringify({ cadenceMs: weapon.cadence.elapsedMs() })) as { cadenceMs: number };

    const restored = createWeaponRuntime<null, { id: string }>({
      cadenceMs: 500,
      resolveHits: () => [{ id: "dummy" }],
      damageFor: (hit) => ({ channel: "kinetic", impact: 1, target: hit.id }),
    });
    restored.cadence.restore(snapshot.cadenceMs);
    expect(restored.cadence.remainingMs()).toBe(weapon.cadence.remainingMs());
    expect(restored.canFire()).toBe(false);
  });
});
