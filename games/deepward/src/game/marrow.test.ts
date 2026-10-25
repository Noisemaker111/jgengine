import { describe, expect, test } from "bun:test";
import { createWorldModel } from "@jgengine/core/worldModel/worldModel";
import { marrowSpec } from "./marrow";

function base(growbedKnown = false) {
  return createWorldModel(marrowSpec.def, { live: () => ({ "live.growbedKnown": growbedKnown, "live.home": true }) });
}
function built(world: ReturnType<typeof base>, kind: string, slot: string) {
  const result = world.place(kind, { slot }, { free: true, built: true });
  expect(result.ok).toBe(true);
}

describe("Marrow base", () => {
  test("power is what generators make minus what modules draw, and nothing runs below zero", () => {
    const world = base();
    expect(world.num("marrow.power")).toBe(0);
    built(world, "still", "bay-1");
    expect(world.num("marrow.power")).toBe(-1);
    const water = world.num("marrow.water");
    world.tick(160);
    expect(world.num("marrow.water")).toBe(water);
    built(world, "generator", "bay-2");
    expect(world.num("marrow.power")).toBe(2);
    world.tick(160);
    expect(world.num("marrow.water")).toBeCloseTo(water + 2, 5);
  });

  test("the galley fills to its cap and no further", () => {
    const world = base();
    built(world, "generator", "bay-1");
    built(world, "still", "bay-2");
    for (let i = 0; i < 20; i++) world.tick(100);
    expect(world.num("marrow.water")).toBe(12);
  });

  test("a growbed needs its scanned blueprint", () => {
    expect(base(false).canPlace("growbed", { slot: "bay-1" }, { free: true })?.message).toContain("seed tray");
    expect(base(true).canPlace("growbed", { slot: "bay-1" }, { free: true })).toBeNull();
  });

  test("a powered mast raises the story signal once, and Halloway's line follows the facts", () => {
    const world = base();
    built(world, "mast", "bay-1");
    world.tick(1);
    expect(world.fact("story.signal")).toBe(false);
    built(world, "generator", "bay-2");
    world.tick(1);
    expect(world.fact("story.signal")).toBe(true);
    expect(world.says("halloway").at(-1)).toContain("Printer Zero");
    expect(world.log().at(-1)?.text).toContain("Printer Zero");
  });

  test("a bay holds one module, and building takes time unless placed built", () => {
    const world = base();
    expect(world.place("generator", { slot: "bay-1" }, { free: true }).ok).toBe(true);
    expect(world.canPlace("still", { slot: "bay-1" }, { free: true })?.reason).toBe("taken");
    expect(world.num("marrow.power")).toBe(0);
    world.tick(7);
    expect(world.num("marrow.power")).toBe(3);
  });

  test("state round-trips through snapshot and restore", () => {
    const world = base();
    built(world, "generator", "bay-1");
    const saved = JSON.parse(JSON.stringify(world.snapshot()));
    const again = base();
    again.restore(saved);
    expect(again.num("marrow.power")).toBe(3);
    expect(again.instances().map(instance => instance.kind)).toEqual(["generator"]);
  });
});
