import { expect, test } from "bun:test";

import { createPhaseSchedule, createStatGraph } from "../parts";

/**
 * @recipe Growth stages
 * Phases the game names, each applying its own Modifiers source to size and strength as it begins.
 */
test("growth stages", () => {
  const stages = createPhaseSchedule({
    phases: [{ state: "hatchling", durationSeconds: 100 }, { state: "juvenile", durationSeconds: 300 }, { state: "adult" }],
  });
  const body = createStatGraph({ inputs: [{ id: "size", base: 1 }, { id: "strength", base: 2 }] }).create();
  const scale = { hatchling: 0.25, juvenile: 0.6, adult: 1 };
  const grow = (dt: number) => {
    for (const t of stages.tick(dt)) body.addSource("stage", { size: { source: t.to, op: "mul", value: scale[t.to] } });
  };

  grow(100);
  expect(stages.state()).toBe("juvenile");
  expect(body.get("size")).toBe(0.6);
  grow(300);
  expect(stages.state()).toBe("adult");
  expect(body.get("size")).toBe(1);
});
