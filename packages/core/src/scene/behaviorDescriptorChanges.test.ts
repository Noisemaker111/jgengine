import { expect, test } from "bun:test";
import { defineGameDefinition } from "../game/defineGame";
import { createGameContext } from "../runtime/gameContext";
import { advanceBehaviors, behaviorControl, registerBehaviorActions } from "./behaviorRuntime";
import { patrol, pursue, talkable, wander, type DecisionGraphBehavior } from "./behaviors";
import { createEntityStore } from "./entityStore";

function context() {
  return createGameContext({ definition: defineGameDefinition({ name: "descriptor-updates", multiplayer: "off", persist: false }),
    content: { entityById: () => ({ stats: { health: { max: 100 } }, receive: { damage: { order: ["health"] } } }) },
    player: { userId: "hero", isNew: true } });
}
const descriptor = (amount = 2) => pursue({ aggroRadius: 5, reach: 1, leashRange: 10, speed: 0,
  thinkInterval: 0, attack: { effect: "damage", amount, intervalSec: 0 }, threat: {} });
function spawn(ctx: ReturnType<typeof context>, amount = 2) {
  ctx.scene.entity.spawn("mob", { id: "mob", behaviors: [descriptor(amount)] });
  ctx.scene.entity.spawn("hero", { id: "hero", role: "player", position: [.5, 0, 0] });
}

test("same-id update and warm world hydration use the replacement pursuit policy", () => {
  const client = context(); spawn(client); advanceBehaviors(client, .1);
  client.scene.entity.update("mob", { behaviors: [descriptor(9)] });
  advanceBehaviors(client, .1);
  expect(client.scene.entity.stats.get("hero", "health")!.current).toBe(89);
  const host = context(); spawn(host, 15);
  client.hydrate(structuredClone(host.snapshot()));
  advanceBehaviors(client, .1);
  expect(client.scene.entity.stats.get("hero", "health")!.current).toBe(85);
});

test("warm same-id hydration removes behavior ownership and its attack", () => {
  const ctx = context(); spawn(ctx); advanceBehaviors(ctx, .1);
  const entities = structuredClone(ctx.scene.entity.list());
  entities.find(entity => entity.id === "mob")!.behaviors = [];
  ctx.hydrate({ entities }); advanceBehaviors(ctx, 1);
  expect(behaviorControl(ctx).serialize("mob")).toBeNull();
  expect(ctx.scene.entity.stats.get("hero", "health")!.current).toBe(98);
});

test("equal-data hydration and unrelated prompts retain original pursuit home and lifecycle", () => {
  const ctx = context(); spawn(ctx);
  ctx.scene.entity.setPose("mob", { position: [3, 0, 0] });
  const control = behaviorControl(ctx);
  control.threat("mob")!.add("hero", 7);
  control.pause("mob", "retained"); advanceBehaviors(ctx, .2);
  const before = control.serialize("mob");
  ctx.hydrate({ entities: JSON.parse(JSON.stringify(ctx.scene.entity.list())) });
  expect(control.serialize("mob")).toEqual(before);
  expect(control.status("mob")).toBe("paused"); expect(control.reason("mob")).toBe("retained");
  ctx.scene.entity.update("mob", { behaviors: [descriptor(), talkable("changed-dialogue")] });
  expect(control.serialize("mob")).toEqual(before);
  expect(control.status("mob")).toBe("paused");
  expect(before?.kind === "pursue" && before.home).toEqual([0, 0, 0]);
});

test("patrol/wander replacements reconcile by id before ordinary subscribers without scanning", () => {
  const ctx = context();
  const route = (speed: number) => patrol({ waypoints: [[0, 0, 0], [10, 0, 0]], speed });
  ctx.scene.entity.spawn("walker", { id: "walker", behaviors: [route(1)] }); advanceBehaviors(ctx, 1);
  const control = behaviorControl(ctx);
  control.pause("walker", "same"); const before = control.serialize("walker");
  ctx.scene.entity.update("walker", { behaviors: [JSON.parse(JSON.stringify(route(1))), talkable("new")] });
  expect(control.serialize("walker")).toEqual(before); expect(control.status("walker")).toBe("paused");
  ctx.scene.entity.list = () => { throw new Error("descriptor update scanned world"); };
  ctx.scene.entity.update("walker", { behaviors: [route(3)] }); advanceBehaviors(ctx, 1);
  expect(ctx.scene.entity.get("walker")!.position[0]).toBeCloseTo(3);
  let observed = false;
  const unsubscribe = ctx.subscribe(() => { observed = true; expect(control.inspect("walker")?.kind).toBe("wander"); });
  ctx.scene.entity.update("walker", { behaviors: [wander({ radius: 2 })] });
  unsubscribe(); expect(observed).toBe(true);
  ctx.scene.entity.update("walker", { behaviors: [] }); expect(control.inspect("walker")).toBeNull();
});

