import { describe, expect, test } from "bun:test";

import { DAY_LENGTH } from "../../world";
import { createHousehold, pairKey, type HouseholdState } from "../session/types";
import { incidentDef } from "../sim/events";
import { nextBill } from "../sim/economy";
import {
  addTenant, advanceCouncil, boardingOf, buyModule, COUNCIL, DRAFT_PENALTY, settleBoardingNight, tenantComfort,
} from "./boarding";
import { idealSettings, MODULE_KIND } from "./rooms";
import { SPECIES } from "./species";
import { advanceStories, CAREER_RAISE, storiesOf } from "./stories";

const quiet = { push() {} };
const house = (): HouseholdState => createHousehold("depth-test");

describe("three new tenants, three new ways to clash", () => {
  test("Lumen glows through the wall: Krrt's dark room turns dim unless shuttered", () => {
    const state = house();
    const krrt = addTenant(state, "krrt", 0);
    boardingOf(state).rooms[0]!.settings = { ...idealSettings(SPECIES.krrt) };
    boardingOf(state).rooms[0]!.sealed = true;
    expect(tenantComfort(state, krrt.id).score).toBe(100);
    addTenant(state, "lumen", 1);
    expect(tenantComfort(state, krrt.id).reasons.some((r) => r.factor === "light")).toBe(true);
    boardingOf(state).rooms[0]!.shuttered = true;
    expect(tenantComfort(state, krrt.id).score).toBe(100);
  });

  test("Mote's gravity well crushes Velvet next door and no gasket stops it; Old Basalt loves it", () => {
    const state = house();
    const velvet = addTenant(state, "velvet", 0);
    boardingOf(state).rooms[0]!.settings = { ...idealSettings(SPECIES.velvet) };
    boardingOf(state).rooms[0]!.sealed = true;
    addTenant(state, "mote", 1);
    expect(tenantComfort(state, velvet.id).reasons.some((r) => r.factor === "gravity")).toBe(true);
    const rock = house();
    const basalt = addTenant(rock, "basalt", 0);
    boardingOf(rock).rooms[0]!.settings = { ...idealSettings(SPECIES.basalt), gravity: "standard" };
    const before = tenantComfort(rock, basalt.id).score;
    addTenant(rock, "mote", 1);
    expect(tenantComfort(rock, basalt.id).score).toBeGreaterThan(before);
  });

  test("Auntie Spore's spores make breathers sneeze through unsealed walls, and her mushrooms feed the galley", () => {
    const state = house();
    const twins = addTenant(state, "twins", 0);
    addTenant(state, "aunt", 1);
    expect(tenantComfort(state, twins.id).reasons.some((r) => r.factor === "spores")).toBe(true);
    boardingOf(state).rooms[1]!.sealed = true;
    expect(tenantComfort(state, twins.id).reasons.some((r) => r.factor === "spores")).toBe(false);
    const pantry = state.pantry;
    expect(settleBoardingNight(state, DAY_LENGTH, quiet).mushrooms).toBe(1);
    expect(state.pantry).toBe(pantry + 1);
  });
});

describe("module types are different bargains", () => {
  test("a suite costs more, pays more and comforts; a capsule is cheap with thin walls; a bunker is sealed", () => {
    const state = house();
    state.credits = 5000;
    boardingOf(state).reputation = 80;
    const bill = nextBill(state, []);
    expect(buyModule(state, 4, "suite")).toBeNull();
    expect(state.credits).toBe(5000 - Math.round(320 * MODULE_KIND.suite.price));
    expect(nextBill(state, [])).toBe(bill + 22 + 12);
    const pip = addTenant(state, "pip", 4);
    boardingOf(state).rooms.find((r) => r.slot === 4)!.settings = { ...idealSettings(SPECIES.pip) };
    expect(settleBoardingNight(state, DAY_LENGTH, quiet).rent).toBe(Math.round(SPECIES.pip.rent * 1.4 * 1.15));
    expect(tenantComfort(state, pip.id).score).toBe(100);
    expect(buyModule(state, 5, "bunker")).toBeNull();
    const bunker = boardingOf(state).rooms.find((r) => r.slot === 5)!;
    expect([bunker.sealed, bunker.shuttered]).toEqual([true, true]);
    const glorp = addTenant(state, "glorp", 5);
    bunker.settings = { ...idealSettings(SPECIES.glorp) };
    expect(tenantComfort(state, glorp.id).reasons.some((r) => r.factor === "module")).toBe(true);
  });
});

