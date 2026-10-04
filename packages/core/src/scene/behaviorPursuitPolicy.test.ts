import { expect, test } from "bun:test";
import { defineGameDefinition } from "../game/defineGame";
import { createFactionGraph, createFactionRoster, type FactionRoster } from "../faction/factions";
import { createGameContext, type GameContext } from "../runtime/gameContext";
import { pursue } from "./behaviors";
import { advanceBehaviors, behaviorControl, type PursueBehaviorSnapshot } from "./behaviorRuntime";

function fixture(policy = true) {
  const rosters = new WeakMap<GameContext, FactionRoster>();
  const calls: [GameContext, string, string][] = [];
  const definition = defineGameDefinition({ name: "Per-world pursuit policy", multiplayer: "off", persist: false,
    ...(policy ? { pursuit: { eligible(ctx: GameContext, self: string, candidate: string) {
      calls.push([ctx, self, candidate]);
      return rosters.get(ctx)?.isHostile(self, candidate) === true;
    } } } : {}),
  });
  const boot = (reversed = false) => {
    const ctx = createGameContext({ definition, content: { entityById: () => ({
      stats: { health: { max: 100 } }, receive: { damage: { order: ["health"] } },
    }) }, player: { userId: "owner", isNew: true } });
    const roster = createFactionRoster(createFactionGraph({ factions: [
      { id: "home", relations: { away: "hostile" } }, { id: "away" }, { id: "neutral" },
    ] }));
    rosters.set(ctx, roster);
    for (const [id, faction] of [["mob", "home"], ["friend", reversed ? "away" : "home"], ["neutral", "neutral"], ["hostile", reversed ? "home" : "away"]]) roster.assign(id!, faction!);
    ctx.scene.entity.spawn("mob", { id: "mob", role: "npc", behaviors: [pursue({
      aggroRadius: 5, reach: 4, leashRange: 8, speed: 0, thinkInterval: 0,
      attack: { effect: "damage", amount: 10, intervalSec: 1 }, threat: {},
    })] });
    for (const [id, x] of [["friend", 1], ["neutral", 2], ["hostile", 3]] as const) ctx.scene.entity.spawn("hero", { id, role: "player", position: [x, 0, 0] });
    return { ctx, roster };
  };
  return { boot, calls, definition };
}
const progress = (ctx: GameContext) => behaviorControl(ctx).serialize("mob") as PursueBehaviorSnapshot;
const hp = (ctx: GameContext, id: string) => ctx.scene.entity.stats.get(id, "health")!.current;

test("nearest pursuit excludes friendly and neutral players through its live-world policy", () => {
  const { boot, calls } = fixture(); const { ctx, roster } = boot();
  expect(roster.isFriendly("mob", "friend")).toBe(true);
  expect(roster.relationBetweenEntities("mob", "neutral")).toBe("neutral");
  advanceBehaviors(ctx, .1);
  expect(progress(ctx).targetId).toBe("hostile");
  expect([hp(ctx, "friend"), hp(ctx, "neutral"), hp(ctx, "hostile")]).toEqual([100, 100, 90]);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(([world, self]) => world === ctx && self === "mob")).toBe(true);
});

for (const source of ["held", "explicit", "forced"] as const) test(`${source} target cannot bypass changed caller eligibility or restart cooldown`, () => {
  const { boot } = fixture(); const { ctx, roster } = boot();
  ctx.scene.entity.setTarget("mob", "hostile");
  advanceBehaviors(ctx, .1); expect(progress(ctx).targetId).toBe("hostile");
  ctx.scene.entity.setTarget("mob", null);
  const before = progress(ctx);
  roster.assign("hostile", "home"); roster.assign("friend", "away");
  ctx.scene.entity.setPose("hostile", { position: [.5, 0, 0] });
  if (source === "explicit") ctx.scene.entity.setTarget("mob", "hostile");
  if (source === "forced") behaviorControl(ctx).threat("mob")!.taunt("hostile", 10);
  advanceBehaviors(ctx, .1);
  expect(progress(ctx).targetId).toBe("friend");
  expect(progress(ctx).home).toEqual(before.home);
  expect(progress(ctx).pursuit.attackCooldown).toBeCloseTo(before.pursuit.attackCooldown - .1);
  expect([hp(ctx, "friend"), hp(ctx, "neutral"), hp(ctx, "hostile")]).toEqual([100, 100, 90]);
  advanceBehaviors(ctx, 1);
  expect([hp(ctx, "friend"), hp(ctx, "hostile")]).toEqual([90, 90]);
});

