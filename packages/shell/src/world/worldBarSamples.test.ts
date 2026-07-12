import { describe, expect, test } from "bun:test";

import { collectWorldBarSamples, type Projectable, type WorldBarSample } from "./worldBarSamples";

function makeCtx(entities: Array<{ id: string; position: [number, number, number]; current: number; max: number }>) {
  return {
    player: { userId: "player" },
    scene: {
      entity: {
        list: () => entities.map((e) => ({ id: e.id, position: e.position })),
        get: (id: string) => {
          const found = entities.find((e) => e.id === id);
          return found === undefined ? null : { id: found.id, position: found.position };
        },
        stats: {
          get: (id: string, _statId: string) => {
            const found = entities.find((e) => e.id === id);
            if (found === undefined) return null;
            return { current: found.current, max: found.max, min: 0 };
          },
        },
      },
    },
  } as never;
}

describe("collectWorldBarSamples", () => {
  test("collects non-player bars without per-entity portals", () => {
    const into: WorldBarSample[] = [];
    const project: Projectable = {
      x: 0,
      y: 0,
      z: 0,
      set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
      },
      project() {
        this.x = 0;
        this.y = 0;
        this.z = 0;
        return this;
      },
    };
    const count = collectWorldBarSamples(
      makeCtx([
        { id: "player", position: [0, 0, 0], current: 10, max: 10 },
        { id: "mob-a", position: [1, 0, 0], current: 5, max: 10 },
        { id: "mob-b", position: [2, 0, 0], current: 0, max: 10 },
      ]),
      "health",
      2.2,
      undefined,
      undefined,
      { matrixWorldInverse: {}, projectionMatrix: {} },
      { width: 800, height: 600 },
      into,
      project,
    );
    expect(count).toBe(2);
    expect(into[0]?.percent).toBe(0.5);
    expect(into[1]?.percent).toBe(0);
    expect(into[0]?.x).toBe(400);
    expect(into[0]?.y).toBe(300);
  });
});
