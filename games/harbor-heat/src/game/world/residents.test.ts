import { describe, expect, test } from "bun:test";
import { createOffScreenWorld, type NearAgents, type NearSpawn, type NeedDefinition } from "@jgengine/core/gameplay";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { RESIDENTS, RESIDENT_PLACES, residentAt, residentMind, routineFor, tickResidents } from "./residents";

const PLACES = Object.fromEntries(RESIDENT_PLACES.map((place) => [place.id, place.position]));
const NEEDS: readonly NeedDefinition[] = [
  { id: "hunger", max: 100, rate: 0.05 },
  { id: "rest", max: 100, rate: 0.02 },
];

/** A near half that only records what it was told, so the split itself is what is under test. */
function stubNear() {
  const live = new Map<string, { spawn: NearSpawn; ticks: number }>();
  const promoted: string[] = [];
  const demoted: string[] = [];
  const near: NearAgents = {
    spawn(next) {
      promoted.push(next.id);
      live.set(next.id, { spawn: next, ticks: 0 });
    },
    despawn(id) {
      const entry = live.get(id);
      live.delete(id);
      demoted.push(id);
      return entry === undefined ? null : { position: entry.spawn.position, needs: entry.spawn.needs };
    },
    position(id) {
      return live.get(id)?.spawn.position ?? null;
    },
    needs(id) {
      return live.get(id)?.spawn.needs ?? null;
    },
    setGoal() {},
    tick() {
      for (const entry of live.values()) entry.ticks += 1;
    },
  };
  return { near, live, promoted, demoted };
}

