import { beforeEach, describe, expect, test } from "bun:test";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "./content";
import { agentOf } from "./agents";
import { resetSession, session } from "./session";
import { tickRidePark, tickGuests, seedGuests } from "./sim/guests";
import { fixRide, joinRide, resetRides, rideBoard, rideDefinition, coasterCircuit, rideSystem, rideView, serviceRide, syncRidePark } from "./rides";
import { cellFor, freshWorld, park, parkObject, placeFree } from "./park";

function context() {
  return createGameContext({
    definition: defineGameDefinition({ name: "Brightway ride test", multiplayer: "off" }),
    content,
    player: { userId: "p1", isNew: true },
    seed: "ride-test",
  });
}

type Ctx = ReturnType<typeof context>;

/** Put a structure on the park lot for free, the way the starter park is seeded. */
function put(ctx: Ctx, kind: string, x: number, z: number): string {
  const id = placeFree(park.of(ctx), kind, cellFor(kind, x, z));
  if (id === null) throw new Error(`could not place ${kind} at ${x},${z}`);
  // Joined to the paths: these tests are about the ride and the guests, not the network.
  if (park.of(ctx).fact(`${id}.closed`) === true) park.of(ctx).set(`${id}.closed`, false);
  return id;
}

function open(): { ctx: Ctx; ride: string } {
  const ctx = context();
  freshWorld(ctx).set("park.open", true);
  return { ctx, ride: put(ctx, "ride_carousel", 0, 20) };
}

describe("brightway-park rides on the shared ride sim", () => {
  beforeEach(() => {
    resetSession();
    resetRides();
  });

  test("a breakdown takes the ride offline, keeps its line, and the park's read says so", () => {
    const { ctx, ride } = open();
    // A deterministic rng of 0 breaks the ride on its first completed cycle.
    syncRidePark(ctx, () => 0);
    for (let i = 0; i < 18; i += 1) joinRide(ride, `guest#${i}`);

    // Board, ride, unload: the carousel's own 21-second cycle.
    for (let i = 0; i < 300; i += 1) tickRidePark(ctx, 0.1);

    const view = rideView(ride)!;
    expect(view.phase).toBe("broken");
    expect(view.breakdowns).toBe(1);
    // Twelve boarded and are unloaded, six are still waiting, and nothing boards while it is down.
    expect(view.queue.size).toBe(6);
    expect(view.queue.wait.seconds).toBeGreaterThan(0);
    expect(rideBoard()).toMatchObject({ rides: 1, online: 0, broken: 1, queued: 6 });
  });

  test("the sim holds a broken ride down until the crew's order lands, then it takes its line", () => {
    const { ctx, ride } = open();
    syncRidePark(ctx, () => 0);
    for (let i = 0; i < 16; i += 1) joinRide(ride, `guest#${i}`);
    for (let i = 0; i < 300; i += 1) tickRidePark(ctx, 0.1);
    const broken = rideView(ride)!;
    expect(broken.phase).toBe("broken");

    // The world's crew does the repair, not the sim's own timer.
    tickRidePark(ctx, 600);
    expect(rideView(ride)!.phase).toBe("broken");
    fixRide(ride);
    tickRidePark(ctx, 0.1);
    const repaired = rideView(ride)!;
    expect(repaired.phase).not.toBe("broken");
    expect(repaired.breakdowns).toBe(1);
    // The head of the line boarded as soon as it was back up.
    expect(repaired.queue.size).toBeLessThan(broken.queue.size);
  });

  test("a guest that reaches a ride joins its line, boards, and pays its ticket", () => {
    const { ctx, ride } = open();
    syncRidePark(ctx, () => 1);
    seedGuests(ctx, 1);
    const guest = [...session.guests.values()][0]!;
    const agent = agentOf(guest, ctx.rng);
    agent.needs.refill("fun", -agent.needs.value("fun"));
    ctx.scene.entity.setPose(guest.id, { position: [0, 0, 56] });
    const cashBefore = park.of(ctx).num("park.cash");

    for (let i = 0; i < 900; i += 1) {
      tickRidePark(ctx, 0.1);
      tickGuests(ctx, 0.1, 14);
    }

    const view = rideView(ride)!;
    expect(view.cycles).toBeGreaterThan(0);
    expect(guest.visits).toBeGreaterThan(0);
    expect(park.of(ctx).num("park.cash")).toBeGreaterThan(cashBefore);
  });

  test("servicing a ride clears the wear a breakdown curve reads", () => {
    const { ctx, ride } = open();
    // An rng of 1 never breaks, so the ride just accumulates cycles.
    syncRidePark(ctx, () => 1);
    for (let i = 0; i < 4; i += 1) joinRide(ride, `guest#${i}`);
    for (let i = 0; i < 200; i += 1) tickRidePark(ctx, 0.2);
    const worn = rideView(ride)!;
    expect(worn.wear).toBeGreaterThan(0);

    const service = serviceRide(ride)!;
    expect(service.cost).toBeGreaterThan(0);
    expect(service.wear).toBe(worn.wear);
    expect(rideView(ride)!.wear).toBe(0);
  });

  test("a build or a demolition re-syncs the sim and keeps surviving ride state", () => {    const { ctx, ride } = open();
    syncRidePark(ctx, () => 1);
    for (let i = 0; i < 3; i += 1) joinRide(ride, `guest#${i}`);
    for (let i = 0; i < 30; i += 1) tickRidePark(ctx, 0.2);
    const before = rideView(ride)!;

    const ferris = put(ctx, "ride_carousel", 24, -24);
    syncRidePark(ctx, () => 1);
    expect(rideSystem().stats().rides).toBe(2);
    const after = rideView(ride)!;
    expect(after.cycles).toBe(before.cycles);
    expect(after.wear).toBe(before.wear);

    park.of(ctx).remove(ferris);
    syncRidePark(ctx, () => 1);
    expect(rideSystem().stats().rides).toBe(1);
  });

  test("the train runs the track's own lap and is back at the station when it ends", () => {
    const ctx = context();
    freshWorld(ctx);
    const coaster = put(ctx, "ride_coaster", -8, 4);
    // A 5 x 3 ring of track beside the station: 12 pieces, one closed lap.
    for (let i = 0; i < 5; i += 1) put(ctx, "track_piece", i * 4, 0);
    for (let i = 1; i < 3; i += 1) put(ctx, "track_piece", 16, i * 4);
    for (let i = 3; i >= 0; i -= 1) put(ctx, "track_piece", i * 4, 8);
    put(ctx, "track_piece", 0, 4);
    syncRidePark(ctx, () => 1);
    const circuit = coasterCircuit(ctx);
    expect(circuit.closed).toBe(true);
    expect(circuit.length).toBe(2 * (5 + 3) * 4 - 16);

    // The ride sim runs the lap the track measured, not a number in the catalog.
    const definition = rideDefinition(parkObject(ctx, coaster)!, circuit);
    expect(definition.rideSeconds).toBe(Math.max(4, circuit.lapSeconds));

    for (let i = 0; i < 4; i += 1) joinRide(coaster, `guest#${i}`);
    const lap = Math.max(4, circuit.lapSeconds);
    const fractions: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      tickRidePark(ctx, 0.2);
      const view = rideView(coaster)!;
      if (view.phase === "riding") fractions.push(1 - view.phaseSeconds / lap);
    }
    // It leaves the station, gets most of the way round, and the last lap fraction wraps home.
    expect(fractions[0]!).toBeLessThan(0.2);
    expect(Math.max(...fractions)).toBeGreaterThan(0.85);
    expect(rideView(coaster)!.cycles).toBeGreaterThan(0);
  });
});
