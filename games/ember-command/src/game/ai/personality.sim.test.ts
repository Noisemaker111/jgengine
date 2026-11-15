import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { physics, world } from "../../world";
import { content } from "../content";
import { onInit } from "../../loop";
import { resetSession, session } from "../session";
import { systems } from "../systems";
import { PERSONALITIES, SKIRMISH_PERSONALITIES, marchPlanFor, rivalStore, type PersonalityId } from "./personality";

function skirmish(rival: PersonalityId | "roll") {
  resetSession();
  const definition = defineGameDefinition({ name: `LawnOrderRival_${rival}`, multiplayer: "off", world, physics, systems, loop: { onInit, onNewPlayer() {} } });
  const runner = createHeadlessRunner({ definition, content, loop: definition.loop! });
  runner.ctx.game.commands.run("match.skirmish", { rival });
  return runner;
}

/** Step a battle, collecting the catalog ids of every black unit that appears after the opening. */
function run(runner: ReturnType<typeof skirmish>, seconds: number): Set<string> {
  const standing = new Set(session.units.keys());
  const kinds = new Set<string>();
  for (let t = 0; t < seconds; t += 0.1) {
    runner.step(0.1);
    for (const unit of session.units.values()) {
      if (unit.faction === "enemy" && unit.kind === "unit" && !standing.has(unit.id) && !unit.id.startsWith("wasp_nest_s")) kinds.add(unit.catalogId);
    }
  }
  return kinds;
}

describe("skirmish rivals", () => {
  test("each personality is a distinct rhythm and raid book", () => {
    const intervals = new Set(SKIRMISH_PERSONALITIES.map((id) => PERSONALITIES[id].interval));
    expect(intervals.size).toBe(SKIRMISH_PERSONALITIES.length);
    for (const id of SKIRMISH_PERSONALITIES) {
      expect(PERSONALITIES[id].waves.waves.length).toBeGreaterThan(2);
      // One plan object per personality, so the plan clock never sees a different definition mid-battle.
      expect(marchPlanFor(PERSONALITIES[id])).toBe(marchPlanFor(PERSONALITIES[id]));
    }
  });

  test("a skirmish meets the rival picked, and the title sheet remembers it", () => {
    const runner = skirmish("diggers");
    expect(session.enemyWave.personality).toBe("diggers");
    expect(rivalStore.read(runner.ctx)).toBe("diggers");
  });

  test("a rolled rival is one of the three skirmish personalities", () => {
    skirmish("roll");
    expect(SKIRMISH_PERSONALITIES).toContain(session.enemyWave.personality);
  });

  test("the swarm marches raiders only, and sooner than the diggers' majors", () => {
    const swarm = skirmish("swarm");
    const swarmKinds = run(swarm, 170);
    const swarmSent = session.enemyWave.sent;
    expect(swarmSent).toBeGreaterThanOrEqual(2);
    expect([...swarmKinds].every((kind) => kind === "raider")).toBe(true);

    const diggers = skirmish("diggers");
    const diggerKinds = run(diggers, 170);
    expect(session.enemyWave.sent).toBeLessThan(swarmSent);
    expect(diggerKinds.has("major")).toBe(true);
  }, 120_000);

  test("the wasp-friends' nest sorties sooner than the classic colony's", () => {
    skirmish("wasp-friends");
    expect(PERSONALITIES["wasp-friends"].waspTempo).toBeLessThan(PERSONALITIES.classic.waspTempo);
    expect(PERSONALITIES["wasp-friends"].target).toBe("foragers");
  });
});
