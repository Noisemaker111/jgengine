import { describe, expect, test } from "bun:test";
import {
  aimToPoint,
  createDragCapture,
  groundOf,
  moveTargetFromHit,
  type PointerHit,
} from "@jgengine/core/input/pointer";

const HIT: PointerHit = { point: [3, 0, 4], normal: [0, 1, 0], entity: null, object: "chest-1" };

describe("pointer", () => {
  test("aimToPoint returns a normalized origin→point direction", () => {
    const aim = aimToPoint([0, 0, 0], [3, 0, 4]);
    expect("direction" in aim).toBe(true);
    if ("direction" in aim) {
      const [x, y, z] = aim.direction;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1);
      expect(x).toBeCloseTo(0.6);
      expect(z).toBeCloseTo(0.8);
    }
  });

  test("aimToPoint on a zero-length vector falls back to forward", () => {
    const aim = aimToPoint([1, 1, 1], [1, 1, 1]);
    if ("direction" in aim) expect(aim.direction).toEqual([0, 0, 1]);
  });

  test("moveTargetFromHit returns the world point", () => {
    expect(moveTargetFromHit(HIT)).toEqual([3, 0, 4]);
  });

  test("groundOf drops the y component for navmesh routing", () => {
    expect(groundOf(HIT)).toEqual([3, 4]);
  });
});

describe("createDragCapture", () => {
  test("begin outside grabRadius is rejected and leaves no active drag", () => {
    const drag = createDragCapture({ grabRadius: 2 });
    expect(drag.begin([0, 0, 0], [5, 0, 0])).toBe(false);
    expect(drag.state()).toBeNull();
  });

  test("begin within grabRadius starts the drag", () => {
    const drag = createDragCapture({ grabRadius: 2 });
    expect(drag.begin([0, 0, 0], [1, 0, 0])).toBe(true);
    expect(drag.state()).not.toBeNull();
  });

  test("pull clamps to maxPull while preserving direction", () => {
    const drag = createDragCapture({ maxPull: 2 });
    drag.begin([0, 0, 0], [0, 0, 0]);
    drag.update([6, 0, 8]);
    const state = drag.state();
    expect(state).not.toBeNull();
    expect(state?.magnitude).toBeCloseTo(2);
    expect(state?.pull[0]).toBeCloseTo((6 / 10) * 2);
    expect(state?.pull[2]).toBeCloseTo((8 / 10) * 2);
    expect(state?.current).toEqual([6, 0, 8]);
  });

  test("fraction reports magnitude as a share of maxPull", () => {
    const drag = createDragCapture({ maxPull: 4 });
    drag.begin([0, 0, 0], [0, 0, 0]);
    drag.update([2, 0, 0]);
    expect(drag.state()?.fraction).toBeCloseTo(0.5);
    drag.update([10, 0, 0]);
    expect(drag.state()?.fraction).toBeCloseTo(1);
  });

  test("release ends the drag and returns the final state", () => {
    const drag = createDragCapture({ maxPull: 4 });
    drag.begin([0, 0, 0], [0, 0, 0]);
    drag.update([1, 0, 0]);
    const result = drag.release();
    expect(result?.magnitude).toBeCloseTo(1);
    expect(drag.state()).toBeNull();
    expect(drag.release()).toBeNull();
  });

  test("cancel discards the drag without returning a result", () => {
    const drag = createDragCapture();
    drag.begin([0, 0, 0], [1, 1, 1]);
    drag.cancel();
    expect(drag.state()).toBeNull();
    expect(drag.release()).toBeNull();
  });

  test("update before begin is a no-op", () => {
    const drag = createDragCapture();
    drag.update([9, 9, 9]);
    expect(drag.state()).toBeNull();
  });
});
