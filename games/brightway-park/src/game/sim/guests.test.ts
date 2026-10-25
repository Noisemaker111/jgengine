import { beforeEach, describe, expect, test } from "bun:test";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "../content";
import { agentOf, clearAgents, guestTargets, liveAgent } from "../agents";
import { resetSession, session } from "../session";
import { cellFor, freshWorld, park, placeFree } from "../park";
import { tickStaff } from "../staff";
import { joinRide, resetRides, syncRidePark } from "../rides";
import { seedGuests, tickGuests } from "./guests";
import { BUILDABLES } from "../objects/catalog";
import { staffCover } from "../staff";
import { tallyThoughts, think } from "./thoughts";

function context() {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Brightway test", multiplayer: "off" }),
    content,
    player: { userId: "p1", isNew: true },
    seed: "park-test",
  });
  freshWorld(ctx).set("park.open", true);
  return ctx;
}

/** Put a structure on the park lot for free, the way the starter park is seeded. */
function put(ctx: ReturnType<typeof context>, kind: string, x: number, z: number): string {
  const id = placeFree(park.of(ctx), kind, cellFor(kind, x, z));
  if (id === null) throw new Error(`could not place ${kind}`);
  // Joined to the paths: these tests are about the ride and the guests, not the network.
  if (park.of(ctx).fact(`${id}.closed`) === true) park.of(ctx).set(`${id}.closed`, false);
  return id;
}

function onlyGuest() {
  const guest = [...session.guests.values()][0]!;
  return guest;
}

function fillNeeds(ctx: ReturnType<typeof context>, values: Record<string, number>): void {
  const agent = agentOf(onlyGuest(), ctx.rng);
  for (const [need, value] of Object.entries(values)) {
    agent.needs.refill(need, value - agent.needs.value(need));
  }
}

