import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../game.config";
import { loop } from "../loop";
import { stageHousehold, stageReadout } from "./capture";
import { householdStore } from "./session/store";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function boot() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => undefined,
    },
  });
  const ctx = createGameContext({ definition: game.game, content: game.content, player: { userId: "orbit-stage", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  ctx.game.commands.run("orbit.new", {});
  return ctx;
}

describe("staged mid-shift capture", () => {
  test("the household is on its stations with paid work logged", () => {
    const ctx = boot();
    stageHousehold(ctx, "shift");
    const read = stageReadout(ctx);
    console.log("orbit readout", read);
    expect(read.working + read.walking).toBeGreaterThan(0);
    expect(read.working).toBeGreaterThan(0);
  });

  test("a staged week moves mastery and standing, and reproduces", () => {
    const first = boot();
    stageHousehold(first, "week");
    const state = householdStore.read(first);
    const fingerprint = `${state.day}:${state.credits.toFixed(2)}:${state.order.map((id) => `${state.members[id]?.completedShifts ?? 0}`).join(",")}`;
    let shifts = 0;
    for (const id of state.order) shifts += state.members[id]?.completedShifts ?? 0;
    expect(shifts).toBeGreaterThan(0);

    const second = boot();
    stageHousehold(second, "week");
    const next = householdStore.read(second);
    expect(`${next.day}:${next.credits.toFixed(2)}:${next.order.map((id) => `${next.members[id]?.completedShifts ?? 0}`).join(",")}`).toBe(fingerprint);
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });

  test("reproduces from a fresh boot", () => {
    const first = boot();
    stageHousehold(first, "shift");
    const read = stageReadout(first);
    const second = boot();
    stageHousehold(second, "shift");
    expect(stageReadout(second)).toEqual(read);
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
});
