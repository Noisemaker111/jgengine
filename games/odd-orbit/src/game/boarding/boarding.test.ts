import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { DAY_LENGTH } from "../../world";
import { game } from "../../game.config";
import { content } from "../content";
import { registerCommands } from "../commands";
import { householdBook } from "../agents";
import { householdStore } from "../session/store";
import { createHousehold, pairKey, type HouseholdState } from "../session/types";
import { captureOrbitSave, restoreOrbitSave, validOrbitSave } from "../session/save";
import { setupWorld } from "../sim/setup";
import { simulateHousehold } from "../sim/simulate";
import { metricValue } from "../sim/charter";
import { nextBill } from "../sim/economy";
import {
  acceptApplicant, addTenant, advanceBarks, BARK_GAP, advanceApplicants, boardingOf, buyModule, DEED_PRICE, driftNeighbours, FIXTURE_COMFORT, moveTenant,
  noVacancy, payDeed, roomOf, sealRoom, settleBoardingNight, tenantComfort, tuneRoom,
} from "./boarding";
import { comfortIn, effectiveRoom, idealSettings, neighbourSlots, rentShare, starsFor, type HouseView } from "./rooms";
import { SPECIES, SPECIES_IDS } from "./species";
import { berthAt, bubbles, roomFocus } from "./feeds";
import { berthPose } from "./layout";

const quiet = { push() {} };

function house(): HouseholdState {
  const state = createHousehold("boarding-test");
  return state;
}

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "boarding-test", isNew: true } });
  setupWorld(ctx);
  registerCommands(ctx);
  ctx.game.commands.define("orbit.checkpoint", { apply() {} });
  setGamePhase(ctx, "playing");
  return ctx;
}

describe("the tenants", () => {
  test("every species has a distinct silhouette, a full voice and three interview answers", () => {
    const shapes = new Set(SPECIES_IDS.map((id) => SPECIES[id].bodyPlan.shape));
    expect(shapes.size).toBe(SPECIES_IDS.length);
    for (const id of SPECIES_IDS) {
      const def = SPECIES[id];
      expect(def.lines.interview).toHaveLength(3);
      expect(def.lines.happy.length).toBeGreaterThan(0);
      expect(def.lines.moveOut.length).toBeGreaterThan(0);
    }
  });

  test("each species is delighted by its own ideal room", () => {
    for (const id of SPECIES_IDS) {
      const def = SPECIES[id];
      const room = { settings: idealSettings(def), noise: 0, leakIn: [], sources: [] };
      const comfort = comfortIn(def, room);
      expect(comfort.score, id).toBeGreaterThanOrEqual(id === "twins" ? 80 : 100);
    }
  });

  test("the Twins sign two cheques, one per head, and the light pleases one head at a time", () => {
    const twins = SPECIES.twins;
    const bright = comfortIn(twins, { settings: { ...idealSettings(twins), light: "bright" }, noise: 0, leakIn: [], sources: [] });
    expect(bright.score).toBe(100);
    expect(bright.second).toBeLessThan(bright.score);
    const dark = comfortIn(twins, { settings: { ...idealSettings(twins), light: "dark" }, noise: 0, leakIn: [], sources: [] });
    expect(dark.second).toBe(100);
    expect(dark.score).toBeLessThan(100);
  });
});

