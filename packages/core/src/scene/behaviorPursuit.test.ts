import { expect, test } from "bun:test";
import { defineGameDefinition } from "../game/defineGame";
import { createGameContext } from "../runtime/gameContext";
import { advanceBehaviors, behaviorControl } from "./behaviorRuntime";
import { pursue, patrol, type PursueBehavior } from "./behaviors";
import { memorySaveBackend, type SaveBackend } from "../game/saveStore";

function context(backend?: SaveBackend, aoiRadius?: number) {
  return createGameContext({ definition: defineGameDefinition({ name: "pursuit", multiplayer: "off", persist: false }),
    content: { entityById: name => ({ role: name === "mob" ? "enemy" : "player", stats: { health: { max: 100 } }, receive: { damage: { order: ["health"] } } }) },
    player: { userId: "probe", isNew: true }, ...(backend === undefined ? {} : { save: { backend, mode: "manual", key: "pursuit-test" } }),
    ...(aoiRadius === undefined ? {} : { replication: { aoiRadius } }) });
}
const descriptor = { kind: "pursue", aggroRadius: 5, reach: .5, leashRange: 8, speed: 2,
  thinkInterval: 0, attack: { effect: "damage", amount: 2, intervalSec: 1 } } satisfies PursueBehavior;

test("descriptor aggroes, chases, attacks on cooldown, leashes home and resets", () => {
  const ctx = context();
  ctx.scene.entity.spawn("mob", { id: "mob", position: [0, 0, 0], behaviors: [descriptor] });
  ctx.scene.entity.spawn("hero", { id: "hero", role: "player", position: [3, 0, 0] });
  advanceBehaviors(ctx, 1);
  expect(ctx.scene.entity.get("mob")!.position[0]).toBeCloseTo(2);
  advanceBehaviors(ctx, 1);
  expect(ctx.scene.entity.get("mob")!.position[0]).toBeCloseTo(2.5);
  advanceBehaviors(ctx, .1);
  expect(ctx.scene.entity.stats.get("hero", "health")!.current).toBe(98);
  advanceBehaviors(ctx, .5);
  expect(ctx.scene.entity.stats.get("hero", "health")!.current).toBe(98);
  advanceBehaviors(ctx, .5);
  expect(ctx.scene.entity.stats.get("hero", "health")!.current).toBe(96);
  ctx.scene.entity.setPose("hero", { position: [15, 0, 0] });
  for (let i = 0; i < 12; i++) advanceBehaviors(ctx, 1);
  expect(ctx.scene.entity.get("mob")!.position).toEqual([0, 0, 0]);
  const saved = behaviorControl(ctx).serialize("mob");
  expect(saved?.kind).toBe("pursue");
  expect(saved?.kind === "pursue" && [saved.targetId, saved.returning, saved.pursuit.attackCooldown]).toEqual([null, false, 0]);
});

test("pursue data rejects invalid timing/ranges and owns its nested configuration", () => {
  const attack = { effect: "damage", amount: 2, intervalSec: 1 };
  const behavior = pursue({ aggroRadius: 4, reach: 1, speed: 2, leashRange: 10, attack });
  attack.amount = 100;
  expect(behavior.attack.amount).toBe(2);
  expect(JSON.parse(JSON.stringify(behavior))).toEqual(behavior);
  for (const value of [-1, Infinity, NaN]) expect(() => pursue({ ...descriptor, thinkInterval: value })).toThrow();
});

test("aggro is bounded and disabled pursuit retains cooldown until re-enabled", () => {
  const ctx = context();
  ctx.scene.entity.spawn("mob", { id: "mob", behaviors: [pursue({ ...descriptor, speed: 0 })] });
  ctx.scene.entity.spawn("hero", { id: "hero", role: "player", position: [6, 0, 0] });
  advanceBehaviors(ctx, 1);
  const control = behaviorControl(ctx);
  let state = control.serialize("mob");
  expect(state?.kind === "pursue" && state.targetId).toBeNull();
  ctx.scene.entity.setPose("hero", { position: [.4, 0, 0] });
  advanceBehaviors(ctx, .1);
  expect(ctx.scene.entity.stats.get("hero", "health")!.current).toBe(98);
  control.disable("mob", "scripted");
  state = control.serialize("mob");
  advanceBehaviors(ctx, 10);
  expect(control.serialize("mob")).toEqual(state);
  expect(control.reason("mob")).toBe("scripted");
  control.enable("mob");
  advanceBehaviors(ctx, .5);
  expect(ctx.scene.entity.stats.get("hero", "health")!.current).toBe(98);
  advanceBehaviors(ctx, .5);
  expect(ctx.scene.entity.stats.get("hero", "health")!.current).toBe(96);
});