describe("Mainsail residents", () => {
  test("every routine anchor is an authored resident place", () => {
    expect(RESIDENT_PLACES.length).toBeGreaterThanOrEqual(12);
    for (const spec of RESIDENTS) {
      for (const place of [spec.home, spec.work, spec.meal]) {
        expect(PLACES[place]).toBeDefined();
      }
    }
    // Every resident is a distinct person.
    expect(new Set(RESIDENTS.map((spec) => spec.id)).size).toBe(RESIDENTS.length);
    expect(new Set(RESIDENTS.map((spec) => spec.name)).size).toBe(RESIDENTS.length);
  });

  test("each resident's day resolves home, work and a meal inside one game day", () => {
    RESIDENTS.forEach((spec, index) => {
      const routine = routineFor(spec, index);
      expect(routine.cycleSeconds).toBe(720);
      expect(routine.stops).toHaveLength(5);
      // Walking must fit between the authored stops, or `resolveRoutine` would have thrown.
      for (let stop = 0; stop < routine.stops.length; stop += 1) {
        const current = routine.stops[stop]!;
        expect(current.departAt).toBeGreaterThanOrEqual(current.plannedArriveAt - 1e-6);
      }
      // Each stop is reached at its resolved arrival: home overnight, work, the meal, work, home.
      for (const stop of routine.stops) {
        const phase = routine.phaseAt(stop.arriveAt + 0.01);
        expect(phase.travelling).toBe(false);
        expect(phase.place).toBe(stop.place);
      }
      expect(routine.stops.map((stop) => stop.place)).toEqual([
        spec.home,
        spec.work,
        spec.meal,
        spec.work,
        spec.home,
      ]);
      expect(routine.stops[2]?.refill?.hunger).toBeGreaterThan(0);
    });
  });

  test("residents off the day's walking legs are travelling, not teleporting", () => {
    const routine = routineFor(RESIDENTS[0]!, 0);
    // Start of the workspace leg: the resident is on the way, between two authored places.
    const legStart = routine.stops[1]!.plannedArriveAt - 30;
    const phase = routine.phaseAt(legStart);
    expect(phase.travelling || phase.place === RESIDENTS[0]!.home).toBe(true);
    expect(phase.progress).toBeGreaterThanOrEqual(0);
    expect(phase.progress).toBeLessThanOrEqual(1);
  });

  test("only residents near the player are simulated; the rest stay cheap state", () => {
    const near = stubNear();
    const world = createOffScreenWorld({
      places: PLACES,
      needs: NEEDS,
      policy: { nearRadius: 60, farRadius: 88, switchBudget: 4 },
      near: near.near,
      residents: RESIDENTS.map((spec, index) => ({
        id: spec.id,
        home: PLACES[spec.home]!,
        routine: routineFor(spec, index),
      })),
    });
    const noon = 360;
    // The player stands far out at sea: nobody is near.
    world.tick(0.05, noon, [-400, 0, -400]);
    expect(world.stats().near).toBe(0);
    expect(near.promoted).toHaveLength(0);
    expect(world.stats().far).toBe(RESIDENTS.length);

    // Stand on the boardwalk: the residents working there are simulated, the rest stay cheap.
    world.tick(0.05, noon, PLACES.place_diner!);
    const stats = world.stats();
    expect(stats.near).toBeGreaterThan(0);
    expect(stats.near).toBeLessThan(RESIDENTS.length);
    expect(stats.far).toBe(RESIDENTS.length - stats.near);
    expect(near.promoted.length).toBe(stats.near);
    // A promoted resident arrives where the cheap state already had it, never at the origin.
    for (const entry of near.live.values()) {
      expect(Math.hypot(entry.spawn.position[0], entry.spawn.position[2])).toBeGreaterThan(1);
    }

    // Walk away: they go cheap again with the same identity, then come back near unchanged.
    const promotedId = near.promoted[0]!;
    const before = world.agent(promotedId);
    world.tick(0.05, noon + 0.1, [-400, 0, -400]);
    expect(world.stats().near).toBe(0);
    expect(near.demoted.length).toBe(stats.near);
    for (const id of near.demoted) expect(world.agent(id)?.mode).toBe("far");

    world.tick(0.05, noon + 0.2, PLACES.place_diner!);
    expect(world.agent(promotedId)?.mode).toBe("near");
    expect(world.agent(promotedId)?.place).toBe(before?.place ?? null);
    world.dispose();
  });

  test("a body left over from a restored world does not break a promotion", () => {
    const ctx = createGameContext({ definition: game.game, content, player: { userId: "resident-test", isNew: true } });
    loop.onInit(ctx);
    loop.onNewPlayer(ctx);
    // The whole-world save restores resident bodies; the schedule promotes them again on the first frame.
    ctx.scene.entity.spawn("ped_city", { id: `resident-${RESIDENTS[0]!.id}`, position: [0, 0, 0], role: "npc" });
    expect(() => tickResidents(ctx, 1 / 60)).not.toThrow();
  });

  test("a hungry resident near the player leaves its day for a meal and eats there", () => {
    const ctx = createGameContext({ definition: game.game, content, player: { userId: "resident-test", isNew: true } });
    loop.onInit(ctx);
    loop.onNewPlayer(ctx);
    tickResidents(ctx, 1 / 60);
    const near = RESIDENTS.map((spec) => spec.id).find((id) => residentAt(ctx, id)?.mode === "near");
    expect(near).toBeDefined();
    const mind = residentMind(ctx, near!)!;
    mind.agent.needs.refill("hunger", -mind.agent.needs.value("hunger") + 8);

    const spec = RESIDENTS.find((resident) => resident.id === near)!;
    const from = residentAt(ctx, near!)!.position;
    for (let i = 0; i < 240; i += 1) {
      ctx.time.advance(1 / 60);
      tickResidents(ctx, 1 / 60);
    }
    expect(residentMind(ctx, near!)?.action?.option).toBe("meal");
    expect(residentMind(ctx, near!)?.action?.target).toBe(spec.meal);

    // The body walks the excursion rather than staying on the day it authored.
    const moved = residentAt(ctx, near!)!.position;
    expect(Math.hypot(moved[0] - from[0], moved[2] - from[2])).toBeGreaterThan(0.1);

    // Standing at the meal place fills the belly, so the excursion ends and the day resumes.
    for (let i = 0; i < 60 * 60; i += 1) {
      ctx.time.advance(1 / 60);
      tickResidents(ctx, 1 / 60);
    }
    expect(residentMind(ctx, near!)!.agent.needs.value("hunger")).toBeGreaterThan(28);
  });
});
