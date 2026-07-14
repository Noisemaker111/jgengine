import { describe, expect, test } from "bun:test";
import { defineGame } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { content } from "./content";
import { keybinds } from "./keybinds";
import { onNewPlayer, onTick } from "../loop";
import { runStore } from "./race/run";
import { COURSE_ORDER } from "./race/courses";
import { world } from "../world";

const COURSE_KEY_ACTION = { short: "courseShort", technical: "courseTechnical", endurance: "courseEndurance" } as const;

const STEP = 1 / 60;

function boot(): GameContext {
  const ctx = createGameContext({
    definition: defineGame({ name: "DroneDerbyTest", assets: createAssetCatalog(), multiplayer: "off", world, input: keybinds }),
    content,
    player: { userId: "p1", isNew: true },
  });
  onNewPlayer(ctx);
  return ctx;
}

function tickWithHeld(ctx: GameContext, held: readonly string[], dt: number = STEP): void {
  ctx.input.publish(held);
  onTick(ctx, dt);
}

describe("drone-derby loop — boot and menu", () => {
  test("onNewPlayer resets the run store to a fresh menu state and spawns the drone", () => {
    const ctx = boot();
    expect(runStore.read(ctx).phase).toBe("menu");
    expect(runStore.read(ctx).attempts).toBe(0);
    const drone = ctx.scene.entity.get("p1");
    expect(drone).not.toBeNull();
    expect(drone?.position[1]).toBeGreaterThan(0);
  });

  test("pressing startRace moves the run through countdown into flying", () => {
    const ctx = boot();
    tickWithHeld(ctx, ["startRace"]);
    expect(runStore.read(ctx).phase).toBe("countdown");
    tickWithHeld(ctx, [], 5);
    expect(runStore.read(ctx).phase).toBe("flying");
  });
});

describe("drone-derby loop — flight and battery", () => {
  test("holding throttle and boost drains the battery over time", () => {
    const ctx = boot();
    tickWithHeld(ctx, ["startRace"]);
    tickWithHeld(ctx, [], 5);
    expect(runStore.read(ctx).phase).toBe("flying");

    const startCells = runStore.read(ctx).telemetry.batteryCells;
    for (let i = 0; i < 120; i += 1) tickWithHeld(ctx, ["throttleUp", "boost"]);
    const afterCells = runStore.read(ctx).telemetry.batteryCells;
    expect(afterCells).toBeLessThan(startCells);
  });

  test("the drone entity pose advances away from the spawn point while flying", () => {
    const ctx = boot();
    tickWithHeld(ctx, ["startRace"]);
    tickWithHeld(ctx, [], 5);
    const spawnPosition = ctx.scene.entity.get("p1")!.position;
    for (let i = 0; i < 90; i += 1) tickWithHeld(ctx, ["pitchForward"]);
    const flownPosition = ctx.scene.entity.get("p1")!.position;
    const moved = Math.hypot(flownPosition[0] - spawnPosition[0], flownPosition[2] - spawnPosition[2]);
    expect(moved).toBeGreaterThan(1);
  });
});

describe("drone-derby loop — restart purity", () => {
  test("restart resets ring progress and battery while incrementing the attempt count", () => {
    const ctx = boot();
    tickWithHeld(ctx, ["startRace"]);
    tickWithHeld(ctx, [], 5);
    for (let i = 0; i < 60; i += 1) tickWithHeld(ctx, ["throttleUp", "boost"]);

    const drainedCells = runStore.read(ctx).telemetry.batteryCells;
    expect(drainedCells).toBeLessThan(100);

    tickWithHeld(ctx, ["restart"]);
    const afterRestart = runStore.read(ctx);
    expect(afterRestart.phase).toBe("countdown");
    expect(afterRestart.attempts).toBe(2);
    expect(afterRestart.ringIndex).toBe(0);
    expect(afterRestart.elapsed).toBe(0);

    tickWithHeld(ctx, [], 5);
    expect(runStore.read(ctx).telemetry.batteryCells).toBeCloseTo(100, 0);
  });

  test("switching course from the menu resets attempts to zero", () => {
    const ctx = boot();
    tickWithHeld(ctx, ["courseEndurance"]);
    const state = runStore.read(ctx);
    expect(state.courseId).toBe("endurance");
    expect(state.attempts).toBe(0);
    expect(state.phase).toBe("menu");
  });

  test("course keys are ignored mid-flight so an accidental press cannot interrupt a run", () => {
    const ctx = boot();
    const startingCourse = runStore.read(ctx).courseId;
    tickWithHeld(ctx, ["startRace"]);
    tickWithHeld(ctx, [], 5);
    expect(runStore.read(ctx).phase).toBe("flying");

    const otherCourse = COURSE_ORDER.find((id) => id !== startingCourse)!;
    tickWithHeld(ctx, [COURSE_KEY_ACTION[otherCourse]]);
    expect(runStore.read(ctx).courseId).toBe(startingCourse);
    expect(runStore.read(ctx).phase).toBe("flying");
  });
});
