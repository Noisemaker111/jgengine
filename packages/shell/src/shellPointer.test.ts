import { describe, expect, test } from "bun:test";

import { pointerAimFor, pointerContextMenu } from "./shellPointer";

function ctxStub(options: {
  possession?: string | null;
  playerId?: string;
  entities?: Record<string, { id: string; name: string; position: readonly [number, number, number] }>;
  colliders?: readonly { halfExtents?: readonly [number, number, number] }[];
  objectCatalog?: Record<string, { verbs?: { label: string; command: string }[] }>;
}) {
  const playerId = options.playerId ?? "p1";
  const entities = options.entities ?? {};
  return {
    player: {
      userId: playerId,
      possession: {
        active: () => options.possession ?? playerId,
      },
    },
    scene: {
      entity: {
        get: (id: string) => entities[id] ?? null,
        collidersOf: () => options.colliders ?? [],
      },
      object: {
        catalog: (id: string) => options.objectCatalog?.[id],
      },
    },
  } as never;
}

describe("pointerAimFor", () => {
  test("returns undefined when the pointer has no world hit", () => {
    const service = { worldHit: () => null };
    const ctx = ctxStub({
      entities: { p1: { id: "p1", name: "hero", position: [0, 0, 0] } },
    });
    expect(pointerAimFor(ctx, service as never)).toBeUndefined();
  });

  test("returns undefined when neither possessed nor player entity exists", () => {
    const service = { worldHit: () => ({ point: [1, 0, 1] as const, entity: null, object: null }) };
    expect(pointerAimFor(ctxStub({}), service as never)).toBeUndefined();
  });

  test("aims from player eye height toward the hit point", () => {
    const service = { worldHit: () => ({ point: [10, 0, 0] as const, entity: null, object: null }) };
    const ctx = ctxStub({
      entities: { p1: { id: "p1", name: "hero", position: [0, 0, 0] } },
      colliders: [{ halfExtents: [0.3, 0.9, 0.3] }],
    });
    const aim = pointerAimFor(ctx, service as never);
    expect(aim).toBeDefined();
    expect(aim!.origin).toBeDefined();
    expect(aim!.direction).toBeDefined();
    expect(aim!.direction[0]).toBeGreaterThan(0.9);
  });
});

describe("pointerContextMenu", () => {
  test("builds an entity menu when the hit names an entity with verbs", () => {
    const ctx = ctxStub({
      entities: { e1: { id: "e1", name: "crate", position: [0, 0, 0] } },
    });
    const playable = {
      content: {
        entityById: (name: string) =>
          name === "crate" ? { verbs: [{ label: "Open", command: "open" }] } : undefined,
      },
    };
    const menu = pointerContextMenu(ctx, playable, {
      point: [1, 0, 1],
      entity: "e1",
      object: null,
    });
    expect(menu).not.toBeNull();
    expect(menu!.kind).toBe("entity");
    expect(menu!.targetId).toBe("e1");
    expect(menu!.verbs[0]?.command).toBe("open");
  });

  test("builds an object menu when the hit names an object with verbs", () => {
    const ctx = ctxStub({
      objectCatalog: { o1: { verbs: [{ label: "Take", command: "take" }] } },
    });
    const menu = pointerContextMenu(
      ctx,
      { content: {} },
      { point: [0, 0, 0], entity: null, object: "o1" },
    );
    expect(menu).not.toBeNull();
    expect(menu!.kind).toBe("object");
    expect(menu!.targetId).toBe("o1");
  });

  test("returns null for empty ground", () => {
    const menu = pointerContextMenu(
      ctxStub({}),
      { content: {} },
      { point: [0, 0, 0], entity: null, object: null },
    );
    expect(menu).toBeNull();
  });
});
