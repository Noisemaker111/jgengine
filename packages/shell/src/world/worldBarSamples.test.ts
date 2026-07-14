import { describe, expect, test } from "bun:test";

import {
  collectNameplateSamples,
  collectWorldBarSamples,
  type NameplateSample,
  type Projectable,
  type WorldBarSample,
} from "./worldBarSamples";

function makeCtx(
  entities: Array<{ id: string; name?: string; position: [number, number, number]; current?: number; max?: number }>,
) {
  return {
    player: { userId: "player" },
    scene: {
      entity: {
        list: () => entities.map((e) => ({ id: e.id, name: e.name ?? e.id, position: e.position })),
        get: (id: string) => {
          const found = entities.find((e) => e.id === id);
          return found === undefined ? null : { id: found.id, name: found.name ?? found.id, position: found.position };
        },
        stats: {
          get: (id: string, _statId: string) => {
            const found = entities.find((e) => e.id === id);
            if (found === undefined || found.current === undefined || found.max === undefined) return null;
            return { current: found.current, max: found.max, min: 0 };
          },
        },
      },
    },
  } as never;
}

function identityProject(): Projectable {
  return {
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
}

describe("collectWorldBarSamples", () => {
  test("collects non-player bars without per-entity portals", () => {
    const into: WorldBarSample[] = [];
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
      identityProject(),
    );
    expect(count).toBe(2);
    expect(into[0]?.percent).toBe(0.5);
    expect(into[1]?.percent).toBe(0);
    expect(into[0]?.x).toBe(400);
    expect(into[0]?.y).toBe(300);
  });
});

describe("collectNameplateSamples", () => {
  test("collects name + percent for non-player entities within range", () => {
    const into: NameplateSample[] = [];
    const count = collectNameplateSamples(
      makeCtx([
        { id: "player", name: "Hero", position: [0, 0, 0], current: 10, max: 10 },
        { id: "mob-a", name: "Wolf", position: [1, 0, 0], current: 5, max: 10 },
        { id: "npc-a", name: "Innkeeper", position: [2, 0, 0] },
        { id: "mob-far", name: "Distant Bear", position: [100, 0, 0], current: 10, max: 10 },
      ]),
      "health",
      2.3,
      undefined,
      undefined,
      { matrixWorldInverse: {}, projectionMatrix: {} },
      { width: 800, height: 600 },
      into,
      identityProject(),
      40,
    );
    expect(count).toBe(2);
    expect(into[0]).toMatchObject({ id: "mob-a", name: "Wolf", percent: 0.5 });
    expect(into[1]).toMatchObject({ id: "npc-a", name: "Innkeeper", percent: null });
    expect(into[0]?.x).toBe(400);
    expect(into[0]?.y).toBe(300);
  });

  test("respects role filtering", () => {
    const into: NameplateSample[] = [];
    const count = collectNameplateSamples(
      makeCtx([
        { id: "player", position: [0, 0, 0] },
        { id: "mob-a", position: [1, 0, 0], current: 5, max: 10 },
        { id: "npc-a", position: [2, 0, 0], current: 10, max: 10 },
      ]),
      "health",
      2.3,
      ["enemy"],
      (entity) => (entity.id === "mob-a" ? "enemy" : "npc"),
      { matrixWorldInverse: {}, projectionMatrix: {} },
      { width: 800, height: 600 },
      into,
      identityProject(),
    );
    expect(count).toBe(1);
    expect(into[0]?.id).toBe("mob-a");
  });
});
