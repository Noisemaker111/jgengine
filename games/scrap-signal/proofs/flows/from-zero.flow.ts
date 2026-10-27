import { defineFlow, type Flow } from "@jgengine/core/play/flow";

import { game } from "../../src/game.config";
import { characterById } from "../../src/game/characters";
import { WAYPOINT_KINDS } from "../../src/game/progression/probe";

/**
 * A new game played like a first-time player reading the HUD: follow the quest marker, press E on
 * whoever or whatever it points at, shoot what it marks, take a dropped gun when it hits harder, and
 * spend each skill point when one comes. Keys, the camera, the skill tree's own button, and the fire
 * command with an aim up or down, which is what a mouse gives the trigger (the headless camera only turns).
 */
const PLAY_SECONDS = 10.5 * 60;
const STEP_MS = 400;
/** Pistol range: close enough that a wandering aim still lands most shots. */
const FIGHT_RANGE = 9;
/** Where the player's eye and a target's chest sit above their feet, for aiming up or down a slope. */
const EYE_HEIGHT = 1.62;
const TARGET_CHEST = 1.1;
/** Trigger pulls per fighting step: the fire command gates each gun to its own rate of fire. */
const PULLS_PER_STEP = 4;
/** A first-time player reads what an NPC says at about 20 characters a second, a few seconds at least. */
const READ_CHARS_PER_SECOND = 20;
const MIN_READ_MS = 2000;
function readingMs(chars: number): number {
  return Math.max(MIN_READ_MS, (chars / READ_CHARS_PER_SECOND) * 1000);
}
/** Reading the skill tree the first time it opens, then finding the next node on later visits. */
const TREE_FIRST_LOOK_MS = 15_000;
const TREE_LOOK_MS = 4_000;
/** Reading a dropped gun's card against the gun in hand. */
const CARD_READ_MS = 2_500;
/**
 * A first-time player's aim wanders a few degrees off the target, so some shots miss. The wobble
 * follows the golden angle, so it is the same on every run and covers the whole spread.
 */
const AIM_WOBBLE = (6 * Math.PI) / 180;
const GOLDEN_ANGLE = 2.399963;
/** Close enough to a drop to stand on it, and the short steps that get there. */
const CLOSE_TO_LOOT = 4;
/** Inside the pickup prompt's radius. */
const PICKUP_REACH = 2.5;
const ON_LOOT = 0.45;
const NUDGE_MS = 60;
const MAX_NUDGES = 14;
const SLOT_KEYS =["Digit1", "Digit2", "Digit3", "Digit4"] as const;
const kind = (name:(typeof WAYPOINT_KINDS)[number]): number => WAYPOINT_KINDS.indexOf(name);

/** The skill tree's nodes in the order this player looks at them: the first tier of every branch, then deeper. */
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

interface Trigger {
  shots: number;
}

/** Aim the way a mouse does, up or down onto the target's chest, and pull the trigger for a step. */
async function shootAt<R extends At & { playerY: number } & Readonly<Record<string, number>>>(
  f: Flow<R>,
  p: R,
  target: { x: number; y: number; z: number },
  trigger: Trigger,
): Promise<void> {
  const onTarget = yawTo(p, target.x, target.z);
  const pitch = Math.atan2(target.y + TARGET_CHEST - (p.playerY + EYE_HEIGHT), Math.max(distance(p, target.x, target.z), 0.5));
  await f.heading(onTarget);
  for (let pull = 0; pull < PULLS_PER_STEP; pull += 1) {
    const n = (trigger.shots * PULLS_PER_STEP + pull) * GOLDEN_ANGLE;
    const yaw = onTarget + AIM_WOBBLE * Math.sin(n);
    const tilt = pitch + (AIM_WOBBLE / 2) * Math.cos(n * 1.7);
    await f.tryCommand("fire", { yaw, pitch: tilt, aim: { yaw, pitch: tilt } });
    await f.wait(STEP_MS / PULLS_PER_STEP);
  }
  trigger.shots += 1;
}

