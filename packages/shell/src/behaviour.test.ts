import { describe, expect, test } from "bun:test";
import { Object3D } from "three";
import { Behaviour, createBehaviourWorld } from "@jgengine/core/behaviour/behaviour";
import { createBehaviourWorldDriver } from "./behaviourDriver";
import { attachObject3D, Object3DBehaviour } from "./behaviourAttach";

class RenderProbe extends Object3DBehaviour {
  calls: string[] = [];
  override onBeforeRender(): void {
    this.calls.push("before");
  }
  override onAfterRender(): void {
    this.calls.push("after");
  }
}

function invokeRenderCallbacks(object: Object3D): void {
  const args = [] as unknown as Parameters<Object3D["onBeforeRender"]>;
  object.onBeforeRender(...args);
  object.onAfterRender(...args);
}

describe("attachObject3D", () => {
  test("binds the object, defaults the node id to the uuid, and activates through the world", () => {
    const world = createBehaviourWorld();
    world.start();
    const object = new Object3D();
    const probe = attachObject3D(world, object, new RenderProbe());
    expect(probe.object).toBe(object);
    expect(world.has(object.uuid)).toBe(true);
    expect(probe.isActive).toBe(true);
  });

  test("render hooks fire via the object's three.js callbacks only while active", () => {
    const world = createBehaviourWorld();
    world.start();
    const object = new Object3D();
    const probe = attachObject3D(world, object, new RenderProbe(), "probe");
    invokeRenderCallbacks(object);
    expect(probe.calls).toEqual(["before", "after"]);
    probe.disable();
    invokeRenderCallbacks(object);
    expect(probe.calls).toEqual(["before", "after"]);
    world.setActive("probe", true);
    probe.enable();
    invokeRenderCallbacks(object);
    expect(probe.calls).toEqual(["before", "after", "before", "after"]);
  });

  test("existing render callbacks are preserved ahead of the behaviour's", () => {
    const world = createBehaviourWorld();
    world.start();
    const object = new Object3D();
    const order: string[] = [];
    object.onBeforeRender = () => {
      order.push("existing");
    };
    class Late extends Object3DBehaviour {
      override onBeforeRender(): void {
        order.push("behaviour");
      }
    }
    attachObject3D(world, object, new Late(), "late");
    const args = [] as unknown as Parameters<Object3D["onBeforeRender"]>;
    object.onBeforeRender(...args);
    expect(order).toEqual(["existing", "behaviour"]);
  });

  test("behaviours that do not override render hooks leave the object's callbacks untouched", () => {
    const world = createBehaviourWorld();
    world.start();
    const object = new Object3D();
    const before = object.onBeforeRender;
    const after = object.onAfterRender;
    attachObject3D(world, object, new Object3DBehaviour(), "plain");
    expect(object.onBeforeRender).toBe(before);
    expect(object.onAfterRender).toBe(after);
  });

  test("update lifecycle still flows through world.update on game dt", () => {
    const world = createBehaviourWorld();
    world.start();
    const seen: number[] = [];
    class Ticker extends Object3DBehaviour {
      override onUpdate(dt: number): void {
        seen.push(dt);
      }
    }
    attachObject3D(world, new Object3D(), new Ticker(), "ticker");
    world.update(0.5);
    expect(seen).toEqual([0.5]);
  });
});

describe("createBehaviourWorldDriver", () => {
  test("starts the world once and stops driving updates on stop", () => {
    const world = createBehaviourWorld();
    const seen: number[] = [];
    class Ticker extends Behaviour {
      override onUpdate(dt: number): void {
        seen.push(dt);
      }
    }
    world.attach("root", new Ticker());
    const driver = createBehaviourWorldDriver(world);
    expect(world.started()).toBe(false);
    driver.start();
    expect(world.started()).toBe(true);
    expect(driver.isRunning()).toBe(true);
    driver.step(0.16);
    expect(seen).toEqual([0.16]);
    driver.stop();
    expect(driver.isRunning()).toBe(false);
    driver.step(0.32);
    expect(seen).toEqual([0.16]);
  });

  test("remount-style restart does not double-start the world", () => {
    const world = createBehaviourWorld();
    const first = createBehaviourWorldDriver(world);
    first.start();
    first.stop();
    const second = createBehaviourWorldDriver(world);
    second.start();
    expect(world.started()).toBe(true);
    expect(second.isRunning()).toBe(true);
    expect(first.isRunning()).toBe(false);
  });
});
