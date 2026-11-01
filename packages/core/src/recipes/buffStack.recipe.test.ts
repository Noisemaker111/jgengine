import { expect, test } from "bun:test";

import { createStatGraph } from "../parts";
import { tickCooldown } from "../time/cooldown";

/**
 * @recipe Buff stack
 * Modifiers stack named add and multiply sources on a stat, and a plain countdown removes a buff when it runs out.
 */
test("buff stack", () => {
  const sheet = createStatGraph({ inputs: [{ id: "speed", base: 10 }] }).create();
  const buffs = new Map([["haste", 5], ["boots", 60]]);
  sheet.addSource("boots", { speed: { source: "boots", op: "add", value: 2 } });
  sheet.addSource("haste", { speed: { source: "haste", op: "mul", value: 1.5 } });
  const tick = (dt: number) => {
    for (const [id, left] of buffs) {
      buffs.set(id, tickCooldown(left, dt));
      if (buffs.get(id) === 0) sheet.removeSource(id);
    }
  };

  expect(sheet.get("speed")).toBe(18);
  tick(5);
  expect(sheet.hasSource("haste")).toBe(false);
  expect(sheet.get("speed")).toBe(12);
  expect(sheet.explain("speed").steps.map((s) => s.source)).toContain("boots");
});
