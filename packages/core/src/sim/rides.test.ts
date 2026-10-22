import { describe, expect, test } from "bun:test";

import { gateTimingMs } from "../../../../scripts/timing-budget";
import { devtools } from "../devtools/devtools";
import { seededRng } from "../random/rng";
import { createNeedSet } from "./needs";
import {
  createRideChooser,
  createRideSystem,
  rideAppeal,
  rideChoiceCandidates,
  rideChoiceOptions,
  rideQueueCostWeight,
  type RideDefinition,
  type RideSystem,
  type RideTaste,
} from "./rides";

function ride(id: string, overrides: Partial<RideDefinition> = {}): RideDefinition {
  return {
    id,
    ratings: { excitement: 5, intensity: 5, nausea: 5 },
    capacity: 2,
    loadSeconds: 2,
    rideSeconds: 10,
    unloadSeconds: 2,
    ...overrides,
  };
}

const CAROUSEL = ride("carousel", { ratings: { excitement: 3, intensity: 2, nausea: 1 }, capacity: 8 });
const TOWER = ride("tower", { ratings: { excitement: 9, intensity: 9, nausea: 7 }, capacity: 8 });

/** Two guests with different taste: a family that stays inside its comfort, and a thrill seeker. */
const FAMILY: RideTaste = { intensityComfort: 3, nauseaComfort: 2, queueTolerance: 120 };
const THRILL: RideTaste = { intensityComfort: 9, nauseaComfort: 8, queueTolerance: 120 };

const FUN_NEEDS = (): ReturnType<typeof createNeedSet> => createNeedSet([{ id: "fun", max: 100, rate: 1, start: 60 }]);

/** A park whose two lines board 2 guests every 10 s and hold the given number of guests. */
function park(carouselAhead: number, towerAhead: number): RideSystem {
  const system = createRideSystem({ rides: [CAROUSEL, TOWER] });
  const fill = (id: string, ahead: number): void => {
    for (let i = 0; i < ahead; i += 1) system.join(id, `${id}-${i}`);
    system.queue(id)!.recordBoard(10, 2);
    system.queue(id)!.recordBoard(20, 2);
  };
  fill("carousel", carouselAhead);
  fill("tower", towerAhead);
  return system;
}

