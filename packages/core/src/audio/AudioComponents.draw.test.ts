import { describe, expect, test } from "bun:test";

import { hearingPoint } from "./AudioComponents.draw";

function ctx(active: string | null, bodies: Record<string, readonly [number, number, number]>) {
  return {
    player: { userId: "me", possession: { active: () => active } },
    scene: { entity: { get: (id: string) => (bodies[id] === undefined ? null : { position: bodies[id]! }) } },
  };
}

describe("hearingPoint", () => {
  const camera = { x: 0, y: 20, z: -10 };

  test("hears from the driven body's head, then the player's own, then the camera", () => {
    expect(hearingPoint(ctx("car", { car: [5, 0, 5], me: [1, 0, 1] }), camera)).toEqual({ x: 5, y: 1.5, z: 5 });
    expect(hearingPoint(ctx(null, { me: [1, 2, 1] }), camera)).toEqual({ x: 1, y: 3.5, z: 1 });
    expect(hearingPoint(ctx(null, {}), camera)).toBe(camera);
  });
});
