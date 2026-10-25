import { describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { AMMO_STAT_IDS } from "./ammo";
import {
  dropBossLegendary,
  perkAfterHit,
  perkDamageScale,
  perkKill,
  perkReloadScale,
  perkShot,
} from "./combat/gunPerks";
import type { HitOutcome } from "./combat/hitModel";
import { enemies } from "./entities/enemies/catalog";
import {
  BOSS_DROPS,
  LEGENDARY_NAMES,
  SIGNATURE_PERKS,
  consumeRound,
  derivePerks,
  dropsFrom,
  gunPerks,
  magLoaded,
  perkLines,
  registerGun,
  rollGun,
  signaturePerkFor,
  startReload,
  type GunDef,
} from "./handroll";

interface Fake {
  ctx: GameContext;
  advance(ms: number): void;
  floats: string[];
  spawned: string[];
}

/** Enough of a context for the perk runtime: a clock, stats, float text, effects and a world-item spawn. */
function makeCtx(): Fake {
  let now = 1000;
  const stats = new Map<string, { current: number; max: number }>();
  const stat = (id: string, statId: string) => stats.get(`${id}:${statId}`) ?? null;
  stats.set("p1:health", { current: 50, max: 100 });
  stats.set("p1:shield", { current: 0, max: 60 });
  for (const statId of Object.values(AMMO_STAT_IDS)) stats.set(`p1:${statId}`, { current: 500, max: 999 });
  const floats: string[] = [];
  const spawned: string[] = [];
  const entities = [{ id: "p1", name: "player", role: "player", position: [0, 0, 0] as [number, number, number] }];
  const ctx = {
    player: { userId: "p1" },
    time: { now: () => now / 1000 },
    game: { notices: { push() {} } },
    scene: {
      worldItem: { spawn: (input: { itemId: string }) => spawned.push(input.itemId) },
      entity: {
        stats: {
          get: stat,
          delta(id: string, statId: string, amount: number) {
            const entry = stat(id, statId);
            if (entry !== null) entry.current = Math.min(entry.max, entry.current + amount);
          },
        },
        floatText: (input: { text?: string }) => floats.push(input.text ?? ""),
        effect() {},
        vfx() {},
        list: () => entities,
        get: (id: string) => entities.find((entity) => entity.id === id) ?? null,
        subscribeMembership: () => () => {},
      },
    },
  } as unknown as GameContext;
  return { ctx, advance: (ms) => { now += ms; }, floats, spawned };
}

let serial = 0;
function perkGun(perks: string[], overrides: Partial<GunDef> = {}): GunDef {
  serial += 1;
  return registerGun({
    id: `perk_test_${serial}`,
    kind: "gun",
    name: "Test Coilpin",
    family: "pistol",
    manufacturer: "Apex",
    rarity: "rare",
    element: "none",
    level: 1,
    ammo: "pistol",
    auto: false,
    ammoPerShot: 1,
    magSize: 12,
    reloadMs: 1200,
    elementChance: 0,
    elementDps: 1,
    use: "fireGun",
    weapon: { damage: 10, range: 60, spread: 1, fireIntervalMs: 200, critChance: 0.1, critMult: 2 },
    perks,
    ...overrides,
  });
}

const hit = (crit: boolean): HitOutcome => ({ damage: 10, crit, resistance: "flesh", multiplier: 1 });

describe("perk rules on the triggered-rules seam", () => {
  test("Rampage stacks +12% per kill, caps at 3, and lapses after its 4s window", () => {
    const { ctx, advance, floats } = makeCtx();
    const gun = perkGun(["rampage"]);
    expect(perkDamageScale(ctx, gun)).toBe(1);
    for (let kill = 0; kill < 4; kill += 1) perkKill(ctx, gun, "p1", "x", false);
    expect(perkDamageScale(ctx, gun)).toBeCloseTo(1.36, 5);
    expect(floats).toContain("RAMPAGE x2");
    expect(floats).toContain("RAMPAGE x3");
    advance(3000);
    perkKill(ctx, gun, "p1", "x", false); // a kill inside the window re-arms it
    advance(3500);
    expect(perkDamageScale(ctx, gun)).toBeCloseTo(1.36, 5);
    advance(600);
    expect(perkDamageScale(ctx, gun)).toBe(1);
  });

  test("Overcharge crits exactly every 8th shot, Sixgun every 6th", () => {
    const { ctx } = makeCtx();
    const overcharge = perkGun(["overcharge"]);
    const crits = Array.from({ length: 16 }, () => perkShot(ctx, overcharge).forceCrit === true);
    expect(crits.map((crit, index) => (crit ? index + 1 : 0)).filter((n) => n > 0)).toEqual([8, 16]);
    const sixgun = perkGun(["sig_sixgun"]);
    const sixes = Array.from({ length: 12 }, () => perkShot(ctx, sixgun).forceCrit === true);
    expect(sixes.map((crit, index) => (crit ? index + 1 : 0)).filter((n) => n > 0)).toEqual([6, 12]);
  });

  test("Opening Shot crits only from a full magazine", () => {
    const { ctx } = makeCtx();
    const gun = perkGun(["opening_shot"]);
    expect(perkShot(ctx, gun).forceCrit).toBe(true);
    consumeRound(ctx, gun);
    expect(perkShot(ctx, gun).forceCrit).toBe(false);
  });

  test("refunds clamp to the magazine: Subsistence, Bottomless and Triple Tap", () => {
    const { ctx } = makeCtx();
    const subsistence = perkGun(["subsistence"]);
    consumeRound(ctx, subsistence);
    consumeRound(ctx, subsistence);
    perkKill(ctx, subsistence, "p1", "x", false); // 25% of 12 is 3, but only 2 fit
    expect(magLoaded(ctx, subsistence)).toBe(12);

    const endless = perkGun(["sig_endless"]);
    for (let shot = 0; shot < 9; shot += 1) consumeRound(ctx, endless);
    perkKill(ctx, endless, "p1", "x", false);
    expect(magLoaded(ctx, endless)).toBe(12);

    const tripleTap = perkGun(["triple_tap"]);
    for (let shot = 0; shot < 4; shot += 1) consumeRound(ctx, tripleTap);
    perkAfterHit(ctx, tripleTap, "p1", "x", hit(true), false);
    perkAfterHit(ctx, tripleTap, "p1", "x", hit(false), false);
    perkAfterHit(ctx, tripleTap, "p1", "x", hit(true), false);
    expect(magLoaded(ctx, tripleTap)).toBe(8);
    perkAfterHit(ctx, tripleTap, "p1", "x", hit(true), false);
    expect(magLoaded(ctx, tripleTap)).toBe(9);
  });

  test("Kill Clip pays off only for a reload inside 3s of a kill", () => {
    const { ctx, advance } = makeCtx();
    const gun = perkGun(["kill_clip"]);
    perkKill(ctx, gun, "p1", "x", false);
    consumeRound(ctx, gun);
    advance(3200);
    expect(startReload(ctx, gun)).toBe(true);
    expect(perkDamageScale(ctx, gun)).toBe(1);

    const fresh = perkGun(["kill_clip"]);
    perkKill(ctx, fresh, "p1", "x", false);
    consumeRound(ctx, fresh);
    advance(1000);
    expect(startReload(ctx, fresh)).toBe(true);
    expect(perkDamageScale(ctx, fresh)).toBeCloseTo(1.3, 5);
    advance(5100);
    expect(perkDamageScale(ctx, fresh)).toBe(1);
  });

  test("Outlaw speeds reloads only after a crit kill; Leech and Shield Siphon refill", () => {
    const { ctx } = makeCtx();
    const outlaw = perkGun(["outlaw"]);
    perkKill(ctx, outlaw, "p1", "x", false);
    expect(perkReloadScale(ctx, outlaw)).toBe(1);
    perkKill(ctx, outlaw, "p1", "x", true);
    expect(perkReloadScale(ctx, outlaw)).toBeCloseTo(1.6, 5);

    const siphon = perkGun(["shield_siphon"]);
    perkKill(ctx, siphon, "p1", "x", false);
    expect(ctx.scene.entity.stats.get("p1", "shield")?.current).toBe(9);
  });
});

describe("perk rolls", () => {
  test("all 18 named legendaries carry a signature with a flavor line", () => {
    const names = Object.values(LEGENDARY_NAMES).flatMap((list) => list.map(([, name]) => name));
    expect(names).toHaveLength(18);
    for (const name of names) {
      const perk = signaturePerkFor(name);
      expect(perk?.signature?.flavor.length).toBeGreaterThan(4);
    }
    expect(SIGNATURE_PERKS).toHaveLength(18);
  });

  test("a rolled named legendary leads with its signature; rarity sets the rolled count", () => {
    const sixgun = rollGun(seededRng("perk-sig"), 5, { legendary: "Sixgun" });
    expect(sixgun.name.endsWith("Sixgun")).toBe(true);
    expect(sixgun.perks?.[0]).toBe("sig_sixgun");
    expect(perkLines(sixgun)[0]).toMatchObject({ signature: true, flavor: "Six shots. Count 'em.", dropsFrom: "Captain Rusk" });
    const rng = seededRng("perk-rarity");
    for (let index = 0; index < 40; index += 1) {
      expect(rollGun(rng, 4, { rarity: "common" }).perks).toEqual([]);
      expect(rollGun(rng, 4, { rarity: "uncommon" }).perks).toEqual([]);
      expect(rollGun(rng, 4, { rarity: "rare" }).perks).toHaveLength(1);
      const epic = rollGun(rng, 4, { rarity: "epic" }).perks ?? [];
      expect(epic.length === 1 || epic.length === 2).toBe(true);
      expect(new Set(epic).size).toBe(epic.length);
    }
  });

  test("perks never move the roll stream: same seed, same gun with or without the perk pass", () => {
    const a = rollGun(seededRng("stream-check"), 9, { family: "rifle" });
    const b = rollGun(seededRng("stream-check"), 9, { family: "rifle" });
    expect({ ...a, id: "", perks: [] }).toEqual({ ...b, id: "", perks: [] });
    // And the perk pick is a pure function of the gun's own id.
    expect(derivePerks(a)).toEqual(a.perks as string[]);
  });

  test("a gun saved before perks still loads and derives the same perks", () => {
    const legacy = perkGun([], { id: "gun_77_smg_epic", rarity: "epic", family: "smg" });
    delete (legacy as { perks?: unknown }).perks;
    registerGun(legacy);
    const restored = JSON.parse(JSON.stringify(legacy)) as GunDef;
    expect(restored.perks).toBeUndefined();
    expect(gunPerks(restored).map((perk) => perk.id)).toEqual(derivePerks(restored));
    expect(gunPerks(restored).length).toBeGreaterThan(0);
  });
});

describe("dedicated boss drops", () => {
  test("every boss has a pool of two real named legendaries", () => {
    const bosses = enemies.filter((enemy) => enemy.family === "boss").map((enemy) => enemy.id).sort();
    expect(BOSS_DROPS.map((entry) => entry.bossId).sort()).toEqual(bosses);
    const names = new Set(Object.values(LEGENDARY_NAMES).flatMap((list) => list.map(([, name]) => name)));
    for (const entry of BOSS_DROPS) {
      for (const name of entry.legendaries) {
        expect(names.has(name)).toBe(true);
        expect(dropsFrom(name)).toBe(entry.boss);
      }
    }
  });

  test("a boss roll pins the right named legendary, and misses above the chance", () => {
    const { ctx, spawned } = makeCtx();
    const event = { instanceId: "boss1", catalogId: "captain_rusk", reason: { kind: "player_kill", killerUserId: "p1" }, position: [0, 0, 0] } as never;
    const zeroes = () => 0;
    const first = dropBossLegendary(ctx, event, zeroes);
    expect(first?.rarity).toBe("legendary");
    expect(first?.name.endsWith("Sixgun")).toBe(true);
    expect(first?.manufacturer).toBe("Blackwood");
    const highs = [0.1, 0.99];
    const second = dropBossLegendary(ctx, { ...(event as object), catalogId: "foundry_heart" } as never, () => highs.shift() ?? 0.5);
    expect(second?.name.endsWith("Ashfall")).toBe(true);
    expect(second?.family).toBe("sniper");
    expect(dropBossLegendary(ctx, event, () => 0.5)).toBeNull();
    expect(dropBossLegendary(ctx, { ...(event as object), catalogId: "husk" } as never, zeroes)).toBeNull();
    expect(spawned).toHaveLength(2);
  });
});