export default defineFlow(game, {
  async run(f) {
    const start = await f.expect((p) => p.gunsHeld === 0 && p.questsSeen === 0, "a new game starts unarmed with no quest");
    const stuck: Stuck = { at: [start.playerX, start.playerZ], count: 0 };
    const trigger: Trigger = { shots: 0 };
    let swaps = 0;
    let nudges = 0;
    for (;;) {
      const p = await f.probe();
      if (p.playSeconds - start.playSeconds >= PLAY_SECONDS) break;

      if (p.skillPoints > 0 && p.level >= 2) {
        await f.press("KeyK");
        // The first look at the tree reads its branches; later visits only find the next node.
        await f.wait(p.skillsLearned === 0 ? TREE_FIRST_LOOK_MS : TREE_LOOK_MS);
        // Like most players: max the first skill that takes a point, then the next.
        for (const nodeId of SKILL_ORDER) {
          await f.command("talent.spend", { nodeId });
          if ((await f.probe()).skillsLearned > p.skillsLearned) break;
        }
        await f.press("KeyK");
        continue;
      }

      // An empty gun: grab the ammo on the ground, or else switch to the next gun with rounds. With
      // every gun empty, the marker leads to an ammo crate.
      const dry = p.gunsHeld > 0 && p.heldAmmo === 0;
      if (dry && p.lootDistance < 0 && p.gunsWithAmmo > 0) {
        swaps += 1;
        await f.press(SLOT_KEYS[swaps % Math.min(p.gunsHeld, SLOT_KEYS.length)] ?? "Digit1");
        continue;
      }
      const fighting = p.goalKind === kind("enemy") && p.goalDistance <= FIGHT_RANGE * 1.5 && !dry;
      // A drop to take: one worth having in reach, or the gun the quest marker points at.
      const drop =
        p.lootDistance >= 0 && !fighting
          ? { x: p.lootX, z: p.lootZ, distance: p.lootDistance }
          : p.goalKind === kind("loot")
            ? { x: p.goalX, z: p.goalZ, distance: p.goalDistance }
            : null;
      if (drop !== null) {
        // Walk right onto the drop, then take it: what you stand on is what E picks up.
        // A full step covers several metres, so the last few go in short steps or it walks past.
        if (drop.distance > CLOSE_TO_LOOT) await stepToward(f, p, drop.x, drop.z, stuck);
        else if (drop.distance > ON_LOOT && nudges < MAX_NUDGES) {
          nudges += 1;
          await f.heading(yawTo(p, drop.x, drop.z));
          await f.hold(["KeyW"], { ms: NUDGE_MS });
        } else if (drop.distance > PICKUP_REACH) {
          // Short steps went nowhere: something is in the way, so walk round it.
          nudges = 0;
          await stepToward(f, p, drop.x, drop.z, stuck);
        } else {
          nudges = 0;
          // A gun's card is read against the one in hand before it is taken.
          if (p.lootIsGun === 1) await f.wait(CARD_READ_MS);
          await f.press("KeyE");
        }
        continue;
      }

      // Between fights, top up a magazine that is under half; an empty one reloads by itself.
      if (!fighting && p.magFill < 0.5 && p.heldAmmo > 0) await f.press("KeyR");
      if (p.goalKind < 0) {
        await f.wait(STEP_MS);
        continue;
      }
      const near = distance(p, p.goalX, p.goalZ);
      if (p.goalKind === kind("enemy")) {
        if (near > FIGHT_RANGE) await stepToward(f, p, p.goalX, p.goalZ, stuck);
        else await shootAt(f, p, { x: p.goalX, y: p.goalY, z: p.goalZ }, trigger);
        continue;
      }
      const reach = p.goalKind === kind("place") ? 4 : 2.2;
      if (near > reach) {
        await stepToward(f, p, p.goalX, p.goalZ, stuck);
        continue;
      }
      await f.heading(yawTo(p, p.goalX, p.goalZ));
      await f.press("KeyE");
      if (p.goalKind !== kind("npc")) continue;
      // Talking opens what they have to say: read it, then a second E takes the job.
      const talk = await f.probe();
      if (talk.dialogOpen === 0) continue;
      await f.wait(readingMs(talk.dialogChars));
      await f.press("KeyE");
    }
    await f.expect((p) => p.questsDone >= 4 && p.zonesSeen >= 2, "ten minutes in: the crash-site quests are done and the road out was walked");
  },
});