describe("tenant life stories", () => {
  test("a settled tenant lands the dock job over a few nights and pays a quarter more", () => {
    const state = house();
    const pip = addTenant(state, "pip", 0);
    pip.completedShifts = 3;
    state.day = 2;
    const rentBefore = settleBoardingNight(structuredClone(state), DAY_LENGTH, quiet).rent;
    advanceStories(state, 0, quiet);
    expect(storiesOf(state)[pip.id]).toMatchObject({ arc: "career", beat: 0 });
    for (const day of [3, 5]) { state.day = day; advanceStories(state, 0, quiet); }
    expect(storiesOf(state)[pip.id]!.beat).toBe(2);
    expect(settleBoardingNight(state, DAY_LENGTH, quiet).rent).toBe(Math.round(SPECIES.pip.rent * CAREER_RAISE * 1.15));
    expect(rentBefore).toBe(Math.round(SPECIES.pip.rent * 1.15));
  });

  test("close neighbours fall in love; moving them apart breaks their hearts", () => {
    const state = house();
    const a = addTenant(state, "pip", 0);
    const b = addTenant(state, "fog", 1);
    state.relationships[pairKey(a.id, b.id)] = 80;
    advanceStories(state, 0, quiet);
    const story = storiesOf(state)[a.id] ?? storiesOf(state)[b.id];
    expect(story).toMatchObject({ arc: "romance", beat: 0 });
    state.day = 2;
    expect(advanceStories(state, 0, quiet).some((line) => line.includes("an item"))).toBe(true);
    boardingOf(state).rooms[1]!.tenantId = null;
    boardingOf(state).rooms[3]!.tenantId = b.id;
    state.day = 3;
    expect(advanceStories(state, 0, quiet).some((line) => line.includes("broke their hearts"))).toBe(true);
  });

  test("a tenant in crisis pulls through if their room is made lovely in time", () => {
    const state = house();
    const glorp = addTenant(state, "glorp", 0);
    boardingOf(state).grumbles[glorp.id] = 1;
    advanceStories(state, 0, quiet);
    expect(storiesOf(state)[glorp.id]).toMatchObject({ arc: "crisis" });
    boardingOf(state).rooms[0]!.settings = { ...idealSettings(SPECIES.glorp) };
    boardingOf(state).rooms[0]!.sealed = true;
    state.day = 1;
    expect(advanceStories(state, 0, quiet).some((line) => line.includes("pulled through"))).toBe(true);
  });
});

describe("station events and the long game", () => {
  test("the Lantern Festival and the meteor shower offer real choices", () => {
    const state = house();
    addTenant(state, "pip", 0);
    state.pantry = 10;
    const festival = incidentDef("festival")!;
    const rep = boardingOf(state).reputation;
    festival.choices!.find((c) => c.id === "host")!.apply(state, { id: "festival", memberId: null, otherId: null, objId: null, objCatalog: null, deadline: 0 }, 0);
    expect(boardingOf(state).reputation).toBe(rep + 6);
    const shower = incidentDef("meteorShower")!;
    const pip = state.order[0]!;
    const before = tenantComfort(state, pip, 10).score;
    shower.choices!.find((c) => c.id === "watch")!.apply(state, { id: "meteorShower", memberId: null, otherId: null, objId: null, objCatalog: null, deadline: 0 }, 10);
    expect(tenantComfort(state, pip, 20).score).toBe(Math.max(0, before - DRAFT_PENALTY));
  });

  test("past the deed, three nights at the council's bar win a seat on the Station Council", () => {
    const state = house();
    const b = boardingOf(state);
    for (let slot = 4; slot < 8; slot++) b.rooms.push({ id: `room:${slot}`, slot, settings: { atmosphere: "oxygen", gravity: "standard", climate: "temperate", light: "dim" }, sealed: false, shuttered: false, tenantId: null });
    for (const [slot, s] of (["pip", "fog", "krrt", "glorp", "twins", "velvet", "basalt"] as const).entries()) addTenant(state, s, slot);
    b.reputation = COUNCIL.reputation + 2;
    advanceCouncil(state, quiet);
    expect(b.councilNights ?? 0).toBe(0);
    b.deedOwed = 0;
    for (let n = 0; n < COUNCIL.nights; n++) advanceCouncil(state, quiet);
    expect(b.councilSeat).toBe(true);
  });
});
