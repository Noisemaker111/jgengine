import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../game.config";
import { content } from "./content";
import { DAY_LENGTH } from "./catalog";
import { cellFor, LOAN, park } from "./park";
import { accessOf } from "./build/links";
import { rideView } from "./rides";
import { session } from "./session";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
beforeEach(() => {
  const records = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  } });
});
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

/**
 * A scripted session through the player's own commands: pick a ride from the palette, click the
 * park, connect it, undo a hire, hire staff, research the mechanic and hire one, borrow from the
 * bank, and let the day run until guests ride and say what they think.
 */
test("a player builds and connects a ride, hires staff, researches the mechanic, borrows, and reads guest thoughts", () => {
  const runner = createHeadlessRunner({ definition: game.game, content, loop: game.game.loop, maxStepSeconds: 1 });
  runner.ui.invoke("park.start");
  runner.ctx.time.hydrate({ ...runner.ctx.time.snapshot(), now: DAY_LENGTH * 0.3, paused: false });
  const w = park.of(runner.ctx);

  /** Pick a blueprint, then click the first free spot on the lot: what the player does with the mouse. */
  const clickBuild = (kind: string): string => {
    runner.ui.invoke("build.select", { id: kind });
    expect(session.selectedTool).toBe(kind);
    for (let z = -50; z <= 50; z += 4) for (let x = -50; x <= 50; x += 4) {
      if (w.canPlace(kind, { cell: cellFor(kind, x, z) }) !== null) continue;
      const before = new Set(w.instances().map((i) => i.id));
      runner.ui.invoke("park.pointer", { point: [x, 0, z], entity: null, object: null });
      const placed = w.instances().find((i) => !before.has(i.id));
      if (placed !== undefined) return placed.id;
    }
    throw new Error(`no free spot for ${kind}`);
  };

  // A new ride starts shut until it has an entrance, an exit and a path; "Connect it" lays them.
  const carousel = clickBuild("ride_carousel");
  expect(w.fact(`${carousel}.closed`)).toBe(true);
  expect(accessOf(runner.ctx, carousel)?.open).toBe(false);
  runner.ui.invoke("build.connect", { id: carousel });
  expect(accessOf(runner.ctx, carousel)?.open).toBe(true);
  expect(w.fact(`${carousel}.closed`)).toBe(false);

  // Undo takes the last build back; the ride itself stays.
  const handyman = clickBuild("staff_janitor");
  expect(w.num("n.staff_janitor")).toBeGreaterThan(0);
  const hired = w.num("n.staff_janitor");
  runner.ui.invoke("build.undo");
  expect(w.num("n.staff_janitor")).toBe(hired - 1);
  expect(w.instance(handyman)).toBeNull();
  clickBuild("staff_janitor");
  clickBuild("staff_entertainer");
  expect(w.num("n.staff_entertainer")).toBe(1);

  // The mechanic is a lab topic: locked until its research finishes, then hired like the rest.
  expect(w.canPlace("staff_mechanic")?.reason).toBe("locked");
  runner.ui.invoke("brightway.act", { action: "research_staff_mechanic" });
  expect(w.orders("lab").length).toBe(1);
  for (let t = 0; t < 70; t += 0.5) runner.step(0.5);
  expect(w.canPlace("staff_mechanic")?.reason).not.toBe("locked");
  clickBuild("staff_mechanic");
  expect(w.num("n.staff_mechanic")).toBe(1);

  // The bank lends in $1,000 steps.
  const owed = w.num("park.loan_owed");
  runner.ui.invoke("brightway.act", { action: "take_loan" });
  expect(w.num("park.loan_owed")).toBe(owed + LOAN.step);

  for (let t = 0; t < 240; t += 0.5) runner.step(0.5);

  expect(session.guests.size).toBeGreaterThan(0);
  expect(rideView(carousel)!.cycles).toBeGreaterThan(0);
  const thinking = [...session.guests.values()].filter((g) => (g.thoughts ?? []).length > 0);
  expect(thinking.length).toBeGreaterThan(0);
  expect(thinking[0]!.thoughts![0]!.text.length).toBeGreaterThan(0);
  expect(session.thoughts.top.length).toBeGreaterThan(0);
}, 60_000);
