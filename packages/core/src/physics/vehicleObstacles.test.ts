import { describe, expect, test } from "bun:test";

import type { CollisionObstacle } from "../movement/movementModel";
import { createVehicleObstacleClamp } from "./vehicleObstacles";

const DT = 1 / 60;
const RADIUS = 1.4;

describe("createVehicleObstacleClamp — head-on", () => {
  test("a straight drive into a solid is stopped and reports the closing speed once", () => {
    const obstacle: CollisionObstacle = { position: [0, 0.5, 10] }; // default unit-box half extents
    const clamp = createVehicleObstacleClamp({ obstacles: () => [obstacle], radius: RADIUS, dt: () => DT });

    const speed = 20;
    const surface = 10 - 0.5 - RADIUS; // 8.1 — the inflated front face the car body contacts
    const allowed = clamp.clampMove([0, surface], [0, surface + speed * DT]);
    expect(allowed[0]).toBeCloseTo(0);
    expect(allowed[1]).toBeCloseTo(surface); // no forward progress into the wall

    const impact = clamp.takeImpact();
    expect(impact).not.toBeNull();
    expect(impact!.closingSpeed).toBeCloseTo(speed, 3); // ≈ approach speed
    expect(impact!.normal[0]).toBeCloseTo(0);
    expect(impact!.normal[1]).toBeCloseTo(-1); // push-back points back toward the car (−Z)
    expect(impact!.obstacleIndex).toBe(0);

    expect(clamp.takeImpact()).toBeNull(); // consumed on read
  });
});

describe("createVehicleObstacleClamp — shallow graze", () => {
  test("a 15° graze keeps its tangential run and sheds only the into-wall component", () => {
    const wall: CollisionObstacle = { position: [0, 0.5, 5], halfExtents: [50, 1, 1] };
    const clamp = createVehicleObstacleClamp({ obstacles: () => [wall], radius: RADIUS, dt: () => DT });

    const speed = 20;
    const angle = (15 * Math.PI) / 180; // 15° off the wall surface, so mostly tangential
    const front = 5 - 1 - RADIUS; // 2.6 — riding the inflated wall face
    const from: readonly [number, number] = [0, front];
    const to: readonly [number, number] = [Math.cos(angle) * speed * DT, front + Math.sin(angle) * speed * DT];

    const allowed = clamp.clampMove(from, to);
    const attemptedTangential = to[0] - from[0];
    const allowedTangential = allowed[0] - from[0];
    expect(allowedTangential / attemptedTangential).toBeGreaterThan(0.8); // tangential mostly preserved
    expect(allowed[1]).toBeCloseTo(front); // into-wall component zeroed

    const impact = clamp.takeImpact();
    expect(impact).not.toBeNull();
    expect(impact!.closingSpeed).toBeCloseTo(speed * Math.sin(angle), 2); // proportional to the shallow entry
    expect(impact!.closingSpeed).toBeLessThan(speed * 0.4); // small next to a head-on
  });
});

describe("createVehicleObstacleClamp — passthrough", () => {
  test("no solids nearby returns the destination unchanged with no impact", () => {
    const clamp = createVehicleObstacleClamp({ obstacles: () => [], radius: RADIUS, dt: () => DT });
    const to: readonly [number, number] = [3, 4];
    const allowed = clamp.clampMove([1, 2], to);
    expect(allowed).toBe(to); // same reference — zero-allocation passthrough
    expect(clamp.takeImpact()).toBeNull();
  });

  test("solids present but not in the path pass through unchanged", () => {
    const distant: CollisionObstacle = { position: [500, 0.5, 500] };
    const clamp = createVehicleObstacleClamp({ obstacles: () => [distant], radius: RADIUS, dt: () => DT });
    const to: readonly [number, number] = [1, 1];
    const allowed = clamp.clampMove([0, 0], to);
    expect(allowed).toBe(to);
    expect(clamp.takeImpact()).toBeNull();
  });
});

describe("createVehicleObstacleClamp — impact bookkeeping", () => {
  test("the largest block since the last take wins, and reads clear it", () => {
    const obstacle: CollisionObstacle = { position: [0, 0.5, 10] };
    const clamp = createVehicleObstacleClamp({ obstacles: () => [obstacle], radius: RADIUS, dt: () => DT });
    const surface = 10 - 0.5 - RADIUS;

    clamp.clampMove([0, surface], [0, surface + 5 * DT]); // closing 5
    clamp.clampMove([0, surface], [0, surface + 25 * DT]); // closing 25 — the harder hit

    const impact = clamp.takeImpact();
    expect(impact!.closingSpeed).toBeCloseTo(25, 3);
    expect(clamp.takeImpact()).toBeNull();
  });
});