describe("walls leak", () => {
  test("rooms share walls along a deck and straight across", () => {
    expect(neighbourSlots(0).sort()).toEqual([1, 4]);
    expect(neighbourSlots(5).sort()).toEqual([1, 4, 6]);
  });

  test("Glorp's swamp gas seeps into Krrt's oxygen room and both of them mind", () => {
    const state = house();
    const krrt = addTenant(state, "krrt", 0);
    const glorp = addTenant(state, "glorp", 1);
    boardingOf(state).rooms[1]!.settings.atmosphere = "methane";
    const krrtComfort = tenantComfort(state, krrt.id);
    expect(krrtComfort.reasons.some((r) => r.factor === "leak")).toBe(true);
    expect(tenantComfort(state, glorp.id).reasons.some((r) => r.factor === "leak")).toBe(true);
    // A gasket kit on either side stops the leak both ways.
    state.credits = 1000;
    expect(sealRoom(state, 1)).toBeNull();
    expect(tenantComfort(state, krrt.id).reasons.some((r) => r.factor === "leak")).toBe(false);
    expect(tenantComfort(state, krrt.id).score).toBeGreaterThan(krrtComfort.score);
  });

  test("Sister Fog eats the noise next door; Old Basalt warms it", () => {
    const state = house();
    addTenant(state, "pip", 0);
    const velvet = addTenant(state, "velvet", 1);
    boardingOf(state).rooms[1]!.settings = { ...idealSettings(SPECIES.velvet) };
    const view = (): HouseView => ({ rooms: boardingOf(state).rooms, speciesOf: (id) => state.members[id]?.species ?? null });
    const noisy = effectiveRoom(view(), boardingOf(state).rooms[1]!).noise;
    expect(noisy).toBeGreaterThan(SPECIES.velvet.quiet - 0.5);
    addTenant(state, "fog", 2);
    expect(effectiveRoom(view(), boardingOf(state).rooms[1]!).noise).toBeLessThan(noisy);
    expect(tenantComfort(state, velvet.id).reasons.some((r) => r.factor === "noise")).toBe(false);
    const rocky = house();
    const rockView = (): HouseView => ({ rooms: boardingOf(rocky).rooms, speciesOf: (id) => rocky.members[id]?.species ?? null });
    const before = effectiveRoom(rockView(), boardingOf(rocky).rooms[1]!).settings.climate;
    addTenant(rocky, "basalt", 0);
    const after = effectiveRoom(rockView(), boardingOf(rocky).rooms[1]!).settings.climate;
    expect([before, after]).toEqual(["temperate", "hot"]);
  });

  test("a flare turns unshuttered rooms bright and hot", () => {
    const state = house();
    const krrt = addTenant(state, "krrt", 0);
    boardingOf(state).rooms[0]!.settings = { ...idealSettings(SPECIES.krrt) };
    expect(tenantComfort(state, krrt.id, 10).score).toBe(100);
    boardingOf(state).flareUntil = 100;
    expect(tenantComfort(state, krrt.id, 10).reasons.some((r) => r.factor === "light")).toBe(true);
    boardingOf(state).rooms[0]!.shuttered = true;
    expect(tenantComfort(state, krrt.id, 10).score).toBe(100);
  });
});

describe("rent night", () => {
  test("comfort sets the cheque and the stars", () => {
    expect([rentShare(90), rentShare(60), rentShare(40), rentShare(10)]).toEqual([1.15, 1, 0.6, 0.25]);
    expect([starsFor(90), starsFor(70), starsFor(50), starsFor(30), starsFor(5)]).toEqual([5, 4, 3, 2, 1]);
  });

  test("a delighted tenant tips, a review lands and reputation follows", () => {
    const state = house();
    const krrt = addTenant(state, "krrt", 0);
    boardingOf(state).rooms[0]!.settings = { ...idealSettings(SPECIES.krrt) };
    const before = state.credits;
    const night = settleBoardingNight(state, DAY_LENGTH, quiet);
    expect(night.rent).toBe(Math.round(SPECIES.krrt.rent * 1.15));
    expect(state.credits - before).toBe(night.rent);
    expect(boardingOf(state).reviews[0]).toMatchObject({ tenantId: krrt.id, stars: 5 });
    expect(boardingOf(state).reputation).toBeGreaterThan(50);
  });

  test("a friend covers a short cheque", () => {
    const state = house();
    const glorp = addTenant(state, "glorp", 0);
    const pip = addTenant(state, "pip", 2);
    // Glorp in plain oxygen is miserable; Pip-9 does not mind anything.
    state.relationships[pairKey(glorp.id, pip.id)] = 60;
    const night = settleBoardingNight(state, DAY_LENGTH, quiet);
    expect(night.covered).toBeGreaterThan(0);
    expect(night.rent).toBe(SPECIES.glorp.rent + Math.round(SPECIES.pip.rent * 1.15));
  });

  test("three miserable nights and a tenant moves out with a one-star review", () => {
    const state = house();
    const glorp = addTenant(state, "glorp", 0);
    boardingOf(state).rooms[0]!.settings = { atmosphere: "vacuum", gravity: "low", climate: "cold", light: "bright" };
    expect(tenantComfort(state, glorp.id).score).toBeLessThan(30);
    for (let night = 1; night <= 2; night++) expect(settleBoardingNight(state, DAY_LENGTH * night, quiet).movedOut).toEqual([]);
    const third = settleBoardingNight(state, DAY_LENGTH * 3, quiet);
    expect(third.movedOut).toEqual([glorp.id]);
    expect(state.members[glorp.id]).toBeUndefined();
    expect(roomOf(state, glorp.id)).toBeNull();
    expect(boardingOf(state).departed).toContain("glorp");
    expect(boardingOf(state).reviews[0]).toMatchObject({ stars: 1 });
  });

  test("feuding neighbours make each other's next day louder", () => {
    const state = house();
    const a = addTenant(state, "krrt", 0);
    const b = addTenant(state, "twins", 1);
    state.relationships[pairKey(a.id, b.id)] = -60;
    const night = settleBoardingNight(state, DAY_LENGTH, quiet);
    expect(night.sabotage).toBe(1);
    expect(Object.keys(boardingOf(state).noisyUntil)).toHaveLength(1);
  });

  test("leaky walls sour neighbours; kind walls warm them", () => {
    const state = house();
    const krrt = addTenant(state, "krrt", 0);
    const glorp = addTenant(state, "glorp", 1);
    boardingOf(state).rooms[1]!.settings.atmosphere = "methane";
    driftNeighbours(state, 0, DAY_LENGTH);
    expect(householdBook(state).opinion(krrt.id, glorp.id)).toBeLessThan(-20);
    const calm = house();
    const p = addTenant(calm, "pip", 0);
    const f = addTenant(calm, "fog", 1);
    driftNeighbours(calm, 0, DAY_LENGTH);
    expect(householdBook(calm).opinion(p.id, f.id)).toBeGreaterThan(0);
  });
});