test("decision graph replacement uses new actions and removal stops ticks", () => {
  const ctx = context(); let first = 0, second = 0;
  const unregister = registerBehaviorActions("replacement-test", { first: () => { first++; return "done"; }, second: () => { second++; return "done"; } });
  const graph = (action: string): DecisionGraphBehavior => ({ kind: "decisionGraph", actions: "replacement-test", graph: { kind: "action", action }, thinkInterval: 0 });
  ctx.scene.entity.spawn("thinker", { id: "thinker", behaviors: [graph("first")] }); advanceBehaviors(ctx, .1);
  ctx.scene.entity.update("thinker", { behaviors: [graph("second")] }); advanceBehaviors(ctx, .1);
  expect([first, second]).toEqual([1, 1]);
  ctx.scene.entity.update("thinker", { behaviors: [] }); advanceBehaviors(ctx, 1);
  expect([first, second]).toEqual([1, 1]); unregister();
});

test("running graph replacement/removal aborts exact compiled params once, preserving equal-data blackboards", () => {
  const ctx = context(); let runs = 0;
  const aborted: unknown[] = [];
  const unregister = registerBehaviorActions("claims-test", { claim: () => { runs++; return "running"; } }, {
    onAbort: (action, frame, params, blackboard) => aborted.push({ action, id: frame.entityId, params, fact: blackboard.fact }),
  });
  const graph: DecisionGraphBehavior = { kind: "decisionGraph", actions: "claims-test", thinkInterval: 0,
    graph: { kind: "action", action: "claim", params: { resource: "unique-claim" } } };
  ctx.scene.entity.spawn("thinker", { id: "thinker", behaviors: [graph] }); advanceBehaviors(ctx, .1);
  const control = behaviorControl(ctx); control.blackboard("thinker")!.fact = 42;
  const before = control.serialize("thinker");
  ctx.scene.entity.update("thinker", { behaviors: [JSON.parse(JSON.stringify(graph)), talkable("changed")] });
  expect(control.serialize("thinker")).toEqual(before); expect(control.blackboard("thinker")!.fact).toBe(42);
  expect(aborted).toEqual([]);
  ctx.scene.entity.update("thinker", { behaviors: [wander({ radius: 0 })] });
  expect(aborted).toEqual([{ action: "claim", id: "thinker", params: { resource: "unique-claim" }, fact: 42 }]);
  ctx.scene.entity.update("thinker", { behaviors: [graph] }); advanceBehaviors(ctx, .1);
  ctx.scene.entity.despawn("thinker");
  expect(aborted).toHaveLength(2); expect(runs).toBe(2);
  advanceBehaviors(ctx, 1); expect(aborted).toHaveLength(2); expect(runs).toBe(2); unregister();
});

test("throwing user abort propagates after the old cache is replaced", () => {
  const ctx = context(); let runs = 0, aborts = 0;
  const unregister = registerBehaviorActions("throwing-abort", { claim: () => { runs++; return "running"; } }, {
    onAbort: () => { aborts++; throw new Error("caller abort failed"); },
  });
  ctx.scene.entity.spawn("thinker", { id: "thinker", behaviors: [{ kind: "decisionGraph", actions: "throwing-abort", graph: { kind: "action", action: "claim" } }] });
  advanceBehaviors(ctx, .1);
  expect(() => ctx.scene.entity.update("thinker", { behaviors: [wander({ radius: 0 })] })).toThrow("caller abort failed");
  expect(behaviorControl(ctx).inspect("thinker")?.kind).toBe("wander");
  advanceBehaviors(ctx, .1); expect(runs).toBe(1); expect(aborts).toBe(1);
  ctx.scene.entity.update("thinker", { behaviors: [] }); expect(aborts).toBe(1); unregister();
});

test("behavior subscription ignores pose/equal data, orders notifications and cleans up", () => {
  const store = createEntityStore(); const changes: string[] = [];
  const unsubscribe = store.subscribeBehaviors(id => changes.push(id));
  store.spawn("walker", { id: "walker", behaviors: [wander({ radius: 2 })] });
  for (let i = 0; i < 100; i++) store.setPose("walker", { position: [i, 0, 0] });
  store.update("walker", { behaviors: [{ radius: 2, kind: "wander" }] });
  store.update("walker", { behaviors: JSON.parse(JSON.stringify(store.get("walker")!.behaviors)) });
  store.hydrate(JSON.parse(JSON.stringify(store.snapshot())));
  expect(changes).toEqual(["walker"]);
  const ordinary = store.subscribe(() => { expect(changes).toEqual(["walker", "walker"]); });
  store.update("walker", { behaviors: [] }); expect(changes).toEqual(["walker", "walker"]);
  ordinary(); unsubscribe();
  store.update("walker", { behaviors: [wander({ radius: 3 })] }); store.clear();
  expect(changes).toEqual(["walker", "walker"]);
});

test("pose-only writes never inspect descriptor data and spawn observers see the committed home", () => {
  const store = createEntityStore();
  store.spawn("walker", { id: "walker", behaviors: [wander({ radius: 2 })] });
  let reads = 0;
  Object.defineProperty(store.get("walker")!.behaviors[0], "radius", { get() { reads++; return 2; } });
  for (let i = 0; i < 100; i++) store.setPose("walker", { position: [i, 0, 0] });
  store.update("walker", { name: "renamed" }); expect(reads).toBe(0);
  const unsubscribe = store.subscribeBehaviors(id => expect(store.spawnPoseOf(id)?.position).toEqual([20, 0, 0]));
  store.spawn("walker", { id: "walker", onExisting: "replace", position: [20, 0, 0], behaviors: [wander({ radius: 3 })] });
  unsubscribe();
});
