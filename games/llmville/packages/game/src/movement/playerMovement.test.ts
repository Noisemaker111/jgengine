import { describe, expect, test } from "bun:test";
import {
  stepPlayer,
  type GeometryStepResolver,
  type PlayerStepContext,
} from "@llmville/game/movement/playerMovement";

const openGeometry: GeometryStepResolver = (_from, stepX, stepZ) => ({ stepX, stepZ });

function context(overrides: Partial<PlayerStepContext> = {}): PlayerStepContext {
  return { resolveGeometryStep: openGeometry, otherPlayers: [], ...overrides };
}

describe("stepPlayer", () => {
  test("returns the same position when delta is zero", () => {
    const current = { x: 1.5, z: 2.5 };
    expect(stepPlayer(current, 0, 0, context())).toEqual(current);
  });

  test("takes the whole step through open space", () => {
    expect(stepPlayer({ x: 4, z: 4 }, 0.5, -0.25, context())).toEqual({ x: 4.5, z: 3.75 });
  });

  test("keeps the axis the geometry resolver leaves open", () => {
    const wallOnX: GeometryStepResolver = (_from, _stepX, stepZ) => ({ stepX: 0, stepZ });
    expect(
      stepPlayer({ x: 4, z: 4 }, 0.5, 0.5, context({ resolveGeometryStep: wallOnX })),
    ).toEqual({ x: 4, z: 4.5 });
  });

  test("blocks a step into a structural column", () => {
    expect(stepPlayer({ x: 1.6, z: 0.5 }, -0.2, 0, context())).toEqual({ x: 1.6, z: 0.5 });
  });

  test("allows a step that stays clear of the column lattice", () => {
    expect(stepPlayer({ x: 2.5, z: 0.5 }, -0.4, 0, context())).toEqual({ x: 2.1, z: 0.5 });
  });

  test("blocks a step that overlaps another player", () => {
    const blocked = stepPlayer(
      { x: 2, z: 4 },
      -0.5,
      0,
      context({ otherPlayers: [{ x: 1.5, z: 4 }] }),
    );
    expect(blocked).toEqual({ x: 2, z: 4 });
  });

  test("allows a step that stops short of another player", () => {
    const next = stepPlayer({ x: 4, z: 4 }, -0.1, 0, context({ otherPlayers: [{ x: 2, z: 4 }] }));
    expect(next).toEqual({ x: 3.9, z: 4 });
  });
});