describe("the landlord's verbs", () => {
  test("moving swaps tenants; a fixture can only take an empty room", () => {
    const state = house();
    const krrt = addTenant(state, "krrt", 0);
    const glorp = addTenant(state, "glorp", 1);
    const pip = addTenant(state, "pip", null);
    expect(moveTenant(state, glorp.id, 0)).toBeNull();
    expect([roomOf(state, glorp.id)?.slot, roomOf(state, krrt.id)?.slot]).toEqual([0, 1]);
    expect(moveTenant(state, pip.id, 0)).not.toBeNull();
    expect(tenantComfort(state, pip.id).score).toBe(FIXTURE_COMFORT);
    expect(moveTenant(state, pip.id, 2)).toBeNull();
    expect(roomOf(state, pip.id)?.slot).toBe(2);
  });

  test("tuning a room costs each change it takes; the oxygen next door still seeps in until sealed", () => {
    const state = house();
    const velvet = addTenant(state, "velvet", 0);
    state.credits = 1000;
    expect(tuneRoom(state, 0)).toBeNull();
    expect(state.credits).toBe(1000 - 40 - 50 - 20 - 10);
    expect(tenantComfort(state, velvet.id).reasons.map((r) => r.factor)).toEqual(["leak"]);
    expect(sealRoom(state, 0)).toBeNull();
    expect(tenantComfort(state, velvet.id).score).toBe(100);
  });

  test("modules wait on reputation and credits, then add to the nightly bill", () => {
    const state = house();
    state.credits = 2000;
    const bill = nextBill(state, []);
    boardingOf(state).reputation = 10;
    expect(buyModule(state, 4)).toContain("reputation");
    boardingOf(state).reputation = 60;
    expect(buyModule(state, 4)).toBeNull();
    expect(state.credits).toBe(2000 - 320);
    expect(boardingOf(state).rooms).toHaveLength(5);
    expect(nextBill(state, [])).toBe(bill + 22);
    expect(buyModule(state, 4)).toBe("Already docked");
  });

  test("a five-star house earns a premium; a landmark pays half the docking fee", () => {
    const state = house();
    addTenant(state, "pip", 0);
    boardingOf(state).rooms[0]!.settings = { ...idealSettings(SPECIES.pip) };
    const plain = settleBoardingNight(structuredClone(state), DAY_LENGTH, quiet).rent;
    boardingOf(state).reputation = 90;
    expect(settleBoardingNight(state, DAY_LENGTH, quiet).rent).toBe(Math.round(plain * 1.1));
    const bill = nextBill(state, []);
    boardingOf(state).reputation = 96;
    expect(nextBill(state, [])).toBe(bill - 40);
  });

  test("the deed stops the docking fee once paid", () => {
    const state = house();
    state.credits = DEED_PRICE + 100;
    const bill = nextBill(state, []);
    expect(payDeed(state, DEED_PRICE)).toBeNull();
    expect(nextBill(state, [])).toBe(bill - 80);
  });
});

describe("the airlock", () => {
  test("an applicant buzzes only while a room is empty, and moves in when let in", () => {
    const state = house();
    for (const [i, s] of (["krrt", "glorp", "fog"] as const).entries()) addTenant(state, s, i);
    advanceApplicants(state, DAY_LENGTH, quiet);
    expect(boardingOf(state).applicant?.species).toBe("twins");
    const member = acceptApplicant(state, null, DAY_LENGTH, quiet);
    expect(typeof member).toBe("object");
    expect(noVacancy(state)).toBe(true);
    advanceApplicants(state, DAY_LENGTH * 5, quiet);
    expect(boardingOf(state).applicant).toBeNull();
    expect(metricValue(state, [], "housed")).toBe(4);
  });

  test("Old Basalt pays a century up front", () => {
    const state = house();
    boardingOf(state).applicant = { species: "basalt", deadline: 999, asked: [] };
    const before = state.credits;
    acceptApplicant(state, 0, 0, quiet);
    expect(state.credits - before).toBe(640);
    expect(settleBoardingNight(state, DAY_LENGTH, quiet).rent).toBe(0);
  });
});

