import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { createGameContext, type GameContext } from "../runtime/gameContext";
import { createOnboarding, type OnboardingConfig } from "./onboarding";
import { createOnboardingSystem, ONBOARDING_MARK, onboardingLock, onboardingOf } from "./onboardingSystem";

const STEPS: OnboardingConfig<GameContext> = {
  id: "first-steps",
  title: "First steps",
  style: "teaching-area",
  area: { center: [0, 0], radius: 50, label: "the beach" },
  steps: [
    { id: "kill", text: "Knock out a dodo", target: { kind: "dodo" }, done: { event: "entity.died", match: { catalogId: "dodo" }, count: 2 }, locks: ["craft"] },
    { id: "stone", text: "Gather stone", target: { at: [10, 0, 10] }, minimap: true, pointer: false, done: { progress: (ctx, userId) => ctx.player.inventoryFor(userId).count("bag", "stone"), count: 3 }, grants: { items: [{ item: "pick", count: 1, inventory: "bag" }] } },
    { id: "craft", text: "Craft a pick", done: { when: (ctx, userId) => ctx.player.inventoryFor(userId).count("bag", "pick") >= 2 } },
  ],
};

function boot(config: OnboardingConfig<GameContext> = STEPS) {
  const definition = defineGameDefinition({ name: "Onboarding test", multiplayer: "off", inventories: { bag: { slots: 8 } }, systems: [createOnboardingSystem(config)] });
  const ctx = createGameContext({ definition, content: {}, player: { userId: "p1", isNew: true } });
  const { onInit, onTick } = definition.loop ?? {};
  if (onInit === undefined || onTick === undefined) throw new Error("the onboarding system installed no loop");
  onInit(ctx);
  ctx.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0], role: "player" });
  ctx.game.commands.define("craft", { apply: (state) => state });
  const tick = () => onTick(ctx, 0.1);
  const died = (catalogId: string) => ctx.game.events.emit("entity.died", { instanceId: catalogId, catalogId, reason: { kind: "damage" }, position: [0, 0, 0] });
  const runtime = onboardingOf(ctx);
  if (runtime === null) throw new Error("the onboarding system did not install");
  return { ctx, tick, died, runtime };
}

