import { describe, expect, test } from "bun:test";

import { createEntityStore } from "../scene/entityStore";
import { createPoseHistory, lerpAngle, type RenderPose } from "./poseInterpolation";

describe("createPoseHistory", () => {
  test("samples between the previous step and the live pose", () => {
    const entities = createEntityStore();
    entities.spawn("mover", { id: "m", position: [0, 0, 0], rotationY: 0 });
    const history = createPoseHistory();
    history.beginStep(entities);
    entities.setPose("m", { position: [2, 0, 4], rotationY: 1 });
    const out: RenderPose = [0, 0, 0, 0];
    expect(history.sample(entities, "m", 0.5, out)).toBe(true);
    expect(out).toEqual([1, 0, 2, 0.5]);
  });

  test("an entity with no history renders live", () => {
    const entities = createEntityStore();
    entities.spawn("fresh", { id: "f", position: [3, 1, 3] });
    const history = createPoseHistory();
    const out: RenderPose = [0, 0, 0, 0];
    expect(history.sample(entities, "f", 0.2, out)).toBe(true);
    expect(out).toEqual([3, 1, 3, 0]);
  });

  test("jumps past snapDistance snap instead of gliding", () => {
    const entities = createEntityStore();
    entities.spawn("tp", { id: "t", position: [0, 0, 0] });
    const history = createPoseHistory({ snapDistance: 5 });
    history.beginStep(entities);
    entities.setPose("t", { position: [100, 0, 0] });
    const out: RenderPose = [0, 0, 0, 0];
    history.sample(entities, "t", 0.5, out);
    expect(out[0]).toBe(100);
  });

  test("despawned entities are dropped and unknown ids return false", () => {
    const entities = createEntityStore();
    entities.spawn("gone", { id: "g" });
    const history = createPoseHistory();
    history.beginStep(entities);
    entities.despawn("g");
    history.beginStep(entities);
    expect(history.snapshot().previous).toEqual({});
    expect(history.sample(entities, "g", 0.5, [0, 0, 0, 0])).toBe(false);
  });

  test("yaw interpolates along the shortest arc", () => {
    expect(lerpAngle(0.1, Math.PI * 2 - 0.1, 0.5)).toBeCloseTo(0);
    expect(Math.abs(lerpAngle(-Math.PI + 0.2, Math.PI - 0.2, 0.5))).toBeCloseTo(Math.PI);
  });
});