describe("createRideSystem", () => {
  test("a ride runs load, ride and unload, and never boards more than its capacity", () => {
    const system = createRideSystem({
      rides: [ride("carousel", { capacity: 3, loadSeconds: 2, rideSeconds: 4, unloadSeconds: 1 })],
    });
    for (let i = 0; i < 5; i += 1) system.join("carousel", `g${i}`);

    const boarded: string[] = [];
    const alighted: string[] = [];
    const phases: string[] = [];
    const sink = {
      onBoard: (_ride: string, guest: string) => void boarded.push(guest),
      onAlight: (_ride: string, guest: string) => void alighted.push(guest),
    };
    const step = (ticks: number): void => {
      for (let tick = 0; tick < ticks; tick += 1) {
        system.tick(0.5, sink);
        const view = system.ride("carousel")!;
        if (phases[phases.length - 1] !== view.phase) phases.push(view.phase);
        expect(view.riders).toBeLessThanOrEqual(3);
      }
    };

    // Load 2 s, ride 4 s, unload 1 s: the first batch is still riding at 6 s.
    step(12);
    expect(phases).toEqual(["loading", "riding"]);
    expect(boarded).toEqual(["g0", "g1", "g2"]);
    expect(system.ride("carousel")).toMatchObject({ phase: "riding", riders: 3 });
    expect(system.ride("carousel")!.queue.size).toBe(2);
    expect(system.ride("carousel")!.queue.wait.ahead).toBe(2);

    step(3);
    expect(phases).toEqual(["loading", "riding", "unloading", "idle"]);
    expect(alighted).toEqual(["g0", "g1", "g2"]);
    expect(system.ride("carousel")!.queue.size).toBe(2);

    step(25);
    expect(boarded).toEqual(["g0", "g1", "g2", "g3", "g4"]);
    expect(system.stats()).toMatchObject({ rides: 1, boarded: 5, cycles: 2, queued: 0, riders: 0 });
  });

  test("a guest leaving the line drops everyone's wait", () => {
    const system = park(5, 5);
    const before = system.waitSeconds("carousel");
    expect(system.leave("carousel", "carousel-0")).toBe(true);
    expect(system.waitSeconds("carousel")).toBeLessThan(before);
    expect(system.leave("carousel", "nobody")).toBe(false);
    expect(system.leave("ghost", "nobody")).toBe(false);
  });

  test("ratings come from ride data", () => {
    const system = createRideSystem({ rides: [ride("tower", { ratings: { excitement: 9, intensity: 8, nausea: 6 } })] });
    expect(system.ride("tower")!.ratings).toEqual({ excitement: 9, intensity: 8, nausea: 6 });
    expect(system.ride("ghost")).toBeNull();
    expect(system.waitSeconds("ghost")).toBe(0);
  });

  test("a breakdown takes the ride out, then it is repaired at a cost", () => {
    const rolls = [0, 0.9];
    const system = createRideSystem({
      rides: [
        ride("tower", {
          capacity: 2,
          loadSeconds: 1,
          rideSeconds: 2,
          unloadSeconds: 1,
          breakdown: { baseChance: 0.5, wearChance: 0, repairSeconds: 10, repairCost: 250, serviceCost: 40 },
        }),
      ],
      rng: () => rolls.shift() ?? 0.9,
    });
    system.join("tower", "g0");

    const events: string[] = [];
    const sink = {
      onBreak: () => void events.push("break"),
      onRepaired: (_ride: string, cost: number) => void events.push(`repair ${cost}`),
    };
    for (let tick = 0; tick < 20; tick += 1) system.tick(0.5, sink);

    expect(events).toEqual(["break"]);
    expect(system.ride("tower")!.phase).toBe("broken");
    expect(system.ride("tower")!.breakdowns).toBe(1);

    // While the ride is out, nothing boards and the line grows.
    system.join("tower", "g1");
    expect(system.stats()).toMatchObject({ broken: 1, queued: 1, riders: 0 });

    for (let tick = 0; tick < 22; tick += 1) system.tick(0.5, sink);
    expect(events).toEqual(["break", "repair 250"]);
    expect(system.ride("tower")!.phase).not.toBe("broken");
    expect(system.ride("tower")!.queue.size).toBe(0);
    expect(system.stats().spend).toBe(250);
  });

  test("wear raises the breakdown chance and servicing clears it", () => {
    const rolls = [0.15, 0.15, 0.99];
    const system = createRideSystem({
      rides: [
        ride("coaster", {
          capacity: 1,
          loadSeconds: 0,
          rideSeconds: 1,
          unloadSeconds: 0,
          breakdown: { baseChance: 0, wearChance: 0.1, repairSeconds: 1, repairCost: 5, serviceCost: 3 },
        }),
      ],
      rng: () => rolls.shift() ?? 0.99,
    });
    for (let i = 0; i < 3; i += 1) system.join("coaster", `g${i}`);
    for (let tick = 0; tick < 12; tick += 1) system.tick(0.5);

    // Cycle 1 at wear 1 risks 10% and survives 0.15; cycle 2 at wear 2 risks 20% and breaks.
    expect(system.ride("coaster")).toMatchObject({ cycles: 2, wear: 2, breakdowns: 1 });

    expect(system.service("coaster")).toEqual({ id: "coaster", cost: 3, wear: 2 });
    expect(system.ride("coaster")!.wear).toBe(0);
    expect(system.service("coaster")).toEqual({ id: "coaster", cost: 0, wear: 0 });
    expect(system.service("ghost")).toBeNull();
    expect(system.stats().spend).toBe(8);
  });

  test("retuning a ride's data changes what it is and what it costs", () => {
    const system = createRideSystem({ rides: [ride("tower", { breakdown: { baseChance: 0, wearChance: 0, repairSeconds: 5, repairCost: 9, serviceCost: 4 } })] });
    expect(system.retune("tower", { ratings: { intensity: 2, nausea: 1 }, capacity: 4, rideSeconds: 7 })).toBe(true);
    expect(system.ride("tower")).toMatchObject({ capacity: 4, ratings: { excitement: 5, intensity: 2, nausea: 1 } });
    expect(system.retune("tower", { breakdown: { repairCost: 12 } })).toBe(true);
    expect(system.retune("tower", { breakdown: null })).toBe(true);
    expect(system.definitions()[0]!.breakdown).toBeUndefined();
    expect(system.retune("ghost", { capacity: 2 })).toBe(false);
  });

  test("rejects content it cannot run", () => {
    expect(() => createRideSystem({ rides: [ride("a", { capacity: 0 })] })).toThrow("capacity of at least 1");
    expect(() => createRideSystem({ rides: [ride("a", { loadSeconds: -1 })] })).toThrow("non-negative loadSeconds");
    expect(() => createRideSystem({ rides: [ride("a", { ratings: { excitement: Number.NaN, intensity: 1, nausea: 1 } })] })).toThrow(
      "finite excitement rating",
    );
    expect(() => createRideSystem({ rides: [ride("a"), ride("a")] })).toThrow('duplicate ride id "a"');
    expect(() => createRideSystem({ rides: [ride("")] })).toThrow("non-empty id");
  });

  test("snapshot/restore round-trips a park mid-cycle and continues identically", () => {
    const build = (): RideSystem =>
      createRideSystem({
        rides: [
          ride("coaster", {
            capacity: 2,
            loadSeconds: 1,
            rideSeconds: 3,
            unloadSeconds: 1,
            breakdown: { baseChance: 0.3, wearChance: 0.1, repairSeconds: 4, repairCost: 20, serviceCost: 6 },
          }),
          ride("carousel", { capacity: 3, loadSeconds: 1, rideSeconds: 2, unloadSeconds: 1 }),
        ],
        rng: seededRng("park"),
      });

    const live = build();
    for (let i = 0; i < 6; i += 1) live.join("coaster", `c${i}`);
    for (let i = 0; i < 4; i += 1) live.join("carousel", `k${i}`);
    for (let tick = 0; tick < 60; tick += 1) live.tick(0.5);

    const saved = live.snapshot();
    const replay = build();
    replay.restore(saved);
    expect(replay.snapshot()).toEqual(saved);
    expect(replay.now()).toBe(live.now());
    expect(replay.revision()).toBeGreaterThan(0);

    for (let tick = 0; tick < 120; tick += 1) {
      live.tick(0.5);
      replay.tick(0.5);
    }
    expect(replay.snapshot()).toEqual(live.snapshot());
    expect(live.stats().breakdowns).toBeGreaterThan(0);
  });

  test("two parks with the same seed break down the same way", () => {
    const build = (): RideSystem =>
      createRideSystem({
        rides: [ride("coaster", { capacity: 2, breakdown: { baseChance: 0.4, wearChance: 0.1, repairSeconds: 3, repairCost: 10, serviceCost: 2 } })],
        rng: seededRng("same-park"),
      });
    const a = build();
    const b = build();
    for (let i = 0; i < 40; i += 1) {
      a.join("coaster", `g${i}`);
      b.join("coaster", `g${i}`);
    }
    for (let tick = 0; tick < 400; tick += 1) {
      a.tick(0.25);
      b.tick(0.25);
    }
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.stats().breakdowns).toBeGreaterThan(0);
  });

  test("the devtools probe shows the park and unregisters on dispose", () => {
    const system = createRideSystem({ rides: [CAROUSEL, TOWER], devtoolsName: "rides:brightway" });
    system.join("tower", "g0");
    expect(String(devtools.probes.read()["rides:brightway"])).toContain("2 rides");
    system.dispose();
    expect(devtools.probes.read()["rides:brightway"]).toBeUndefined();
  });
});

