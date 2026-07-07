import { describe, expect, test } from "bun:test";

import { createDamageModel } from "./damageZones";
import type { CollisionEvent } from "./physicsWorld";

describe("DamageModel", () => {
  test("accumulated impulse advances a zone through discrete stages", () => {
    const model = createDamageModel({ zones: [{ id: "front", thresholds: [10, 25, 50] }] });
    expect(model.absorb("front", 5)).toBeNull();
    const t1 = model.absorb("front", 8);
    expect(t1?.stage).toBe(1);
    expect(model.stageOf("front")).toBe(1);
    const t2 = model.absorb("front", 15);
    expect(t2?.stage).toBe(2);
    expect(t2?.previousStage).toBe(1);
  });

  test("a detach stage ejects a part exactly once", () => {
    const detaches: string[] = [];
    const model = createDamageModel({
      zones: [{ id: "bumper", thresholds: [10, 20], detachStage: 2 }],
      onDetach: (zone) => detaches.push(zone),
    });
    model.absorb("bumper", 12);
    const t = model.absorb("bumper", 12);
    expect(t?.detached).toBe(true);
    model.absorb("bumper", 100);
    expect(detaches).toEqual(["bumper"]);
  });

  test("total impulse across zones crossing disableAt flips the disabled state", () => {
    const model = createDamageModel({
      zones: [
        { id: "front", thresholds: [10] },
        { id: "rear", thresholds: [10] },
      ],
      disableAt: 30,
    });
    model.absorb("front", 15);
    expect(model.disabled).toBe(false);
    const t = model.absorb("rear", 20);
    expect(model.disabled).toBe(true);
    expect(t?.disabled).toBe(true);
  });

  test("routeCollision reads impulse from a CollisionEvent and feeds the resolved zone", () => {
    const model = createDamageModel({ zones: [{ id: "front", thresholds: [5] }, { id: "rear", thresholds: [5] }] });
    const event: CollisionEvent = { a: 0, b: 1, nx: 0, ny: 0, nz: 1, approachSpeed: 9, impulse: 8 };
    const t = model.routeCollision(event, (e) => (e.nz > 0 ? "front" : "rear"));
    expect(t?.zone).toBe("front");
    expect(model.stageOf("front")).toBe(1);
  });

  test("reset clears accumulation, stages and disabled", () => {
    const model = createDamageModel({ zones: [{ id: "front", thresholds: [5] }], disableAt: 5 });
    model.absorb("front", 10);
    expect(model.disabled).toBe(true);
    model.reset();
    expect(model.disabled).toBe(false);
    expect(model.stageOf("front")).toBe(0);
    expect(model.total).toBe(0);
  });
});
