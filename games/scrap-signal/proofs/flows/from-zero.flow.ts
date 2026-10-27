import { defineFlow, type Flow } from "@jgengine/core/play/flow";

import { game } from "../../src/game.config";
import { characterById } from "../../src/game/characters";
import { WAYPOINT_KINDS } from "../../src/game/progression/probe";

/**
 * A new game played like a first-time player reading the HUD: follow the quest marker, press E on
 * whoever or whatever it points at, shoot what it marks, take a dropped gun when it hits harder, and
 * spend each skill point when one comes. Keys, the camera and the skill tree's own button only.
 */
const PLAY_SECONDS = 10.5 * 60;
const STEP_MS = 400;
const FIGHT_RANGE = 14;
const kind = (name: (typeof WAYPOINT_KINDS)[number]): number => WAYPOINT_KINDS.indexOf(name);

/** The skill tree's nodes in the order this player buys them: the first tier of every branch, then deeper. */
const GUNK = characterById("gunk");
const SKILL_ORDER = GUNK === undefined ? [] : [...GUNK.nodes].sort((a, b) => (a.requiresPointsInBranch ?? 0) - (b.requiresPointsInBranch ?? 0)).map((node) => node.id);

interface At {
  playerX: number;
  playerZ: number;
}

function yawTo(p: At, x: number, z: number): number {
  return Math.atan2(x - p.playerX, z - p.playerZ);
}

function distance(p: At, x: number, z: number): number {
  return Math.hypot(x - p.playerX, z - p.playerZ);
}

interface Stuck {
  at: readonly [number, number];
  count: number;
}

/** Walk toward a point for one step, sidestepping when the last two steps went nowhere. */
async function stepToward<R extends At & Readonly<Record<string, number>>>(f: Flow<R>, p: R, x: number, z: number, stuck: Stuck): Promise<void> {
  const moved = Math.hypot(p.playerX - stuck.at[0], p.playerZ - stuck.at[1]);
  stuck.count = moved < 0.4 ? stuck.count + 1 : 0;
  stuck.at = [p.playerX, p.playerZ];
  if (stuck.count >= 2) {
    await f.heading(yawTo(p, x, z) + (Math.PI / 2) * (stuck.count % 4 < 2 ? 1 : -1));
    await f.hold(["KeyW"], { ms: 900 });
    return;
  }
  await f.heading(yawTo(p, x, z));
  await f.hold(distance(p, x, z) > 30 ? ["ShiftLeft", "KeyW"] : ["KeyW"], { ms: STEP_MS });
}

export default defineFlow(game, {
  async run(f) {
    const start = await f.expect((p) => p.gunsHeld === 0 && p.questsSeen === 0, "a new game starts unarmed with no quest");
    const stuck: Stuck = { at: [start.playerX, start.playerZ], count: 0 };
    let shots = 0;
    for (;;) {
      const p = await f.probe();
      if (p.playSeconds - start.playSeconds >= PLAY_SECONDS) break;

      if (p.skillPoints > 0 && p.level >= 2) {
        await f.press("KeyK");
        // Spread the points: start the search one node further along for every point already spent.
        for (let index = 0; index < SKILL_ORDER.length; index += 1) {
          const nodeId = SKILL_ORDER[(p.skillsLearned + index) % SKILL_ORDER.length];
          await f.command("talent.spend", { nodeId });
          if ((await f.probe()).skillsLearned > p.skillsLearned) break;
        }
        await f.press("KeyK");
        continue;
      }

      const fighting = p.goalKind === kind("enemy") && p.goalDistance <= FIGHT_RANGE * 1.5;
      if (p.lootDistance >= 0 && !fighting) {
        if (p.lootDistance > 1.8) await stepToward(f, p, p.lootX, p.lootZ, stuck);
        else {
          if (p.lootDistance > 0.35) await f.heading(yawTo(p, p.lootX, p.lootZ));
          await f.press("KeyE");
        }
        continue;
      }

      if (p.goalKind < 0) {
        await f.wait(STEP_MS);
        continue;
      }
      const near = distance(p, p.goalX, p.goalZ);
      if (p.goalKind === kind("enemy")) {
        if (near > FIGHT_RANGE) {
          await stepToward(f, p, p.goalX, p.goalZ, stuck);
          continue;
        }
        await f.heading(yawTo(p, p.goalX, p.goalZ));
        await f.hold(["mouse0"], { ms: STEP_MS });
        shots += 1;
        if (shots % 6 === 0) await f.press("KeyR");
        continue;
      }
      const reach = p.goalKind === kind("place") ? 4 : 2.2;
      if (near > reach) {
        await stepToward(f, p, p.goalX, p.goalZ, stuck);
        continue;
      }
      await f.heading(yawTo(p, p.goalX, p.goalZ));
      await f.press("KeyE");
      // Talking opens the offer; a second E takes the job.
      if (p.goalKind === kind("npc") && (await f.probe()).dialogOpen === 1) await f.press("KeyE");
    }
    await f.expect((p) => p.questsDone >= 4 && p.zonesSeen >= 2, "ten minutes in: the crash-site quests are done and the road out was walked");
  },
});
