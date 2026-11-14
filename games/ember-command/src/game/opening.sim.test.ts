import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { physics, world } from "../world";
import { content } from "./content";
import { onInit } from "../loop";
import { resetSession, session } from "./session";
import { systems } from "./systems";
import { createHazardState, MOWER_FIRST, MOWER_WARNING, NO_HAZARDS } from "./hazards";
import { YARD } from "./yardInstance";

/**
 * The opening of the first mission, played headless with every system running and no orders given:
 * the standing black raid reaches the nest around the half-minute, and the colony's soldiers and
 * Marshal must meet it on their own rather than stand and watch.
 */
function opening() {
  resetSession();
  const definition = defineGameDefinition({ name: "LawnOrderOpening", multiplayer: "off", world, physics, systems, loop: { onInit, onNewPlayer() {} } });
  const runner = createHeadlessRunner({ definition, content, loop: definition.loop! });
  runner.ctx.game.commands.run("match.start", {});
  return runner;
}

function alive(prefix: string, faction: "player" | "enemy"): number {
  let n = 0;
  for (const unit of session.units.values()) if (unit.faction === faction && unit.catalogId.startsWith(prefix)) n += 1;
  return n;
}

describe("the opening raid", () => {
  test("the idle colony beats the standing black raid at its nest", () => {
    const runner = opening();
    for (let t = 0; t < 70; t += 0.1) runner.step(0.1);
    const report = {
      hero: session.units.has("hero"),
      soldiers: alive("soldier", "player"),
      workers: alive("worker", "player"),
    };
    expect(report).toMatchObject({ hero: true });
    expect(report.soldiers).toBeGreaterThanOrEqual(3);
    expect([...session.units.keys()].filter((id) => id.startsWith("raider_raid") || id.startsWith("major_raid"))).toEqual([]);
  }, 60_000);

  test("in the free skirmish the black colony raises a forward camp and its raids start marching", () => {
    resetSession();
    const definition = defineGameDefinition({ name: "LawnOrderSkirmish", multiplayer: "off", world, physics, systems, loop: { onInit, onNewPlayer() {} } });
    const runner = createHeadlessRunner({ definition, content, loop: definition.loop! });
    runner.ctx.game.commands.run("match.skirmish", {});
    for (let t = 0; t < 130; t += 0.1) runner.step(0.1);
    expect(session.enemyWave.campId).not.toBeNull();
    expect(session.enemyWave.sent).toBeGreaterThanOrEqual(1);
  }, 60_000);

  test("idle red ants walk out of the mower's lane when it roars; black ants do too", () => {
    const runner = opening();
    const lane = YARD.mowerLane!;
    runner.ctx.scene.entity.setPose("soldier_1", { position: [0, 0, lane.from.z] });
    session.hazards = createHazardState({ ...NO_HAZARDS, mower: true });
    session.hazards.t = MOWER_FIRST - MOWER_WARNING - 0.5;
    session.hazards.mower.nextAt = MOWER_FIRST;
    for (let t = 0; t < 4; t += 0.1) runner.step(0.1);
    const at = runner.ctx.scene.entity.get("soldier_1")?.position;
    expect(at).toBeDefined();
    expect(Math.abs(at![2] - lane.from.z)).toBeGreaterThan(lane.halfWidth);
  }, 60_000);
});
