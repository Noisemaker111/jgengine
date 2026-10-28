import { defineFlow, type Flow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

type Probe = ReturnType<NonNullable<NonNullable<typeof game.capture>["probe"]>>;
type Check = (p: Probe) => boolean;
/** Things the survivor can see and walk to: the path's pointer, the nearest tree, flint rock, bush or easy prey, or a station it built. */
type Sight = "point" | "tree" | "rock" | "bush" | "prey" | "campfire" | "mortar" | "floor" | "doorway" | "carcass" | "note" | "danger" | "phiomia";

/** The number keys, by the hotbar key they take in hand (Digit0 is the tenth). */
const DIGITS = ["Digit0", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"] as const;
/** The number key for hotbar key `n` (1-9, and 10 is Digit0). */
const digit = (n: number): (typeof DIGITS)[number] => DIGITS[n % 10] ?? "Digit0";

/** Where the hut goes: flat beach sand a few metres from the spawn, x and z. */
const HUT_SITE: [number, number] = [238, 1333];

/** Metres a walking survivor covers in a second. */
const WALK = 4.9;

const yawOf = (p: Probe, what: Sight): number => p[`${what}Yaw`];
const distOf = (p: Probe, what: Sight): number => p[`${what}Dist`];

/** A bearing to walk: the camera yaw towards it and metres off (-1 when nothing is in sight). */
type Bearing = (p: Probe) => { yaw: number; distance: number };
const toSight =
  (what: Sight): Bearing =>
  (p) => ({ yaw: yawOf(p, what), distance: distOf(p, what) });
const toSpot =
  (x: number, z: number): Bearing =>
  (p) => ({ yaw: Math.atan2(x - p.x, z - p.z), distance: Math.hypot(x - p.x, z - p.z) });

/** Where a sight stands, as x and z, from the survivor's bearing and distance to it. */
const spotOf = (p: Probe, what: Sight): [number, number] => [p.x + Math.sin(yawOf(p, what)) * distOf(p, what), p.z + Math.cos(yawOf(p, what)) * distOf(p, what)];
/** The spot `metres` out in front of the hut's doorway, on the line from the floor's middle through it. */
function outside(p: Probe, metres: number): [number, number] {
  const [fx, fz] = spotOf(p, "floor");
  const [dx, dz] = spotOf(p, "doorway");
  const length = Math.hypot(dx - fx, dz - fz) || 1;
  return [dx + ((dx - fx) / length) * metres, dz + ((dz - fz) / length) * metres];
}

/** Turn the camera to `what` (a sight, or a bearing) and walk until it is `near` metres off. */
async function walkTo(f: Flow<Probe>, near: number, what: Sight | Bearing = "point", maxMs = 120_000): Promise<void> {
  const bearing = typeof what === "function" ? what : toSight(what);
  let best = Number.POSITIVE_INFINITY;
  let stalled = 0;
  let detours = 0;
  for (let spent = 0; spent < maxMs; ) {
    const p = await f.probe();
    const { yaw, distance } = bearing(p);
    if (distance >= 0 && distance <= near) return;
    if (distance >= 0 && distance < best - 0.3) {
      best = distance;
      stalled = 0;
    } else if ((stalled += 1) === 2 || stalled === 3) {
      // Up against a step (a foundation's edge, a ledge): hop up it.
      await f.heading(yaw);
      await f.hold(["Space", "KeyW"], { ms: 380 });
      spent += 380;
      continue;
    } else if (stalled >= 4) {
      // Blocked (a cave's rock, a cliff, a wall of the hut): walk along it, a right angle off the bearing,
      // alternating sides, then try again.
      detours += 1;
      await f.heading(yaw + (detours % 2 === 1 ? Math.PI / 2 : -Math.PI / 2));
      await f.hold("KeyW", { ms: 1500 * Math.min(detours, 4) });
      spent += 1500 * Math.min(detours, 4);
      stalled = 0;
      best = Number.POSITIVE_INFINITY;
      continue;
    }
    await f.heading(yaw);
    const ms = distance < 0 ? 1000 : Math.max(120, Math.min(1000, ((distance - near) / WALK) * 1000));
    await f.hold("KeyW", { ms });
    spent += ms;
  }
  throw new Error(`never came within ${near} m of the ${typeof what === "function" ? "spot" : what}`);
}

/**
 * Work the nearest tree, rock or bush until `done`: strike it (left mouse) or pick it (E), moving on to
 * the next one in sight when one is spent.
 */
async function gather(f: Flow<Probe>, what: "tree" | "rock" | "bush", done: Check, maxMs = 240_000): Promise<void> {
  let misses = 0;
  let health = (await f.probe()).health;
  for (let spent = 0; spent < maxMs; ) {
    const now = await f.probe();
    if (done(now)) return;
    // E on a bush with the tame standing in front opens the tame's inventory instead: close it, as a player would.
    if (now.screen === 1) await f.command("closeCreature", {});
    if (what !== "bush" && now.stamina < 10) {
      // Too tired to swing: get the breath back first.
      await f.wait(5000);
      spent += 5000;
      continue;
    }
    const evaded = await keepClear(f, now, health);
    health = now.health;
    if (evaded > 0) {
      spent += evaded;
      continue;
    }
    try {
      await walkTo(f, what === "bush" ? 1.4 : 1.7, what, 60_000);
    } catch {
      // Walled off from this one (a cliff, a thicket): turn away and look for the next.
      misses += 1;
      await f.heading((await f.probe()).yaw + Math.PI);
      await f.hold("KeyW", { ms: 3000 });
      spent += 63_000;
      continue;
    }
    const at = await f.probe();
    const before = at.gathered;
    // A swing and E both take what is in front, so look at it first: arriving already in reach turns nothing.
    await f.heading(yawOf(at, what));
    if (what === "bush") {
      for (let pick = 0; pick < 3; pick += 1) await f.press("KeyE");
      spent += 600;
    } else {
      for (let swing = 0; swing < 6; swing += 1) {
        await f.hold("mouse0", { ms: 1000 });
        spent += 1000;
        const p = await f.probe();
        if (done(p) || p.gathered === before) break;
      }
    }
    // Nothing came off it: it is spent (or out of reach), so step round it to the next one.
    if ((await f.probe()).gathered === before) {
      misses += 1;
      await f.hold("KeyD", { ms: 600 * Math.min(misses, 5) });
      spent += 600 * Math.min(misses, 5);
    } else misses = 0;
  }
  throw new Error(`gathering at the ${what} never finished`);
}

/**
 * Keep clear of a hunter: turn the spear on one that is on the survivor, back off from one close by.
 * Returns the milliseconds spent, 0 when nothing hunts nearby.
 */
async function keepClear(f: Flow<Probe>, p: Probe, health: number): Promise<number> {
  const hurt = p.health < health;
  if ((p.aimedThreat === 1 || (hurt && p.dangerDist >= 0 && p.dangerDist < 4)) && p.spearKey > 0) {
    const held = p.holding;
    await hand(f, (q) => q.spearKey);
    let spent = 0;
    for (let swing = 0; swing < 40; swing += 1) {
      const q = await f.probe();
      if (q.dangerDist < 0 || q.dangerDist > 5) break;
      if (q.aimedThreat === 0) await f.heading(q.dangerYaw);
      await f.hold("mouse0", { ms: 500 });
      spent += 500;
    }
    await hand(f, () => held);
    return spent;
  }
  if (p.dangerDist >= 0 && p.dangerDist < 25) {
    await f.heading(p.dangerYaw + Math.PI);
    await f.hold(p.stamina > 20 ? ["ShiftLeft", "KeyW"] : "KeyW", { ms: 1500 });
    return 1500;
  }
  return 0;
}

/** Wait until `done` while staying alive: a tame takes minutes, and a hunter finds a survivor standing still. */
async function guardUntil(f: Flow<Probe>, done: Check, note: string, maxMs: number): Promise<void> {
  let health = (await f.probe()).health;
  for (let spent = 0; spent < maxMs; ) {
    const p = await f.probe();
    if (done(p)) return;
    const evaded = await keepClear(f, p, health);
    health = p.health;
    if (evaded > 0) spent += evaded;
    else {
      await f.wait(2000);
      spent += 2000;
    }
  }
  await f.expect(done, note);
}

/** Take the hotbar tool on `key` in hand (0: bare hands), pressing its number only when it is not already held. */
async function hand(f: Flow<Probe>, key: (p: Probe) => number): Promise<void> {
  const p = await f.probe();
  const want = key(p);
  if (want === p.holding) return;
  // A number key takes that slot in hand; pressing the held slot's number again puts it away.
  await f.press(digit(want === 0 ? p.holding : want));
  await f.waitFor((q) => q.holding === want, { timeoutMs: 2000, note: `hotbar key ${want} in hand` });
}
const bare = (): number => 0;
const pick = (p: Probe): number => p.pickKey;
const hatchet = (p: Probe): number => p.hatchetKey;

/**
 * Put the first building piece in the bag on the hotbar, take it in hand and place it where the ghost stands,
 * no more than `maxLift` metres off the ground (a ceiling goes on the walls' tops). With `look`, the builder
 * turns to each of those headings in turn (the four sides of the floor it stands on), pressing R through the
 * ways the piece snaps, until a ghost will stand.
 */
async function placePiece(f: Flow<Probe>, maxLift = 1.5, look: readonly number[] = []): Promise<void> {
  const inBag = await f.probe();
  if (inBag.pieceSlot >= 0) await f.command("shuttle", { inventoryId: "inventory", slot: inBag.pieceSlot });
  const onBar = await f.waitFor((p) => p.pieceKey > 0, { timeoutMs: 2000, note: "the piece is on the hotbar" });
  if (onBar.holding !== onBar.pieceKey) await f.press(digit(onBar.pieceKey));
  const headings = look.length > 0 ? look : [onBar.yaw];
  let found = false;
  for (let attempt = 0; attempt < 6 && !found; attempt += 1) {
    // Nothing would stand from here (a tree in the way on open ground): step aside and look again.
    if (attempt > 0) await f.hold("KeyA", { ms: 400 });
    for (const heading of headings) {
      await f.heading(heading);
      for (let turn = 0; turn < 4 && !found; turn += 1) {
        const p = await f.waitFor((q) => q.ghost >= 0, { timeoutMs: 2000, note: "the ghost shows" });
        // A wall stacked on a wall stands too: for a piece that goes on the floor, keep looking for one that does.
        if (p.ghost === 1 && p.ghostLift <= maxLift) found = true;
        else await f.press("KeyR");
      }
      if (found) break;
    }
  }
  const before = (await f.probe()).structures;
  await f.press("mouse0");
  await f.waitFor((p) => p.structures === before + 1, { timeoutMs: 3000, note: "the piece is placed" });
}

/** Learn an engram in the Engrams tab, craft one and wait for it. */
async function learnAndCraft(f: Flow<Probe>, id: string, made: Check, learn = true): Promise<void> {
  if (learn) await f.command("learn", { engramId: id });
  await f.command("craft", { recipeId: id });
  await f.waitFor(made, { timeoutMs: 30_000, note: `${id} is made` });
}

/** Run the pointed creature down and hit it, turning after it each swing, until it lies unconscious. */
async function chaseDown(f: Flow<Probe>, maxMs = 150_000): Promise<void> {
  for (let spent = 0; spent < maxMs; ) {
    const p = await f.probe();
    if (p.aimedDown === 1) return;
    await f.heading(p.pointYaw);
    if (p.pointDist > 1.4) {
      // Run it down while there is breath for it, as a skittish one outpaces a walk.
      const run = p.pointDist > 4 && p.stamina > 20;
      const ms = Math.max(120, Math.min(800, ((p.pointDist - 1.2) / (run ? WALK * 1.8 : WALK)) * 1000));
      await f.hold(run ? ["ShiftLeft", "KeyW"] : "KeyW", { ms });
      spent += ms;
    } else {
      await f.hold("mouse0", { ms: 300 });
      spent += 300;
    }
  }
  throw new Error("the creature never went down");
}

/**
 * Hunt the nearest easy prey until `done`: kill it with the spear once there is one, then carve the body
 * with the tool in hand when the hunt began (the pick for meat, the hatchet for hide). Keep clear of hunters,
 * and fight the one that closes in.
 */
async function hunt(f: Flow<Probe>, done: Check, maxMs = 300_000): Promise<void> {
  const carve = (await f.probe()).holding;
  const kill = (q: Probe): number => (q.spearKey > 0 ? q.spearKey : carve);
  let health = (await f.probe()).health;
  for (let spent = 0; spent < maxMs; ) {
    const p = await f.probe();
    if (done(p)) return;
    const evaded = await keepClear(f, p, health);
    health = p.health;
    if (evaded > 0) {
      spent += evaded;
      continue;
    }
    if (p.stamina < 30) {
      // Winded from the chase: get the breath back before a hunter finds the survivor with none.
      await f.wait(5000);
      spent += 5000;
      continue;
    }
    if (p.aimedWild === 1) {
      // A wild one in front: the spear while it lives, the carving tool on the body it leaves.
      await hand(f, p.aimedHealth > 0 ? kill : () => carve);
      await f.hold("mouse0", { ms: 500 });
      spent += 500;
      const q = await f.probe();
      if (q.aimedHealth === p.aimedHealth && q.hide === p.hide && q.rawMeat === p.rawMeat) {
        // In sight but out of the tool's reach: close in.
        await f.heading(q.preyYaw);
        await f.hold("KeyW", { ms: 250 });
        spent += 250;
      }
      continue;
    }
    if (p.carcassDist >= 0) {
      // A body still to carve close by: back to it before running down the next one.
      await f.heading(p.carcassYaw);
      if (p.carcassDist > 1.2) await f.hold("KeyW", { ms: Math.max(120, Math.min(800, ((p.carcassDist - 1) / WALK) * 1000)) });
      else await f.hold("KeyS", { ms: 150 });
      spent += 300;
      continue;
    }
    if (p.preyDist < 0) throw new Error("no prey in sight");
    await f.heading(p.preyYaw);
    const ms = Math.max(120, Math.min(800, ((p.preyDist - 1) / WALK) * 1000));
    await f.hold("KeyW", { ms });
    spent += ms;
  }
  throw new Error(`the hunt never finished: ${done.toString()}`);
}

export default defineFlow(game, {
  async run(f) {
    await f.waitFor((p) => p.health > 0, { timeoutMs: 60000 });
    await f.expect((p) => p.thatch === 0 && p.level === 1 && p.taught === 0 && p.itemsSeen === 0, "a new survivor: empty hands, level 1, nothing taught, nothing in the dossier");
    // the path points at the nearest tree: walk to it and punch it, enough thatch for a pick and a hatchet
    await walkTo(f, 1.6);
    await f.hold("mouse0", { until: (p) => p.thatch >= 22 && p.wood >= 2, timeoutMs: 60000 });
    await f.waitFor((p) => p.taught >= 1, { timeoutMs: 2000, note: "punching a tree is the first step done" });
    // stones next: walk to the pointer and press E
    await walkTo(f, 1.5);
    await f.press("KeyE");
    await f.waitFor((p) => p.stone >= 1, { timeoutMs: 2000 });
    // the inventory's craft button: a Stone Pick from 1 stone, 1 wood and 10 thatch
    await f.press("KeyI");
    await f.command("craft", { recipeId: "stone_pick" });
    await f.press("KeyI");
    await f.waitFor((p) => p.picks >= 1 && p.level >= 3, { timeoutMs: 20000, note: "the pick is made; the step's experience makes level 3" });

    // the Engrams tab: learn the Stone Hatchet with the level's points
    await f.command("learn", { engramId: "stone_hatchet" });
    await f.expect((p) => p.unlocks === 3, "the hatchet engram is the first learned");
    // the pick in hand; the path points at a rock with flint
    await hand(f, pick);
    await walkTo(f, 1.8);
    await f.hold("mouse0", { until: (p) => p.flint >= 3, timeoutMs: 30000 });
    await f.command("craft", { recipeId: "stone_hatchet" });
    await f.waitFor((p) => p.hatchets >= 1, { timeoutMs: 20000, note: "the hatchet is made" });
    // empty hands to pick berries
    await hand(f, bare);

    // berries: E on the bushes the path points at
    for (let bush = 0; bush < 12; bush += 1) {
      const p = await f.probe();
      if (p.berries >= 12) break;
      await walkTo(f, 1.4);
      for (let pick = 0; pick < 4; pick += 1) await f.press("KeyE");
    }
    await f.waitFor((p) => p.berries >= 12, { timeoutMs: 2000, note: "a dozen berries" });

    // a drink at the shore
    await walkTo(f, 0.5);
    await f.press("KeyE");
    await f.waitFor((p) => p.drinks >= 1, { timeoutMs: 3000, note: "drank" });

    // the dodo: punch it asleep, open its inventory and give it the berries
    await chaseDown(f);
    await f.hold("KeyE", { until: (p) => p.screen === 1, timeoutMs: 3000 });
    await f.waitFor((p) => p.foodSlot >= 0, { timeoutMs: 2000 });
    // every berry stack it eats, as a player drags them all across
    for (let stack = 0; stack < 8; stack += 1) {
      const fed = await f.probe();
      if (fed.foodSlot < 0) break;
      await f.command("giveCreature", { inventoryId: "inventory", slot: fed.foodSlot });
    }
    await guardUntil(f, (p) => p.tamed === 1, "the dodo eats the berries on its clock and is tamed", 300_000);
    await f.command("closeCreature", {});

    // a level's stat point into health
    await f.command("levelStat", { stat: "health" });
    await f.expect((p) => p.spentPoints === 1, "a stat point spent");

    // the campfire: the hatchet on a rock for stone and flint, the pick on a tree for thatch
    await hand(f, hatchet);
    await gather(f, "rock", (p) => p.stone >= 16 && p.flint >= 3);
    await hand(f, pick);
    await gather(f, "tree", (p) => p.thatch >= 12 && p.wood >= 2);
    await learnAndCraft(f, "campfire", (p) => p.pieceSlot >= 0);
    await placePiece(f);
    await f.waitFor((p) => p.campfires === 1, { timeoutMs: 2000, note: "a campfire stands" });

    // meat: the pick on a dodo, lystrosaurus or phiomia, then on its body
    await hand(f, pick);
    await hunt(f, (p) => p.rawMeat >= 2);
    // cook it at the campfire
    await walkTo(f, 2.5, "campfire");
    await f.command("craft", { recipeId: "cook_meat" });
    await f.waitFor((p) => p.cookedMeat >= 1, { timeoutMs: 40_000, note: "meat cooked on the campfire" });

    // the spear: fiber from bushes (bare hands), wood from trees (the hatchet), flint from a rock (the pick)
    await hand(f, bare);
    await gather(f, "bush", (p) => p.fiber >= 12);
    await hand(f, hatchet);
    await gather(f, "tree", (p) => p.wood >= 8);
    await hand(f, pick);
    await gather(f, "rock", (p) => p.flint >= 2);
    await learnAndCraft(f, "spear", (p) => p.spearKey > 0);

    // the thatch hut, a piece at a time: gather for it, learn it, craft it, place it
    const hut: { id: string; thatch: number; wood: number; fiber: number }[] = [
      { id: "thatch_foundation", thatch: 20, wood: 6, fiber: 15 },
      { id: "thatch_doorframe", thatch: 8, wood: 6, fiber: 6 },
      { id: "thatch_wall", thatch: 10, wood: 2, fiber: 7 },
      { id: "thatch_wall", thatch: 10, wood: 2, fiber: 7 },
      { id: "thatch_wall", thatch: 10, wood: 2, fiber: 7 },
      { id: "thatch_ceiling", thatch: 15, wood: 4, fiber: 10 },
      { id: "thatch_door", thatch: 7, wood: 0, fiber: 4 },
    ];
    const learned = new Set<string>();
    for (const piece of hut) {
      await hand(f, pick);
      await gather(f, "tree", (p) => p.thatch >= piece.thatch);
      await hand(f, hatchet);
      await gather(f, "tree", (p) => p.wood >= piece.wood);
      await hand(f, bare);
      await gather(f, "bush", (p) => p.fiber >= piece.fiber);
      await learnAndCraft(f, piece.id, (p) => p.pieceSlot >= 0, !learned.has(piece.id));
      learned.add(piece.id);
      const at = await f.probe();
      if (at.floorDist < 0) {
        // The foundation goes down on the open sand beside the spawn, clear of the jungle's trees and slopes.
        await walkTo(f, 1, toSpot(...HUT_SITE));
        await placePiece(f);
      } else if (piece.id === "thatch_door") {
        // The door from outside, in front of the doorway, turned back to hang it.
        if (at.doorwayDist >= 0) await walkTo(f, 0.8, toSpot(...outside(at, 2.2)));
        const back = await f.probe();
        await placePiece(f, 1.5, [back.doorwayYaw]);
      } else {
        // The rest from the middle of the floor, looking at each side in turn: in through the doorway once
        // it stands, as the walls close the other sides.
        if (at.doorwayDist >= 0) {
          await walkTo(f, 0.8, toSpot(...outside(at, 2.2)));
          await walkTo(f, 1.2, "doorway");
        } else await walkTo(f, 2.4, "floor");
        // The foundation stands higher than a stride: hop up onto it.
        await f.heading((await f.probe()).floorYaw);
        await f.hold(["Space", "KeyW"], { ms: 380 });
        await walkTo(f, 0.6, "floor");
        const on = await f.probe();
        const sides = [0, 1, 2, 3].map((k) => on.yaw + (k * Math.PI) / 2);
        await placePiece(f, piece.id === "thatch_ceiling" ? Number.POSITIVE_INFINITY : 1.5, sides);
        // Back out through the doorway to gather for the next piece.
        const done = await f.probe();
        if (done.doorwayDist >= 0) {
          await walkTo(f, 0.5, "doorway");
          await walkTo(f, 0.8, toSpot(...outside(await f.probe(), 2.2)));
        }
      }
    }
    await f.waitFor((p) => p.taught >= 13, { timeoutMs: 3000, note: "the hut is the path's thirteenth step" });

    // the Phiomia saddle engram, then the path's order: tame a Phiomia (the one by the beach, before a hunt takes it), then make its saddle
    await f.command("learn", { engramId: "phiomia_saddle" });
    await f.waitFor((p) => p.taught >= 14, { timeoutMs: 3000, note: "the saddle engram is learned" });
    await hand(f, bare);
    await gather(f, "bush", (p) => p.berries >= 40);
    // punch a Phiomia asleep and feed it the berries
    await chaseDown(f, 300_000);
    await f.hold("KeyE", { until: (p) => p.screen === 1, timeoutMs: 3000 });
    for (let stack = 0; stack < 8; stack += 1) {
      const p = await f.probe();
      if (p.foodSlot < 0) break;
      await f.command("giveCreature", { inventoryId: "inventory", slot: p.foodSlot });
    }
    await guardUntil(f, (p) => p.tamed === 2, "the Phiomia eats its way to tamed", 600_000);
    await f.command("closeCreature", {});
    // its saddle: hide from a hunt with the hatchet, then fiber and wood
    await hand(f, hatchet);
    await hunt(f, (p) => p.hide >= 20, 900_000);
    await hand(f, bare);
    await gather(f, "bush", (p) => p.fiber >= 15);
    await hand(f, hatchet);
    await gather(f, "tree", (p) => p.wood >= 5);
    await f.command("craft", { recipeId: "phiomia_saddle" });
    await f.waitFor((p) => p.saddleSlot >= 0, { timeoutMs: 30_000, note: "the saddle is made" });
    // back to the Phiomia, the saddle into its inventory, then E to climb on
    await hand(f, bare);
    await walkTo(f, 2.2, "phiomia");
    await f.heading(yawOf(await f.probe(), "phiomia"));
    await f.hold("KeyE", { until: (p) => p.screen === 1, timeoutMs: 3000 });
    await f.command("giveCreature", { inventoryId: "inventory", slot: (await f.probe()).saddleSlot });
    await f.command("closeCreature", {});
    await f.hold("KeyE", { until: (p) => p.riding === 1, timeoutMs: 3000 });

    // ride to the nearest explorer note and read it
    await f.waitFor((p) => p.taught >= 16, { timeoutMs: 3000, note: "riding the Phiomia is the path's sixteenth step" });
    await walkTo(f, 2, "point", 600_000);
    await f.press("KeyE");
    await f.waitFor((p) => p.notesSeen >= 1, { timeoutMs: 3000, note: "the note is read into the dossier" });
    await f.command("closeNote", {});
    // off the Phiomia to work by hand
    await f.hold("KeyE", { until: (p) => p.riding === 0, timeoutMs: 3000 });

    // narcotics: a Mortar and Pestle from stone and hide, narcoberries, and meat left to spoil
    await hand(f, hatchet);
    await gather(f, "rock", (p) => p.stone >= 65);
    // the engram learned with the stone in, to see what the hide is for
    await f.command("learn", { engramId: "mortar_and_pestle" });
    await hunt(f, (p) => p.hide >= 15 && p.rawMeat + p.spoiledMeat >= 1, 900_000);
    await learnAndCraft(f, "mortar_and_pestle", (p) => p.pieceSlot >= 0, false);
    await placePiece(f);
    await hand(f, bare);
    await gather(f, "bush", (p) => p.narcoberries >= 5);
    await walkTo(f, 2.5, "mortar");
    await f.command("learn", { engramId: "narcotic" });
    await f.waitFor((p) => p.spoiledMeat >= 1, { timeoutMs: 600_000, note: "the meat has gone off" });
    await f.command("craft", { recipeId: "narcotic" });
    await f.waitFor((p) => p.narcotics >= 1, { timeoutMs: 30_000, note: "a narcotic is ground" });

    // the club: level 8 opens it
    await f.waitFor((p) => p.level >= 8, { timeoutMs: 1000, note: "level 8" });
    await hand(f, hatchet);
    await gather(f, "tree", (p) => p.wood >= 4);
    await hand(f, bare);
    await gather(f, "bush", (p) => p.fiber >= 15);
    await learnAndCraft(f, "wooden_club", (p) => p.clubs >= 1);
    // wood laid in for the next walls, as a survivor would before nightfall, until the bag is near full
    await hand(f, hatchet);
    await gather(f, "tree", (p) => p.wood >= 230 || p.weight >= p.weightMax - 4, 480_000);
    // and carried home to the campfire
    await walkTo(f, 3, "campfire", 300_000);
    await f.wait(1000);
  },
});
