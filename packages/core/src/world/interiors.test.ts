import { describe, expect, test } from "bun:test";

import { createInteriors, type EntityLocation, type Interior } from "./interiors";

const shop: Interior = {
  id: "shop",
  origin: [20, 0],
  bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
};

describe("interiors", () => {
  test("converts between exterior and interior frames symmetrically", () => {
    const world = createInteriors({ interiors: [shop] });
    expect(world.toInterior("shop", [20, 0])).toEqual([0, 0]);
    expect(world.toExterior("shop", [0, 0])).toEqual([20, 0]);
    expect(world.toInterior("missing", [0, 0])).toBeNull();
  });

  test("rotation carries through the conversion round-trip", () => {
    const world = createInteriors({ interiors: [{ ...shop, rotation: Math.PI / 2 }] });
    const exterior = world.toExterior("shop", [1, 0])!;
    const back = world.toInterior("shop", exterior)!;
    expect(back[0]).toBeCloseTo(1);
    expect(back[1]).toBeCloseTo(0);
  });

  test("enter reframes an exterior location into the interior frame", () => {
    const world = createInteriors({ interiors: [shop] });
    const at: EntityLocation = { space: { kind: "exterior" }, position: [21, 0] };
    expect(world.enter(at, "shop")).toEqual({ space: { kind: "interior", id: "shop" }, position: [1, 0] });
  });

  test("enter refuses an unknown interior or a non-exterior origin", () => {
    const world = createInteriors({ interiors: [shop] });
    expect(world.enter({ space: { kind: "exterior" }, position: [0, 0] }, "missing")).toBeNull();
    expect(world.enter({ space: { kind: "interior", id: "shop" }, position: [0, 0] }, "shop")).toBeNull();
  });

  test("leave reframes an interior location back into the exterior", () => {
    const world = createInteriors({ interiors: [shop] });
    const inside: EntityLocation = { space: { kind: "interior", id: "shop" }, position: [1, 0] };
    expect(world.leave(inside)).toEqual({ space: { kind: "exterior" }, position: [21, 0] });
    expect(world.leave({ space: { kind: "exterior" }, position: [0, 0] })).toBeNull();
  });

  test("move resolves collision in the exterior without changing space", () => {
    const world = createInteriors({
      exterior: { obstacles: [{ minX: 10, maxX: 12, minZ: -5, maxZ: 5 }] },
      interiors: [shop],
    });
    const start: EntityLocation = { space: { kind: "exterior" }, position: [8, 0] };
    const result = world.move(start, [10, 0]);
    expect(result.space).toEqual({ kind: "exterior" });
    expect(result.position[0]).toBe(10);
  });

  test("move keeps an entity within the interior bounds and never auto-transitions", () => {
    const world = createInteriors({ interiors: [shop] });
    const inside: EntityLocation = { space: { kind: "interior", id: "shop" }, position: [0, 0] };
    const result = world.move(inside, [100, 0]);
    expect(result.space).toEqual({ kind: "interior", id: "shop" });
    expect(result.position[0]).toBe(5);
  });

  test("move leaves an unknown interior location untouched", () => {
    const world = createInteriors({ interiors: [shop] });
    const ghost: EntityLocation = { space: { kind: "interior", id: "missing" }, position: [3, 3] };
    expect(world.move(ghost, [1, 1])).toBe(ghost);
  });
});