describe("the live house", () => {
  test("opening night: Krrt and Glorp share a wall, Pip-9 waits in the cupboard, one room is free", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    expect(state.order.map((id) => state.members[id]!.name)).toEqual(["Krrt", "Glorp", "Sister Fog", "Pip-9"]);
    expect(boardingOf(state).rooms.map((r) => r.tenantId)).toEqual(["alien:0", "alien:1", "alien:2", null]);
    expect(roomOf(state, "alien:3")).toBeNull();
    expect(tenantComfort(state, "alien:0").reasons.some((r) => r.factor === "leak")).toBe(true);
  });

  test("an accepted applicant walks in through the command, and the house saves and reloads", () => {
    const ctx = boot();
    householdStore.update(ctx, (s) => ({ ...s, boarding: { ...s.boarding!, applicant: { species: "velvet", deadline: 999, asked: [] } } }));
    ctx.game.commands.run("applicant.ask", { question: 1 });
    expect(boardingOf(householdStore.read(ctx)).applicant?.asked).toEqual([1]);
    ctx.game.commands.run("applicant.accept", { slot: 3 });
    const state = householdStore.read(ctx);
    expect(state.order).toHaveLength(5);
    const velvet = state.order.find((id) => state.members[id]!.species === "velvet")!;
    expect(ctx.scene.entity.get(velvet)).not.toBeNull();
    expect(roomOf(state, velvet)?.slot).toBe(3);
    ctx.game.commands.run("room.tune", { slot: 3 });
    const save = captureOrbitSave(ctx);
    expect(validOrbitSave(save)).toBe(true);
    const other = boot();
    restoreOrbitSave(other, save);
    expect(roomOf(householdStore.read(other), velvet)?.slot).toBe(3);
    expect(tenantComfort(householdStore.read(other), velvet).score).toBe(tenantComfort(householdStore.read(ctx), velvet).score);
  });

  test("a tenant who moves out at midnight leaves the scene too", () => {
    const ctx = boot();
    householdStore.update(ctx, (s) => {
      s.boarding!.rooms[0]!.settings = { atmosphere: "methane", gravity: "low", climate: "cold", light: "bright" };
      s.boarding!.grumbles["alien:0"] = 2;
      return { ...s };
    });
    simulateHousehold(ctx, ctx.time.advance(DAY_LENGTH - ctx.time.now() + 0.5));
    const state = householdStore.read(ctx);
    expect(state.members["alien:0"]).toBeUndefined();
    expect(ctx.scene.entity.get("alien:0")).toBeNull();
    expect(validOrbitSave(captureOrbitSave(ctx))).toBe(true);
  });
});

describe("tenants speak up", () => {
  test("a tenant says their worst complaint in their own voice, and Old Basalt only once a day", () => {
    const state = house();
    addTenant(state, "basalt", 0);
    const said: string[] = [];
    const feed = { push: (n: { text: string }) => { said.push(n.text); } };
    for (let t = 0; t < BARK_GAP * 6; t += 1) advanceBarks(state, t, feed);
    expect(said).toHaveLength(1);
    expect(said[0]).toStartWith("Old Basalt: “...");
    const glorp = house();
    addTenant(glorp, "glorp", 0);
    const lines: string[] = [];
    advanceBarks(glorp, 0, { push: (n) => { lines.push(n.text); } });
    advanceBarks(glorp, BARK_GAP, { push: (n) => { lines.push(n.text); } });
    expect(lines.at(-1)).toContain(SPECIES.glorp.lines.complaint.air);
  });
});

describe("the house in the world", () => {
  test("clicking a module's floor opens the Rooms plan on that room; the commons does not", () => {
    const ctx = boot();
    const pose = berthPose(2);
    expect(berthAt(pose.x, pose.z)).toBe(2);
    expect(berthAt(0, 0)).toBeNull();
    const before = roomFocus.read().seq;
    ctx.game.commands.run("world.pointer", { point: { x: pose.x + 0.5, y: 0, z: pose.z - 0.5 }, entity: null, object: null });
    expect(roomFocus.read()).toEqual({ slot: 2, seq: before + 1 });
    ctx.game.commands.run("world.pointer", { point: { x: 0, y: 0, z: 0 }, entity: null, object: null });
    expect(roomFocus.read().seq).toBe(before + 1);
  });

  test("a tenant who speaks up also gets a speech bubble over their head", () => {
    const state = house();
    const glorp = addTenant(state, "glorp", 0);
    advanceBarks(state, 0, quiet);
    advanceBarks(state, BARK_GAP, quiet);
    expect(bubbles.read().some((bubble) => bubble.tenantId === glorp.id && bubble.tone === "grumpy")).toBe(true);
  });
});