describe("ride choice", () => {
  test("two guests with different preferences pick different rides at the same queue lengths", () => {
    const system = park(5, 5);
    expect(system.waitSeconds("carousel")).toBeCloseTo(system.waitSeconds("tower"), 6);

    const needs = FUN_NEEDS();
    const family = createRideChooser({ system, taste: FAMILY, needs });
    const thrill = createRideChooser({ system, taste: THRILL, needs });

    expect(family.choose()).toBe("carousel");
    expect(thrill.choose()).toBe("tower");
    expect(family.scoreOf("carousel")).toBeGreaterThan(family.scoreOf("tower"));
    expect(thrill.scoreOf("tower")).toBeGreaterThan(thrill.scoreOf("carousel"));
  });

  test("a guest's stated queue tolerance decides how long a line may be", () => {
    const system = park(2, 40);
    const needs = FUN_NEEDS();
    const patient = createRideChooser({ system, taste: { ...THRILL, queueTolerance: 600 }, needs });
    const impatient = createRideChooser({ system, taste: { ...THRILL, queueTolerance: 12 }, needs });

    expect(system.waitSeconds("tower")).toBeGreaterThan(system.waitSeconds("carousel"));
    expect(patient.choose()).toBe("tower");
    expect(impatient.choose()).toBe("carousel");
  });

  test("the same guest on the same lines makes the same pick twice", () => {
    const system = park(5, 5);
    const needs = FUN_NEEDS();
    const first = createRideChooser({ system, taste: FAMILY, needs });
    const second = createRideChooser({ system, taste: FAMILY, needs });
    expect(first.choose()).toBe(second.choose());
    expect(first.choose()).toBe("carousel");
  });

  test("ride options are utility options, costed by their own line", () => {
    const system = park(4, 9);
    const options = rideChoiceOptions([CAROUSEL, TOWER], THRILL);
    expect(options.map((option) => option.id)).toEqual(["carousel", "tower"]);
    expect(options[0]!.base).toBeCloseTo(0.3, 6);
    expect(options[1]!.base).toBeCloseTo(0.9, 6);

    const candidates = rideChoiceCandidates(system);
    expect(candidates).toEqual([
      { option: "carousel", cost: system.waitSeconds("carousel") },
      { option: "tower", cost: system.waitSeconds("tower") },
    ]);
    const scratch = rideChoiceCandidates(system);
    expect(rideChoiceCandidates(system, scratch)).toBe(scratch);
    expect(rideQueueCostWeight({ ...THRILL, queueTolerance: 120 })).toBeCloseTo(1 / 120, 9);
  });

  test("a bored guest weighs a ride more than a guest whose fun is full", () => {
    const system = park(5, 5);
    const policy = { funNeed: "fun" };
    const bored = createNeedSet([{ id: "fun", max: 100, rate: 1, start: 10 }]);
    const sated = createNeedSet([{ id: "fun", max: 100, rate: 1, start: 100 }]);
    expect(rideChoiceOptions([CAROUSEL], THRILL, policy)[0]!.terms![0]!.need).toBe("fun");
    const boredChooser = createRideChooser({ system, taste: THRILL, needs: bored, policy });
    const satedChooser = createRideChooser({ system, taste: THRILL, needs: sated, policy });
    expect(boredChooser.scoreOf("tower")).toBeGreaterThan(satedChooser.scoreOf("tower"));
    expect(satedChooser.scoreOf("tower")).toBeCloseTo(0.9, 6);
    expect(boredChooser.scoreOf("tower")).toBeGreaterThan(1.5);
  });

  test("retuning a ride re-scores it without rebuilding the guest", () => {
    const system = park(5, 5);
    const needs = FUN_NEEDS();
    const family = createRideChooser({ system, taste: FAMILY, needs });
    expect(family.choose()).toBe("carousel");

    // D3.6's shape: the coaster's track changes its ratings.
    system.retune("tower", { ratings: { intensity: 2, nausea: 1 } });
    expect(family.choose()).toBe("tower");
    expect(family.scoreOf("tower")).toBeCloseTo(0.9, 6);
  });

  test("snapshot/restore round-trips the guest's taste and held pick", () => {
    const system = park(5, 5);
    const needs = FUN_NEEDS();
    const guest = createRideChooser({ system, taste: THRILL, needs, minHoldSeconds: 5 });
    expect(guest.choose()).toBe("tower");
    guest.setTaste({ ...THRILL, queueTolerance: 8 });

    const saved = guest.snapshot();
    expect(saved.taste.queueTolerance).toBe(8);

    const replay = createRideChooser({ system, taste: FAMILY, needs });
    replay.restore(saved);
    expect(replay.snapshot()).toEqual(saved);
    expect(replay.choose()).toBe("tower");
  });

  test("rejects a taste it cannot score", () => {
    const system = park(5, 5);
    const needs = FUN_NEEDS();
    expect(() => createRideChooser({ system, taste: { ...FAMILY, queueTolerance: Number.NaN }, needs })).toThrow(
      "non-negative queueTolerance",
    );
    const guest = createRideChooser({ system, taste: FAMILY, needs });
    expect(() => guest.setTaste({ ...FAMILY, intensityComfort: -1 })).toThrow("non-negative intensityComfort");
    expect(() => guest.scoreOf("ghost")).toThrow('unknown utility option "ghost"');
  });

  test("appeal rewards excitement and punishes force past the guest's comfort", () => {
    const range = { excitementMax: 10, intensityMax: 10, nauseaMax: 10 };
    expect(rideAppeal(TOWER.ratings, THRILL, range)).toBeCloseTo(0.9, 6);
    expect(rideAppeal(CAROUSEL.ratings, FAMILY, range)).toBeCloseTo(0.3, 6);
    expect(rideAppeal(CAROUSEL.ratings, THRILL, range)).toBeCloseTo(0.3, 6);
    // A guest comfortable with everything the park has keeps full appeal on the biggest ride.
    expect(rideAppeal(TOWER.ratings, { intensityComfort: 10, nauseaComfort: 10, queueTolerance: 60 }, range)).toBeCloseTo(0.9, 6);
    // A guest who can take no force or motion at all is pushed far off it.
    expect(rideAppeal(TOWER.ratings, { intensityComfort: 0, nauseaComfort: 0, queueTolerance: 60 }, range)).toBeLessThan(0.05);
  });
});

