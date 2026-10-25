import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "../content";
import { STARTING_LIVES } from "../entities/base/catalog";
import { keep } from "../keep";
import { setupWorld } from "./setup";

/** Boot a real headless context and wire the defense (opens the keep's world, spawns the keep, subscribes kills). */
function boot(): GameContext {
  const definition = defineGameDefinition({ name: "BeaconBastionPhaseTest", multiplayer: "off" });
  const ctx = createGameContext({ definition, content, player: { userId: "p1", isNew: true } });
  setupWorld(ctx);
  // The loop mirrors this after setupWorld; assert both the boot phase and the terminal transition.
  return ctx;
}

describe("beacon-bastion run phase", () => {
  test("the keep falling ends the run — game over reads as ended (dock off)", () => {
    const ctx = boot();
    expect(keep.of(ctx).fact("keep.fallen")).toBe(false);
    for (let leak = 0; leak < STARTING_LIVES - 1; leak += 1) keep.emit(ctx, { kind: "leak" });
    expect(gamePhase(ctx)).not.toBe("ended");
    keep.emit(ctx, { kind: "leak" });
    expect(keep.of(ctx).fact("keep.fallen")).toBe(true);
    expect(gamePhase(ctx)).toBe("ended");
  });
});
