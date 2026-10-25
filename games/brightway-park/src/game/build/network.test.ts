import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../../game.config";
import { content } from "../content";
import { DAY_LENGTH } from "../catalog";
import { BUILDABLES } from "../objects/catalog";
import { cellFor, park } from "../park";
import { session } from "../session";
import { accessOf } from "./links";
import { cellCentre, levelAt, LAND_COST } from "./terrain";
import { clearUndo } from "./undo";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
beforeEach(() => {
  const records = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  } });
  clearUndo();
});
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

function openPark() {
  const runner = createHeadlessRunner({ definition: game.game, content, loop: game.game.loop, maxStepSeconds: 1 });
  runner.ui.invoke("park.start");
  runner.ctx.time.hydrate({ ...runner.ctx.time.snapshot(), now: DAY_LENGTH * 0.3, paused: false });
  return { runner, w: park.of(runner.ctx) };
}

const newest = (w: ReturnType<typeof openPark>["w"], kind: string) => w.instances(kind).at(-1)!.id;

describe("paths, entrances and exits", () => {
  test("the starter park opens joined up: every ride has an entrance and an exit on the paths", () => {
    const { runner, w } = openPark();
    expect(w.instances("ride_entrance").length).toBe(2);
    expect(w.instances("ride_exit").length).toBe(2);
    for (const instance of w.instances()) {
      const def = BUILDABLES[instance.kind]!;
      if (def.ride === undefined && def.stall === undefined) continue;
      expect(accessOf(runner.ctx, instance.id)?.open).toBe(true);
      expect(w.fact(`${instance.id}.closed`)).toBe(false);
    }
  });

  test("a ride off the paths stays shut, draws no one, then opens once it is connected", () => {
    const { runner, w } = openPark();
    const open = w.num("park.rides_open");
    const appeal = w.num("appeal.ride_carousel");
    runner.ctx.game.commands.run("brightway.place", { kind: "ride_carousel", cell: cellFor("ride_carousel", -40, -40) });
    const ride = newest(w, "ride_carousel");
    expect(accessOf(runner.ctx, ride)?.reason).toBe("Needs an entrance");
    expect(w.fact(`${ride}.closed`)).toBe(true);
    expect(w.num("park.rides_open")).toBe(open);
    expect(w.num("appeal.ride_carousel")).toBe(appeal);
    for (let t = 0; t < 30; t += 1) runner.step(1);
    for (const guest of session.guests.values()) expect(guest.targetId).not.toBe(ride);

    const cash = w.num("park.cash");
    runner.ui.invoke("build.connect", { id: ride });
    expect(w.fact(`${ride}.closed`)).toBe(false);
    expect(accessOf(runner.ctx, ride)?.door).not.toBeNull();
    expect(w.num("park.rides_open")).toBe(open + 1);
    expect(w.num("park.cash")).toBeLessThan(cash - BUILDABLES.ride_entrance!.cost - BUILDABLES.ride_exit!.cost + 1);
  });

  test("an entrance has to stand against a ride", () => {
    const { runner, w } = openPark();
    const before = w.instances("ride_entrance").length;
    runner.ui.invoke("build.select", { id: "ride_entrance" });
    runner.ui.invoke("park.pointer", { point: [-40, 0, -40], entity: null, object: null });
    expect(w.instances("ride_entrance").length).toBe(before);
  });

  test("a dragged path lays a whole line as one build, and undo takes it all back at full price", () => {
    const { runner, w } = openPark();
    const before = w.instances("path_walk").length;
    const cash = w.num("park.cash");
    runner.ui.invoke("build.select", { id: "path_walk" });
    runner.ui.invoke("build.dragFrom", { point: [-48, -48] });
    runner.ui.invoke("park.pointer", { point: [-32, 0, -40], entity: null, object: null });
    // An L from (-48,-48) along x to -32, then down to -40: 5 + 2 cells.
    expect(w.instances("path_walk").length).toBe(before + 7);
    expect(w.num("park.cash")).toBeCloseTo(cash - 70, 0);
    runner.ui.invoke("build.undo");
    expect(w.instances("path_walk").length).toBe(before);
    expect(w.num("park.cash")).toBeCloseTo(cash, 0);
  });

  test("demolish refunds part; undo puts it back where it stood and takes the refund back", () => {
    const { runner, w } = openPark();
    const stall = w.instances("stall_food")[0]!;
    const cash = w.num("park.cash");
    runner.ui.invoke("build.demolish", { id: stall.id });
    expect(w.instances("stall_food").length).toBe(1);
    expect(w.num("park.cash")).toBeGreaterThan(cash);
    runner.ui.invoke("build.undo");
    expect(w.instances("stall_food").length).toBe(2);
    expect(w.instances("stall_food").some((instance) => instance.cell?.join() === stall.cell?.join())).toBe(true);
    expect(w.num("park.cash")).toBeCloseTo(cash, 0);
  });
});

describe("the land", () => {
  test("raise an area, refuse a ride on uneven ground, undo puts the ground back", () => {
    const { runner, w } = openPark();
    const cash = w.num("park.cash");
    const [x0, z0] = cellCentre(2, 2);
    const [x1, z1] = cellCentre(3, 3);
    runner.ui.invoke("build.line", { kind: "land_raise", from: [x0, z0], to: [x1, z1] });
    expect(levelAt(w, 2, 2)).toBe(1);
    expect(levelAt(w, 3, 3)).toBe(1);
    expect(levelAt(w, 4, 4)).toBe(0);
    expect(w.num("park.cash")).toBeCloseTo(cash - 4 * LAND_COST, 0);

    // A 2x2 carousel straddling raised and flat ground is refused with the reason.
    const rides = w.instances("ride_carousel").length;
    runner.ui.invoke("build.select", { id: "ride_carousel" });
    runner.ui.invoke("park.pointer", { point: [x1, 0, z1], entity: null, object: null });
    expect(w.instances("ride_carousel").length).toBe(rides);
    expect(runner.ctx.game.notices.list().at(-1)?.text).toContain("level");

    runner.ui.invoke("build.undo");
    expect(levelAt(w, 2, 2)).toBe(0);
    expect(w.num("park.cash")).toBeCloseTo(cash, 0);
  });

  test("ground with something built on it can't move", () => {
    const { runner, w } = openPark();
    const path = w.instances("path_walk")[0]!;
    const [x, z] = cellCentre(path.cell![0], path.cell![1]);
    runner.ui.invoke("build.line", { kind: "land_raise", from: [x, z], to: [x, z] });
    expect(levelAt(w, path.cell![0], path.cell![1])).toBe(0);
  });
});