describe("ride tick cost", () => {
  test("a full park ticks in bounded time", () => {
    const rides: RideDefinition[] = [];
    for (let i = 0; i < 40; i += 1) {
      rides.push(ride(`ride-${i}`, { capacity: 12, loadSeconds: 1, rideSeconds: 8, unloadSeconds: 1 }));
    }
    const system = createRideSystem({ rides });
    for (const definition of rides) {
      for (let guest = 0; guest < 40; guest += 1) system.join(definition.id, `${definition.id}-${guest}`);
    }
    let arrivals = 0;
    const tick = (): void => {
      // A busy gate: every ride keeps receiving guests while its cycle boards.
      for (const definition of rides) system.join(definition.id, `late-${arrivals}-${definition.id}`);
      arrivals += 1;
      system.tick(1 / 60);
    };

    for (let warmup = 0; warmup < 20; warmup += 1) tick();
    const samples: number[] = [];
    for (let sample = 0; sample < 5; sample += 1) {
      const start = performance.now();
      for (let run = 0; run < 200; run += 1) tick();
      samples.push((performance.now() - start) / 200);
    }
    // 40 rides boarding 12 at a time with a growing line; fastest 0.02 ms idle (this machine, 2026-10-22).
    gateTimingMs("ride tick for 40 rides", samples, 0.5);
  });
});