test("sibling pursuit acquisition is staggered deterministically across scheduled frames", () => {
  const probe = () => {
    const ctx = context();
    for (let i = 0; i < 40; i++) ctx.scene.entity.spawn("mob", { id: `agent-${i}`, behaviors: [pursue({ ...descriptor, speed: 0, thinkInterval: 1 })] });
    ctx.scene.entity.spawn("hero", { id: "hero", role: "player", position: [1, 0, 0] });
    const control = behaviorControl(ctx);
    const counts: number[] = [];
    for (let frame = 0; frame < 10; frame++) {
      advanceBehaviors(ctx, .1);
      counts.push(control.list().filter(entry => {
        const state = control.serialize(entry.id);
        return state?.kind === "pursue" && state.targetId !== null;
      }).length);
    }
    return counts;
  };
  const first = probe();
  expect(first).toEqual(probe());
  expect(first[0]).toBeGreaterThan(0);
  expect(first[0]).toBeLessThan(40);
  expect(first[9]).toBe(40);
  expect(new Set(first).size).toBeGreaterThan(3);
});

test("bounded nearest-player selection, optional threat and explicit target precedence", () => {
  const ctx = context();
  ctx.scene.entity.spawn("mob", { id: "mob", behaviors: [pursue({ ...descriptor, speed: 0, threat: {} })] });
  ctx.scene.entity.spawn("prop", { id: "prop", role: "prop", position: [.1, 0, 0] });
  ctx.scene.entity.spawn("hero", { id: "near", role: "player", position: [1, 0, 0] });
  ctx.scene.entity.spawn("hero", { id: "far", role: "player", position: [3, 0, 0] });
  const control = behaviorControl(ctx);
  const target = () => { const state = control.serialize("mob"); return state?.kind === "pursue" ? state.targetId : null; };
  advanceBehaviors(ctx, .1);
  expect(target()).toBe("near");
  const threat = control.threat("mob")!;
  threat.add("far", 8);
  advanceBehaviors(ctx, .1);
  expect(target()).toBe("far");
  threat.taunt("far", 10);
  ctx.scene.entity.setTarget("mob", "near");
  advanceBehaviors(ctx, .1);
  expect(target()).toBe("near");
  ctx.scene.entity.setTarget("mob", null);
  advanceBehaviors(ctx, .1);
  expect(target()).toBe("far");
  ctx.scene.entity.despawn("far");
  advanceBehaviors(ctx, .1);
  expect(target()).toBe("near");
  control.reset("mob");
  expect(threat.size()).toBe(0);
  expect(target()).toBeNull();
});

test("home is spawnPoseOf even when the entity moved before its first behavior tick", () => {
  const ctx = context();
  ctx.scene.entity.spawn("mob", { id: "mob", position: [10, 0, 0], behaviors: [pursue({ ...descriptor, leashRange: 3 })] });
  ctx.scene.entity.setPose("mob", { position: [15, 0, 0] });
  advanceBehaviors(ctx, 1);
  expect(ctx.scene.entity.get("mob")!.position).toEqual([13, 0, 0]);
  advanceBehaviors(ctx, 2);
  expect(ctx.scene.entity.get("mob")!.position).toEqual([10, 0, 0]);
});