describe("brightway-park guest agents", () => {
  beforeEach(() => {
    resetSession();
    resetRides();
    clearAgents();
  });

  test("a hungry guest picks the food stall its own need and mood point at", () => {
    const ctx = context();
    const stall = put(ctx, "stall_food", 0, 8);
    seedGuests(ctx, 1);
    fillNeeds(ctx, { hunger: 5, thirst: 95, fun: 95, souvenir: 0, energy: 95 });

    tickGuests(ctx, 0.1, 0);

    expect(onlyGuest().targetId).toBe(stall);
    expect(liveAgent(onlyGuest().id)?.action().option).toBe("hunger");
  });

  test("an empty stall and a broke guest are not offered the stall at all", () => {
    const ctx = context();
    seedGuests(ctx, 1);
    const guest = onlyGuest();
    fillNeeds(ctx, { hunger: 5, thirst: 95, fun: 95, energy: 95 });

    const stall = put(ctx, "stall_food", 0, 8);
    const w = park.of(ctx);
    // Sold out: everything it stocks has sold since the last restock.
    w.change({ [`${stall}.sold`]: 1000 });
    expect(guestTargets(ctx, guest, 0, [0, 0, 0]).some((target) => target.target === stall)).toBe(false);

    w.change({ [`${stall}.sold`]: -1000 });
    expect(guestTargets(ctx, guest, 0, [0, 0, 0]).some((target) => target.target === stall)).toBe(true);
    guest.money = 2;
    expect(guestTargets(ctx, guest, 0, [0, 0, 0]).some((target) => target.target === stall)).toBe(false);
  });

  test("litter lowers a guest's mood until a janitor post is staffed", () => {
    const ctx = context();
    seedGuests(ctx, 1);
    fillNeeds(ctx, { hunger: 90, thirst: 90, fun: 90, energy: 90 });
    const w = park.of(ctx);
    tickGuests(ctx, 0.1, 0);
    const clean = liveAgent(onlyGuest().id)!.mood().score;

    w.change({ "park.litter": 80 });
    tickGuests(ctx, 0.1, 0);
    expect(liveAgent(onlyGuest().id)!.mood().score).toBeLessThan(clean);

    w.change({ "park.litter": -80 });
    tickGuests(ctx, 0.1, 0);
    expect(liveAgent(onlyGuest().id)!.mood().score).toBeGreaterThan(clean - 1);
  });

  test("eating fills the need and the mood follows it up", () => {
    const ctx = context();
    const stall = put(ctx, "stall_food", 0, 8);
    const cashBefore = park.of(ctx).num("park.cash");
    seedGuests(ctx, 1);
    fillNeeds(ctx, { hunger: 10, thirst: 90, fun: 80, energy: 90 });
    ctx.scene.entity.setPose(onlyGuest().id, { position: [0, 0, 14] });

    tickGuests(ctx, 0.1, 0);
    const hungry = liveAgent(onlyGuest().id)!.mood().score;

    for (let i = 0; i < 120; i += 1) tickGuests(ctx, 0.1, 0);

    const agent = liveAgent(onlyGuest().id)!;
    expect(agent.needs.value("hunger")).toBeGreaterThan(60);
    expect(agent.mood().score).toBeGreaterThan(hungry);
    expect(onlyGuest().visits).toBeGreaterThanOrEqual(1);
    // The sale is the world's: the stall's stock went down and the money went into the till.
    expect(park.of(ctx).num(`${stall}.sold`)).toBeGreaterThanOrEqual(1);
    expect(park.of(ctx).num("park.cash")).toBeGreaterThan(cashBefore);
  });

  test("a longer line is priced as a worse choice than an empty one", () => {
    const ctx = context();
    seedGuests(ctx, 1);
    const guest = onlyGuest();
    fillNeeds(ctx, { hunger: 95, thirst: 95, fun: 5, energy: 95 });

    const ride = put(ctx, "ride_carousel", 0, 20);
    syncRidePark(ctx);
    const empty = guestTargets(ctx, guest, 0, [0, 0, 0]).find((target) => target.target === ride)!;
    // Five real guests join the shared line; the cost a sixth guest sees comes from that line.
    for (let i = 0; i < 5; i += 1) joinRide(ride, `ghost#${i}`);
    const busy = guestTargets(ctx, guest, 0, [0, 0, 0]).find((target) => target.target === ride)!;

    expect(busy.cost!).toBeGreaterThan(empty.cost!);
  });

  test("a handyman walks the beat inside its patrol area", () => {
    const ctx = context();
    put(ctx, "staff_janitor", 12, -12);
    ctx.time.hydrate({ ...ctx.time.snapshot(), now: 60, paused: true });

    tickStaff(ctx, 0.1);
    expect(session.staff.size).toBe(1);
    const staff = [...session.staff.values()][0]!;
    const start = ctx.scene.entity.get(staff.id)!.position;

    for (let i = 0; i < 40; i += 1) tickStaff(ctx, 0.1);
    const moved = ctx.scene.entity.get(staff.id)!.position;
    expect(Math.hypot(moved[0] - start[0], moved[2] - start[2])).toBeGreaterThan(0.5);
    expect(Math.hypot(moved[0] - 12, moved[2] + 12)).toBeLessThanOrEqual(BUILDABLES.staff_janitor!.staff!.patrol);
  });

  test("each hire covers its own patrol area, and the player can widen it", () => {
    const ctx = context();
    const post = put(ctx, "staff_entertainer", 0, 0);
    tickStaff(ctx, 0.1);
    const w = park.of(ctx);
    const placed = w.instance(post)!.position!;
    const radius = BUILDABLES.staff_entertainer!.staff!.patrol;
    expect(staffCover(ctx, placed[0] + radius - 1, placed[1]).has("entertainer")).toBe(true);
    expect(staffCover(ctx, placed[0] + radius + 3, placed[1]).has("entertainer")).toBe(false);
    w.act("patrol_wider_staff_entertainer", post);
    expect(staffCover(ctx, placed[0] + radius + 3, placed[1]).has("entertainer")).toBe(true);
  });

  test("guests say what is wrong, and the park counts the complaints", () => {
    const ctx = context();
    seedGuests(ctx, 4);
    const [a, b, c] = [...session.guests.values()];
    think(a!, "too_expensive", "I'm not paying $9 for the Burger Stall", 10);
    think(b!, "queue_long", "The queue for the Carousel is too long", 10);
    think(c!, "great_ride", "The Carousel was great!", 10);
    // The same thought is not repeated within a few seconds.
    think(a!, "too_expensive", "again", 12);
    expect(a!.thoughts!.length).toBe(1);
    const tally = tallyThoughts(session.guests.values(), 12);
    expect(tally.complaintShare).toBeCloseTo(0.5, 5);
    expect(tally.top.map((entry) => entry.id).sort()).toEqual(["great_ride", "queue_long", "too_expensive"]);
    // Old thoughts stop counting.
    expect(tallyThoughts(session.guests.values(), 200).complaintShare).toBe(0);
  });

  test("demolishing the post sends its janitor home", () => {
    const ctx = context();
    const post = put(ctx, "staff_janitor", 12, -12);
    tickStaff(ctx, 0.1);
    const id = [...session.staff.values()][0]!.id;
    park.of(ctx).remove(post);
    tickStaff(ctx, 0.1);
    expect(session.staff.size).toBe(0);
    expect(ctx.scene.entity.get(id)).toBeNull();
  });
});
