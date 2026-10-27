import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../game.config";
import { forceBreakdown } from "./capture";
import { currentHint } from "./onboarding";
import { cellFor, park } from "./park";
import { FIRST_SCENARIO } from "./scenarios";

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

test("the first scenario's hints follow the player: path, ride, connect, gate, the lab, then a mechanic", () => {
  const runner = createHeadlessRunner({ game, maxStepSeconds: 1 });
  const run = (name: string, input: Record<string, unknown> = {}) => runner.ctx.game.commands.run(name, input);
  const w = park.of(runner.ctx);
  // Free play has no hints.
  expect(currentHint(w)).toBeNull();
  run("park.scenario", { id: FIRST_SCENARIO });
  run("park.start");
  expect(currentHint(w)?.id).toBe("path");
  expect(currentHint(w)?.world?.(w)).toEqual([0, 46]);

  run("build.line", { kind: "path_walk", from: [0, 48], to: [0, 32] });
  expect(currentHint(w)?.id).toBe("ride");

  expect(run("brightway.place", { kind: "ride_carousel", cell: cellFor("ride_carousel", 10, 38) }).status).toBe("applied");
  runner.step(1);
  const ride = w.instances("ride_carousel")[0]?.id ?? "";
  expect(currentHint(w)?.id).toBe("connect");
  // The arrow stands over the new ride.
  expect(currentHint(w)?.world?.(w)).toEqual(w.instance(ride)?.position ?? null);

  run("build.connect", { id: ride });
  expect(currentHint(w)?.id).toBe("gate");
  run("brightway.act", { action: "open_gate" });
  expect(currentHint(w)?.id).toBe("research");
  run("brightway.act", { action: "research_stall_icecream" });
  expect(currentHint(w)?.id).toBe("mechanic");

  forceBreakdown(runner.ctx, ride);
  expect(currentHint(w)?.id).toBe("mechanic");
  expect(run("brightway.place", { kind: "staff_mechanic", cell: cellFor("staff_mechanic", -12, 36) }).status).toBe("applied");
  expect(currentHint(w)).toBeNull();
}, 30_000);
