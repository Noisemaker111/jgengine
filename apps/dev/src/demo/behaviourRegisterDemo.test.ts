import { describe, expect, test } from "bun:test";
import { createRegisteredWorld, CutsceneCamera, typedModuleAccess } from "./behaviourRegisterDemo";

describe("JGEngineRegister fixture", () => {
  test("registered modules are reachable by key with their concrete types", () => {
    const world = createRegisteredWorld();
    world.start();
    const { director, score } = typedModuleAccess(world);
    expect(director.cutscene).toBe(false);
    expect(score.points).toBe(0);
    world.update(2);
    expect(score.points).toBe(2);
  });

  test("behaviours read sibling modules through this.modules", () => {
    const world = createRegisteredWorld();
    const camera = world.attach("camera-rig", new CutsceneCamera());
    world.start();
    world.update(1);
    expect(camera.framed).toBe(false);
    const { director } = typedModuleAccess(world);
    director.beginCutscene();
    world.update(1);
    expect(camera.framed).toBe(true);
  });
});
