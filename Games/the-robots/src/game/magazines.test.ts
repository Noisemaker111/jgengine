import { afterEach, describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { AMMO_STAT_IDS } from "./ammo";
import { pickCharacter, resetCharacterState, talentTree } from "./characters";
import {
  consumeRound,
  effectiveMagSize,
  type GunDef,
  isReloading,
  magLoaded,
  startReload,
  tickReloads,
} from "./handroll";

/** Minimal entity-stats-backed context: magazines only read `player.userId` and `scene.entity.stats`. */
function makeCtx(reserves: Partial<Record<string, number>>): {
  ctx: GameContext;
  reserve: (statId: string) => number;
} {
  const stats = new Map<string, { current: number; max: number }>();
  for (const [statId, value] of Object.entries(reserves)) {
    stats.set(statId, { current: value ?? 0, max: 9999 });
  }
  const ctx = {
    player: { userId: "p1" },
    scene: {
      entity: {
        stats: {
          get: (_id: string, statId: string) => stats.get(statId) ?? null,
          delta: (_id: string, statId: string, amount: number) => {
            const stat = stats.get(statId);
            if (stat !== undefined) stat.current += amount;
          },
        },
      },
    },
  } as unknown as GameContext;
  return { ctx, reserve: (statId) => stats.get(statId)?.current ?? 0 };
}

/** A bare gun def carrying only the fields the magazine reads. */
function testGun(overrides: Partial<GunDef> = {}): GunDef {
  return {
    id: "test_gun",
    ammo: "pistol",
    ammoPerShot: 1,
    magSize: 5,
    reloadMs: 2000,
    ...overrides,
  } as unknown as GunDef;
}

const AMMO = AMMO_STAT_IDS.pistol;

afterEach(() => resetCharacterState());

describe("magazine adoption onto createMagazine", () => {
  test("a fresh magazine is loaded to the effective mag size", () => {
    const { ctx } = makeCtx({ [AMMO]: 100 });
    const gun = testGun();
    expect(magLoaded(ctx, gun)).toBe(5);
    expect(isReloading(ctx, gun)).toBe(false);
  });

  test("consumeRound spends ammoPerShot and refuses once empty", () => {
    const { ctx } = makeCtx({ [AMMO]: 100 });
    const gun = testGun({ ammoPerShot: 2, magSize: 5 });
    expect(consumeRound(ctx, gun)).toBe(true); // 5 -> 3
    expect(magLoaded(ctx, gun)).toBe(3);
    expect(consumeRound(ctx, gun)).toBe(true); // 3 -> 1
    expect(consumeRound(ctx, gun)).toBe(false); // 1 < 2, no effect
    expect(magLoaded(ctx, gun)).toBe(1);
  });

  test("reload draws from the shared ammo-type reserve after reloadMs of ticks", () => {
    const { ctx, reserve } = makeCtx({ [AMMO]: 12 });
    const gun = testGun({ magSize: 5, reloadMs: 2000 });
    for (let i = 0; i < 5; i += 1) consumeRound(ctx, gun); // empty the mag
    expect(magLoaded(ctx, gun)).toBe(0);

    expect(startReload(ctx, gun)).toBe(true);
    expect(isReloading(ctx, gun)).toBe(true);

    tickReloads(ctx, 1.0); // 1000ms elapsed, not yet complete
    expect(isReloading(ctx, gun)).toBe(true);
    expect(magLoaded(ctx, gun)).toBe(0);
    expect(reserve(AMMO)).toBe(12);

    tickReloads(ctx, 1.0); // 2000ms total -> completes
    expect(isReloading(ctx, gun)).toBe(false);
    expect(magLoaded(ctx, gun)).toBe(5);
    expect(reserve(AMMO)).toBe(7); // 12 - 5 drawn from reserve
  });

  test("reload takes only what the reserve can supply (partial refill)", () => {
    const { ctx, reserve } = makeCtx({ [AMMO]: 3 });
    const gun = testGun({ magSize: 5, reloadMs: 1000 });
    for (let i = 0; i < 5; i += 1) consumeRound(ctx, gun);
    expect(startReload(ctx, gun)).toBe(true);
    tickReloads(ctx, 1.0);
    expect(magLoaded(ctx, gun)).toBe(3); // only 3 available
    expect(reserve(AMMO)).toBe(0);
  });

  test("startReload is gated: full mag, empty reserve, and mid-reload all refuse", () => {
    const full = makeCtx({ [AMMO]: 100 });
    expect(startReload(full.ctx, testGun())).toBe(false); // already full

    const dry = makeCtx({ [AMMO]: 0 });
    const gun = testGun();
    for (let i = 0; i < 5; i += 1) consumeRound(dry.ctx, gun);
    expect(startReload(dry.ctx, gun)).toBe(false); // reserve exhausted

    const mid = makeCtx({ [AMMO]: 100 });
    const gun2 = testGun();
    consumeRound(mid.ctx, gun2);
    expect(startReload(mid.ctx, gun2)).toBe(true);
    expect(startReload(mid.ctx, gun2)).toBe(false); // already reloading
  });

  test("mag capacity tracks live magSize talent bonus (rebuild on drift)", () => {
    const { ctx } = makeCtx({ [AMMO]: 100 });
    const gun = testGun({ magSize: 10, reloadMs: 1000 });
    expect(magLoaded(ctx, gun)).toBe(10);

    // Spend two ranks of "Filled to the Brim" (+10% magSize/rank) -> effective size 12.
    pickCharacter("gunk");
    const tree = talentTree()!;
    tree.grantPoints(10);
    tree.allocate("sal_pack_rat");
    tree.allocate("sal_pack_rat");
    expect(effectiveMagSize(gun)).toBe(12);

    // Fire a round, then reload: the rebuilt magazine now fills to the larger capacity.
    consumeRound(ctx, gun); // loaded 10 -> 9, capacity now 12
    expect(magLoaded(ctx, gun)).toBe(9);
    expect(startReload(ctx, gun)).toBe(true);
    tickReloads(ctx, 1.0);
    expect(magLoaded(ctx, gun)).toBe(12);
  });
});