test("attacks use the lethal/onDeath effect pipeline and solid-aware movement", () => {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "pursuit-effects", multiplayer: "off", persist: false }),
    content: { entityById: name => ({ stats: { health: { max: 5 } }, receive: { damage: { order: ["health"] } },
      ...(name === "victim" ? { onDeath: { command: "death-proof" } } : {}) }) }, player: { userId: "probe", isNew: true } });
  let deaths = 0;
  ctx.game.commands.define("death-proof", { apply: () => { deaths++; } });
  ctx.scene.entity.spawn("mob", { id: "mob", behaviors: [pursue({ ...descriptor, attack: { effect: "damage", amount: 5, intervalSec: 1 } })] });
  ctx.scene.entity.spawn("victim", { id: "victim", position: [.4, 0, 0] });
  ctx.scene.entity.setTarget("mob", "victim");
  advanceBehaviors(ctx, .1);
  expect(ctx.scene.entity.get("victim")).toBeNull();
  expect(deaths).toBe(1);
  ctx.scene.entity.spawn("hero", { id: "hero", role: "player", position: [4, 0, 0] });
  ctx.world.solids.set("wall", [{ center: [1, 1, 0], halfExtents: [.25, 1, 2] }]);
  for (let i = 0; i < 5; i++) advanceBehaviors(ctx, 1);
  expect(ctx.scene.entity.get("mob")!.position[0]).toBeLessThan(.75);
});

test("cold whole-world save/reload and replication retain cooldown, home, gate, threat and status", async () => {
  const backend = memorySaveBackend();
  const ctx = context(backend);
  ctx.scene.entity.spawn("mob", { id: "mob", behaviors: [pursue({ ...descriptor, threat: {} })] });
  ctx.scene.entity.spawn("hero", { id: "hero", role: "player", position: [3, 0, 0] });
  advanceBehaviors(ctx, 1);
  advanceBehaviors(ctx, 1);
  advanceBehaviors(ctx, .1);
  const control = behaviorControl(ctx);
  control.threat("mob")!.add("hero", 4);
  control.pause("mob", "handoff");
  const state = control.serialize("mob");
  await ctx.game.save!.checkpoint();
  const fresh = context(backend);
  expect(await fresh.game.save!.load()).toBe(true);
  const restored = behaviorControl(fresh);
  expect(restored.serialize("mob")).toEqual(state);
  expect(fresh.scene.entity.spawnPoseOf("mob")!.position).toEqual([2.5, 0, 0]);
  expect(state?.kind === "pursue" && state.home).toEqual([0, 0, 0]);
  expect(restored.status("mob")).toBe("paused");
  expect(restored.reason("mob")).toBe("handoff");
  advanceBehaviors(fresh, 10);
  expect(fresh.scene.entity.stats.get("hero", "health")!.current).toBe(98);
  control.resume("mob"); restored.resume("mob", "advance");
  advanceBehaviors(ctx, .5); advanceBehaviors(fresh, .5);
  expect(restored.serialize("mob")).toEqual(control.serialize("mob"));
  const replica = context();
  replica.hydrate(structuredClone(ctx.snapshot()));
  expect(behaviorControl(replica).serialize("mob")).toEqual(control.serialize("mob"));
  advanceBehaviors(ctx, .5); advanceBehaviors(replica, .5);
  expect(replica.scene.entity.stats.get("hero", "health")).toEqual(ctx.scene.entity.stats.get("hero", "health"));
  expect(replica.scene.entity.stats.get("hero", "health")!.current).toBe(96);
  replica.scene.entity.setPose("hero", { position: [15, 0, 0] });
  for (let i = 0; i < 12; i++) advanceBehaviors(replica, 1);
  expect(replica.scene.entity.get("mob")!.position).toEqual([0, 0, 0]);
});

test("explicit targets survive a cold restore ahead of higher threat and a nearer player", () => {
  const ctx = context();
  ctx.scene.entity.spawn("mob", { id: "mob", behaviors: [pursue({ ...descriptor, speed: 0, threat: {} })] });
  ctx.scene.entity.spawn("hero", { id: "chosen", role: "player", position: [4, 0, 0] });
  ctx.scene.entity.spawn("hero", { id: "near", role: "player", position: [1, 0, 0] });
  ctx.scene.entity.setTarget("mob", "chosen");
  behaviorControl(ctx).threat("mob")!.add("near", 100);
  advanceBehaviors(ctx, .1);
  const fresh = context(); fresh.restore(ctx.state());
  advanceBehaviors(fresh, .1);
  const state = behaviorControl(fresh).serialize("mob");
  expect(state?.kind === "pursue" && state.targetId).toBe("chosen");
  expect(fresh.scene.entity.getTarget("mob")).toBe("chosen");
});

