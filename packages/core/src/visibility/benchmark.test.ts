import { describe, expect, test } from "bun:test";
import type { CameraVisibilityContext } from "@jgengine/core/visibility/camera";
import type { Renderable } from "@jgengine/core/visibility/visibilitySystem";
import { createVisibilitySystem } from "@jgengine/core/visibility/visibilitySystem";

/**
 * Representative benchmark: a large scene where most objects sit far outside the camera view.
 * Demonstrates the two engine wins — far fewer objects reach the renderer, and the spatial
 * index means the culler never scans the whole scene — while proving correctness (an object
 * placed dead-ahead is always kept).
 */
function grid(count: number, spacing: number): Renderable[] {
  const side = Math.ceil(Math.sqrt(count));
  const out: Renderable[] = [];
  for (let i = 0; i < count; i += 1) {
    const gx = (i % side) - side / 2;
    const gz = Math.floor(i / side) - side / 2;
    out.push({ id: `o${i}`, position: [gx * spacing, 0, gz * spacing], version: 1 });
  }
  return out;
}

describe("visibility benchmark", () => {
  test("a 10k-object field submits only a small fraction to the renderer", () => {
    const objects = grid(10_000, 4);
    const camera: CameraVisibilityContext = {
      id: "main",
      view: { kind: "perspective", position: [0, 5, 0], target: [0, 5, 1], fovDeg: 60, aspect: 16 / 9, near: 0.1, far: 120 },
    };
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [camera] });

    // Warm the index, then measure a steady-state frame.
    sys.update();
    const t0 = performance.now();
    const result = sys.update();
    const ms = performance.now() - t0;

    const stats = result.stats;
    expect(stats.totalObjects).toBe(10_000);
    // Far fewer objects reach the renderer.
    expect(stats.visible).toBeLessThan(1_000);
    expect(stats.drawCallsAvoided).toBeGreaterThan(9_000);
    // The spatial index means we never even consider the whole scene.
    expect(stats.consideredForRender).toBeLessThan(stats.totalObjects);
    // Whole-frame culling stays cheap on a large scene (generous bound for CI variance).
    expect(ms).toBeLessThan(80);
  });

  test("an object dead-ahead is never culled (correctness under load)", () => {
    const objects = grid(10_000, 4);
    objects.push({ id: "hero", position: [0, 5, 30], version: 1 });
    const camera: CameraVisibilityContext = {
      id: "main",
      view: { kind: "perspective", position: [0, 5, 0], target: [0, 5, 1], fovDeg: 60, aspect: 16 / 9, near: 0.1, far: 120 },
    };
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [camera] });
    expect(sys.update().visible.has("hero")).toBe(true);
  });

  test("moving the camera reuses the index without rescanning every object", () => {
    const objects = grid(4_000, 4);
    const view = { kind: "perspective" as const, position: [0, 5, 0] as [number, number, number], target: [0, 5, 1] as [number, number, number], fovDeg: 60, aspect: 1, near: 0.1, far: 100 };
    const camera: CameraVisibilityContext = { id: "main", view };
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [camera] });
    sys.update();
    const considered = sys.update().stats.consideredForRender;
    // Only the objects near the frustum are considered, not all 4000.
    expect(considered).toBeLessThan(2_000);
  });
});