describe("onboarding", () => {
  test("an event step completes only on matching events, after its count", () => {
    const { runtime, died } = boot();
    died("raptor");
    died("dodo");
    expect(runtime.run().current()?.step.id).toBe("kill");
    expect(runtime.run().current()?.progress).toBe(1);
    died("dodo");
    expect(runtime.run().isDone("kill")).toBe(true);
    expect(runtime.run().current()?.step.id).toBe("stone");
  });

  test("the pointer and minimap marker target the nearest thing of the step's kind", () => {
    const { ctx, tick, runtime } = boot();
    ctx.scene.entity.spawn("dodo", { id: "far", position: [30, 0, 0] });
    ctx.scene.entity.spawn("dodo", { id: "near", position: [5, 0, 3] });
    ctx.scene.entity.spawn("raptor", { id: "closer", position: [1, 0, 1] });
    tick();
    expect(runtime.pointing()).toEqual([5, 0, 3]);
    expect(runtime.waypoints.tracked()?.position).toEqual([5, 3]);
    expect(runtime.markers.get(ONBOARDING_MARK)?.position).toEqual([5, 0, 3]);
    expect(runtime.markers.get(ONBOARDING_MARK)?.label).toBe("Knock out a dodo");
  });

  test("a spot target with pointer off shows on the minimap only", () => {
    const { tick, died, runtime } = boot();
    died("dodo");
    died("dodo");
    tick();
    expect(runtime.markers.get(ONBOARDING_MARK)?.position).toEqual([10, 0, 10]);
    expect(runtime.waypoints.get(ONBOARDING_MARK)).toBeNull();
  });

  test("leaving the teaching area points back to it", () => {
    const { ctx, tick, runtime } = boot();
    ctx.scene.entity.setPose("p1", { position: [200, 0, 0] });
    tick();
    expect(runtime.pointing()).toEqual([0, 0, 0]);
    expect(runtime.waypoints.tracked()?.label).toBe("Back to the beach");
  });

  test("a step marked inArea: false points at its target past the teaching area", () => {
    const steps = STEPS.steps.map((step) => (step.id === "kill" ? { ...step, inArea: false } : step));
    const { ctx, tick, runtime } = boot({ ...STEPS, steps });
    ctx.scene.entity.spawn("dodo", { id: "far", position: [230, 0, 0] });
    ctx.scene.entity.setPose("p1", { position: [200, 0, 0] });
    tick();
    expect(runtime.pointing()).toEqual([230, 0, 0]);
    expect(runtime.waypoints.tracked()?.label).toBe("Knock out a dodo");
  });

  test("a lock refuses its command until the step that holds it is done", () => {
    const { ctx, died } = boot();
    const refused = ctx.game.commands.run("craft", {});
    expect(refused).toEqual({ status: "rejected", reason: "onboarding-locked", message: "First: Knock out a dodo" });
    expect(onboardingLock(ctx, "craft")).toBe("Knock out a dodo");
    died("dodo");
    died("dodo");
    expect(ctx.game.commands.run("craft", {}).status).toBe("applied");
    expect(onboardingLock(ctx, "craft")).toBeNull();
  });

  test("condition steps complete from the world, hand out their grants, and announce", () => {
    const { ctx, tick, died, runtime } = boot();
    died("dodo");
    died("dodo");
    ctx.player.inventory.put("bag", "stone", 2);
    tick();
    expect(runtime.run().current()?.progress).toBe(2);
    ctx.player.inventory.put("bag", "stone", 1);
    tick();
    expect(runtime.run().isDone("stone")).toBe(true);
    expect(ctx.player.inventory.count("bag", "pick")).toBe(1);
    expect(runtime.banner.current()?.title).toBe("Knock out a dodo");
    runtime.banner.skip();
    expect(runtime.banner.current()?.title).toBe("Gather stone");
    expect(runtime.banner.current()?.subtitle).toBe("Next: Craft a pick");
    expect(runtime.run().isDone("craft")).toBe(false);
    ctx.player.inventory.put("bag", "pick", 1);
    tick();
    expect(runtime.run().isFinished()).toBe(true);
    expect(runtime.run().tracked().status).toBe("completed");
  });

  test("skipping ends it, lifts the locks and runs a tutorial level's finish", () => {
    const finished: string[] = [];
    const { ctx, runtime } = boot({ ...STEPS, style: "tutorial-level", finish: (_ctx, userId) => finished.push(userId) });
    expect(ctx.game.commands.run("onboarding.skip", {}).status).toBe("applied");
    expect(runtime.run().isSkipped()).toBe(true);
    expect(runtime.run().current()).toBeNull();
    expect(ctx.game.commands.run("craft", {}).status).toBe("applied");
    expect(finished).toEqual(["p1"]);
  });

  test("progress saves and restores", () => {
    const run = createOnboarding(STEPS);
    run.event("entity.died", { catalogId: "dodo" });
    const saved = run.snapshot();
    const again = createOnboarding(STEPS);
    again.restore(saved);
    expect(again.current()?.progress).toBe(1);
    again.event("entity.died", { catalogId: "dodo" });
    expect(again.isDone("kill")).toBe(true);
  });

  test("a saved game resumes on the step it was on, with its locks", () => {
    const first = boot();
    first.died("dodo");
    first.died("dodo");
    const saved = first.ctx.state();
    const again = boot();
    expect(again.ctx.game.commands.run("craft", {}).status).toBe("rejected");
    again.ctx.restore(saved);
    expect(again.runtime.run().current()?.step.id).toBe("stone");
    expect(again.ctx.game.commands.run("craft", {}).status).toBe("applied");
  });

  test("a config that cannot run fails when declared", () => {
    expect(() => createOnboarding({ ...STEPS, style: "blended" })).toThrow(/cannot lock/);
    expect(() => createOnboarding({ ...STEPS, area: undefined })).toThrow(/needs an area/);
    expect(() => createOnboarding({ ...STEPS, style: "tutorial-level" })).toThrow(/finish hook/);
    expect(() => createOnboardingSystem({ ...STEPS, steps: [{ id: "a", text: "A", done: { next: true }, grants: { xp: { amount: 5 } } }] })).toThrow(/grantXp/);
  });
});
