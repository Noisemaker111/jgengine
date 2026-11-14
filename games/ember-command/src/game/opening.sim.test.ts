import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { physics, world } from "../world";
import { content } from "./content";
import { onInit } from "../loop";
import { resetSession, session } from "./session";
import { systems } from "./systems";

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
});