test("one shared definition binds different roster policies to each actual context", () => {
  const { boot, calls } = fixture(); const a = boot(), b = boot(true);
  advanceBehaviors(a.ctx, .1); advanceBehaviors(b.ctx, .1);
  expect([progress(a.ctx).targetId, progress(b.ctx).targetId]).toEqual(["hostile", "friend"]);
  expect([hp(a.ctx, "friend"), hp(a.ctx, "hostile"), hp(b.ctx, "friend"), hp(b.ctx, "hostile")]).toEqual([100, 90, 90, 100]);
  expect(calls.some(([ctx]) => ctx === a.ctx)).toBe(true);
  expect(calls.some(([ctx]) => ctx === b.ctx)).toBe(true);
});

test("cold restoration retains home/cooldown while rebinding unsaved receiving-world eligibility", () => {
  const { boot, calls } = fixture(); const live = boot();
  live.ctx.scene.entity.setPose("mob", { position: [1, 0, 0] });
  live.ctx.scene.entity.setTarget("mob", "hostile");
  advanceBehaviors(live.ctx, .1);
  const before = progress(live.ctx), saved = JSON.parse(JSON.stringify(live.ctx.state()));
  const cold = boot(true); cold.ctx.restore(saved);
  expect(progress(cold.ctx)).toEqual(before);
  calls.length = 0; advanceBehaviors(cold.ctx, .1);
  expect(progress(cold.ctx).targetId).toBe("friend");
  expect(progress(cold.ctx).home).toEqual([0, 0, 0]);
  expect(progress(cold.ctx).pursuit.attackCooldown).toBeCloseTo(before.pursuit.attackCooldown - .1);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(([ctx]) => ctx === cold.ctx)).toBe(true);
  expect([hp(cold.ctx, "friend"), hp(cold.ctx, "hostile")]).toEqual([100, 90]);
  expect(JSON.stringify(saved)).not.toContain("eligible");
});

test("omitted policy preserves all-player default and explicit nonplayer effects", () => {
  const { boot } = fixture(false); const { ctx } = boot();
  advanceBehaviors(ctx, .1); expect(hp(ctx, "friend")).toBe(90);
  ctx.scene.entity.spawn("cargo", { id: "cargo", role: "prop", position: [1, 0, 0] });
  ctx.scene.entity.setTarget("mob", "cargo"); advanceBehaviors(ctx, 1);
  expect(hp(ctx, "cargo")).toBe(90);
});

for (const [label, callback] of [
  ["missing return", () => {}], ["null", () => null],
  ["Promise", () => Promise.resolve(true)], ["truthy object", () => ({ allowed: true })],
] as const) test(`present JS eligibility returning ${label} denies attacks instead of enabling the default`, () => {
  const definition = defineGameDefinition({ name: `Invalid JS policy: ${label}`, multiplayer: "off", persist: false,
    pursuit: { eligible: callback as unknown as (ctx: GameContext, self: string, candidate: string) => boolean },
  });
  const ctx = createGameContext({ definition, content: { entityById: () => ({ stats: { health: { max: 100 } }, receive: { damage: { order: ["health"] } } }) }, player: { userId: "owner", isNew: true } });
  ctx.scene.entity.spawn("mob", { id: "mob", behaviors: [pursue({ aggroRadius: 5, reach: 4, leashRange: 8, speed: 0, thinkInterval: 0, attack: { effect: "damage", amount: 10, intervalSec: 1 } })] });
  for (const [id, x] of [["friend", 1], ["hostile", 2]] as const) ctx.scene.entity.spawn("hero", { id, role: "player", position: [x, 0, 0] });
  advanceBehaviors(ctx, .1);
  expect(progress(ctx).targetId).toBeNull();
  expect([hp(ctx, "friend"), hp(ctx, "hostile")]).toEqual([100, 100]);
});
