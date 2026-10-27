import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../game.config";
import { forceBreakdown } from "./capture";
import { currentHint, hintsTaught } from "./onboarding";
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
  // The engine's onboarding checks the world on its own tick, so each step lands a moment later.
  const hint = () => { runner.step(0.2); return currentHint(runner.ctx); };
  // Free play has no hints.
  expect(hint()).toBeNull();
  run("park.scenario", { id: FIRST_SCENARIO });
  run("park.start");
  expect(hint()?.id).toBe("path");
  expect(hint()?.world).toEqual([0, 46]);
  expect(hintsTaught(runner.ctx)).toBe(0);

  run("build.line", { kind: "path_walk", from: [0, 48], to: [0, 32] });
  expect(hint()?.id).toBe("ride");

  expect(run("brightway.place", { kind: "ride_carousel", cell: cellFor("ride_carousel", 10, 38) }).status).toBe("applied");
  runner.step(1);
  const ride = w.instances("ride_carousel")[0]?.id ?? "";
  expect(hint()?.id).toBe("connect");
  // The arrow stands over the new ride.
  expect(hint()?.world).toEqual(w.instance(ride)?.position ?? null);

  run("build.connect", { id: ride });
  expect(hint()?.id).toBe("gate");
  run("brightway.act", { action: "open_gate" });
  expect(hint()?.id).toBe("research");
  run("brightway.act", { action: "research_stall_icecream" });
  expect(hint()?.id).toBe("mechanic");
  expect(hintsTaught(runner.ctx)).toBe(5);

  forceBreakdown(runner.ctx, ride);
  expect(hint()?.id).toBe("mechanic");
  expect(run("brightway.place", { kind: "staff_mechanic", cell: cellFor("staff_mechanic", -12, 36) }).status).toBe("applied");
  expect(hint()).toBeNull();
  expect(hintsTaught(runner.ctx)).toBe(6);

  // Starting the scenario again teaches from the first step.
  run("park.scenario", { id: FIRST_SCENARIO });
  expect(hint()?.id).toBe("path");
}, 30_000);

test("the hints keep up while the game is paused", () => {
  const runner = createHeadlessRunner({ game, maxStepSeconds: 1 });
  const run = (name: string, input: Record<string, unknown> = {}) => runner.ctx.game.commands.run(name, input);
  run("park.scenario", { id: FIRST_SCENARIO });
  run("park.start");
  runner.step(0.2);
  runner.ctx.time.pause();
  run("build.line", { kind: "path_walk", from: [0, 48], to: [0, 32] });
  runner.step(0.2);
  expect(currentHint(runner.ctx)?.id).toBe("ride");
}, 30_000);

test("Hide hints skips the rest", () => {
  const runner = createHeadlessRunner({ game, maxStepSeconds: 1 });
  const run = (name: string, input: Record<string, unknown> = {}) => runner.ctx.game.commands.run(name, input);
  run("park.scenario", { id: FIRST_SCENARIO });
  run("park.start");
  runner.step(0.2);
  expect(currentHint(runner.ctx)?.id).toBe("path");
  run("onboarding.skip");
  runner.step(0.2);
  expect(currentHint(runner.ctx)).toBeNull();
}, 30_000);