test("invalid pursuit restores reject every record atomically and legacy missing modules are safe", () => {
  const ctx = context();
  for (const id of ["a", "b"]) ctx.scene.entity.spawn("mob", { id, behaviors: [descriptor] });
  ctx.scene.entity.spawn("patroller", { id: "patroller", behaviors: [patrol({ waypoints: [[0, 0, 0], [10, 0, 0]], speed: 2 })] });
  advanceBehaviors(ctx, .1);
  const control = behaviorControl(ctx);
  const before = control.serialize("a");
  const patrolBefore = control.serialize("patroller");
  const state = structuredClone(ctx.snapshot());
  const data = state.pursuitBehaviors as { version: number; instances: { snapshot: { targetId: string | null; pursuit: { attackCooldown: number } } }[] };
  data.instances[0]!.snapshot.targetId = "mutated";
  data.instances[1]!.snapshot.pursuit.attackCooldown = -1;
  ctx.hydrate({ pursuitBehaviors: data });
  expect(control.serialize("a")).toEqual(before);
  expect(control.serialize("patroller")).toEqual(patrolBefore);
  const valid = control.serialize("a")!;
  if (valid.kind !== "pursue") throw new Error("wrong behavior");
  expect(control.restore("a", { ...valid, pending: Infinity })).toBe(false);
  expect(control.serialize("a")).toEqual(before);
  ctx.hydrate({});
  expect(control.serialize("a")).toEqual(before);
});

test("5000 unrelated entities do not cause frame scans or acquisition between scheduled ticks", () => {
  const ctx = context();
  for (let i = 0; i < 5000; i++) ctx.scene.entity.spawn("prop", { id: `prop${i}`, position: [1000 + i * 16, 0, 1000] });
  ctx.scene.entity.spawn("mob", { id: "mob", behaviors: [pursue({ ...descriptor, thinkInterval: .5, speed: 0 })] });
  ctx.scene.entity.spawn("hero", { id: "hero", role: "player", position: [1, 0, 0] });
  advanceBehaviors(ctx, .5);
  const control = behaviorControl(ctx);
  const state = control.serialize("mob")!;
  if (state.kind !== "pursue") throw new Error("wrong behavior");
  control.restore("mob", { ...state, gate: { ...state.gate, clock: 0 }, pending: 0 });
  ctx.scene.entity.list = () => { throw new Error("warm full-world scan"); };
  const query = ctx.scene.entity.inRadius;
  let queries = 0;
  ctx.scene.entity.inRadius = (...args) => { queries++; return query(...args); };
  const ids = ctx.scene.entity.ids(); let visits = 0;
  ids[Symbol.iterator] = function* () { for (let i = 0; i < this.length; i++) { visits++; yield this[i]!; } };
  for (let i = 0; i < 10; i++) advanceBehaviors(ctx, .01);
  expect(queries).toBe(0);
  advanceBehaviors(ctx, .401);
  expect(queries).toBe(1);
  expect(visits).toBe(0);
});

test("pursuit replication projects the same visible entity set before cold hydration", () => {
  const host = context(undefined, 3);
  host.scene.entity.spawn("mob", { id: "near", position: [.4, 0, 0], behaviors: [descriptor] });
  host.scene.entity.spawn("mob", { id: "far", position: [20, 0, 0], behaviors: [descriptor] });
  host.scene.entity.spawn("hero", { id: "hero", role: "player", position: [0, 0, 0] });
  advanceBehaviors(host, .1);
  const snapshot = structuredClone(host.snapshot({ userId: "hero" }));
  expect((snapshot.pursuitBehaviors as { instances: { id: string }[] }).instances.map(record => record.id)).toEqual(["near"]);
  const client = context();
  client.hydrate(snapshot);
  expect(client.scene.entity.ids()).toEqual(["near", "hero"]);
  expect(behaviorControl(client).serialize("near")).toEqual(behaviorControl(host).serialize("near"));
});
