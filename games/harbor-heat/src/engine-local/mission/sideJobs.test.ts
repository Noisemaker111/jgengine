import { describe, expect, test } from "bun:test";

import {
  createSideJobs,
  sideJobDeadline,
  sideJobFare,
  sideJobStreakBonus,
  sideJobTip,
  type SideJobKindDef,
  type SideJobSpot,
  type SideJobsState,
} from "./sideJobs";

const SPOTS: SideJobSpot[] = [
  { id: "a", x: 0, z: 0, tags: ["kerb"] },
  { id: "b", x: 300, z: 0, tags: ["kerb"] },
  { id: "c", x: 0, z: 400, tags: ["kerb"] },
  { id: "d", x: 300, z: 400, tags: ["kerb"] },
];

const TAXI: SideJobKindDef = {
  id: "taxi",
  label: "Fare",
  pickupTag: "kerb",
  dropTag: "kerb",
  fare: { base: 40, perMetre: 0.5, perSecondLeft: 1, max: 600 },
  deadline: { speed: 10, slack: 10 },
  tip: { max: 0.2 },
  streak: { step: 0.1, max: 0.5, window: 30 },
  comfortLoss: ({ facts }) => (facts.crash === true ? 50 : 0),
  radius: 6,
};

function board(kinds: SideJobKindDef[] = [TAXI], seed: string | number = "test") {
  return createSideJobs({ kinds, spots: SPOTS, seed });
}

/** Drive to a spot and stop there for one tick. */
function arrive(jobs: ReturnType<typeof board>, spot: { x: number; z: number }, dt = 0.5, facts = {}) {
  return jobs.tick(dt, { position: { x: spot.x, z: spot.z }, speed: 0, facts });
}

describe("side-job math", () => {
  test("fare is base plus per-metre, clamped", () => {
    expect(sideJobFare({ base: 40, perMetre: 0.5 }, 300)).toBe(190);
    expect(sideJobFare({ base: 40, perMetre: 0.5, max: 100 }, 300)).toBe(100);
    expect(sideJobFare({ base: 0, perMetre: 0.1, min: 50 }, 10)).toBe(50);
  });

  test("deadline is slack plus distance over speed", () => {
    expect(sideJobDeadline({ speed: 10, slack: 10 }, 300)).toBe(40);
    expect(sideJobDeadline({ speed: 10, slack: 0, min: 60 }, 100)).toBe(60);
  });

  test("tip scales with comfort and stops under the floor", () => {
    expect(sideJobTip({ max: 0.2 }, 200, 100)).toBe(40);
    expect(sideJobTip({ max: 0.2 }, 200, 50)).toBe(20);
    expect(sideJobTip({ max: 0.2, minComfort: 60 }, 200, 50)).toBe(0);
  });

  test("streak bonus grows per job and caps", () => {
    const streak = { step: 0.1, max: 0.3, window: 30 };
    expect(sideJobStreakBonus(streak, 200, 0)).toBe(0);
    expect(sideJobStreakBonus(streak, 200, 2)).toBe(40);
    expect(sideJobStreakBonus(streak, 200, 9)).toBe(60);
  });
});

describe("side-job state machine", () => {
  test("offer → pickup → en route → paid, with fare, time bonus and tip", () => {
    const jobs = board();
    const [offered] = jobs.generate();
    expect(offered?.type).toBe("offered");
    const offer = jobs.offers()[0]!;
    expect(offer.drops).toHaveLength(1);
    expect(offer.distance).toBeGreaterThanOrEqual(60);
    expect(jobs.accept(offer.id)?.[0]?.type).toBe("accepted");
    expect(jobs.offers()).toHaveLength(0);
    expect(jobs.view()?.targetRole).toBe("pickup");
    expect(jobs.view()?.timeLeft).toBeNull();

    // Moving fast through the pickup does not board.
    jobs.tick(0.5, { position: offer.pickup, speed: 12 });
    expect(jobs.job()?.phase).toBe("pickup");
    expect(arrive(jobs, offer.pickup).map((e) => e.type)).toEqual(["boarded"]);
    expect(jobs.view()?.timeLeft).toBe(offer.seconds);
    expect(jobs.view()?.targetRole).toBe("dropoff");

    jobs.tick(5, { position: { x: 1000, z: 1000 }, speed: 10 });
    const events = arrive(jobs, offer.drops[0]!, 1);
    expect(events.map((e) => e.type)).toEqual(["leg", "paid"]);
    const receipt = jobs.receipt()!;
    expect(receipt.outcome).toBe("paid");
    expect(receipt.fare).toBe(offer.fare);
    expect(receipt.timeBonus).toBe(offer.seconds - 6);
    expect(receipt.tip).toBe(Math.round(offer.fare * 0.2));
    expect(receipt.streakBonus).toBe(0);
    expect(receipt.total).toBe(receipt.fare + receipt.timeBonus + receipt.tip);
    expect(receipt.streak).toBe(1);
    expect(jobs.job()).toBeNull();
  });

  test("a crash costs the tip through the game's comfort rule", () => {
    const jobs = board();
    jobs.generate();
    const offer = jobs.offers()[0]!;
    jobs.accept(offer.id);
    arrive(jobs, offer.pickup);
    jobs.tick(1, { position: { x: 1000, z: 1000 }, speed: 20, facts: { crash: true } });
    jobs.tick(1, { position: { x: 1000, z: 1000 }, speed: 20, facts: { crash: true } });
    expect(jobs.view()?.comfort).toBe(0);
    arrive(jobs, offer.drops[0]!);
    expect(jobs.receipt()?.tip).toBe(0);
    expect(jobs.receipt()?.outcome).toBe("paid");
  });

  test("running out the clock fails late and breaks the streak", () => {
    const jobs = board();
    jobs.generate();
    const offer = jobs.offers()[0]!;
    jobs.accept(offer.id);
    arrive(jobs, offer.pickup);
    const events = jobs.tick(offer.seconds + 1, { position: { x: 999, z: 999 }, speed: 10 });
    expect(events[0]?.type).toBe("failed");
    expect(jobs.receipt()).toMatchObject({ outcome: "failed", reason: "late", total: 0, streak: 0 });
  });

  test("fragile cargo spoils at its comfort floor", () => {
    const jobs = board([{ ...TAXI, id: "flowers", failAtComfort: 40, comfortLoss: ({ speed, dt }) => Math.max(0, speed - 15) * dt }]);
    jobs.generate();
    const offer = jobs.offers()[0]!;
    jobs.accept(offer.id);
    arrive(jobs, offer.pickup);
    jobs.tick(2, { position: { x: 999, z: 999 }, speed: 30 });
    expect(jobs.view()?.comfort).toBe(70);
    jobs.tick(2, { position: { x: 999, z: 999 }, speed: 30 });
    expect(jobs.receipt()).toMatchObject({ outcome: "failed", reason: "spoiled" });
  });

  test("the game can fail a job with its own reason", () => {
    const jobs = board();
    jobs.generate();
    jobs.accept(jobs.offers()[0]!.id);
    expect(jobs.fail("busted")[0]?.type).toBe("failed");
    expect(jobs.receipt()?.reason).toBe("busted");
    expect(jobs.fail("busted")).toEqual([]);
  });

  test("a pickup clock fails a job never collected", () => {
    const jobs = board([{ ...TAXI, deadline: { ...TAXI.deadline, pickup: 20 } }]);
    jobs.generate();
    jobs.accept(jobs.offers()[0]!.id);
    expect(jobs.view()?.timeLeft).toBe(20);
    jobs.tick(21, { position: { x: 999, z: 999 } });
    expect(jobs.receipt()?.reason).toBe("late");
  });

  test("multi-drop routes pay once, after the last drop", () => {
    const jobs = board([{ ...TAXI, id: "route", drops: 3 }]);
    jobs.generate();
    const offer = jobs.offers()[0]!;
    expect(new Set([offer.pickup.id, ...offer.drops.map((d) => d.id)]).size).toBe(4);
    jobs.accept(offer.id);
    arrive(jobs, offer.pickup);
    expect(arrive(jobs, offer.drops[0]!).map((e) => e.type)).toEqual(["leg"]);
    expect(jobs.view()?.leg).toBe(2);
    arrive(jobs, offer.drops[1]!);
    expect(arrive(jobs, offer.drops[2]!).map((e) => e.type)).toEqual(["leg", "paid"]);
  });

  test("offers expire and cooldowns hold the next one back", () => {
    const jobs = board([{ ...TAXI, offerTtl: 10, cooldown: 30 }]);
    jobs.generate();
    expect(jobs.generate()).toEqual([]);
    expect(jobs.tick(11, { position: null }).map((e) => e.type)).toEqual(["expired"]);
    jobs.generate();
    jobs.accept(jobs.offers()[0]!.id);
    jobs.fail("abandoned");
    expect(jobs.generate()).toEqual([]);
    jobs.tick(31, { position: null });
    expect(jobs.generate()).toHaveLength(1);
  });

  test("near limits pickups to a ring around the player", () => {
    const jobs = board([{ ...TAXI, maxOffers: 4 }]);
    jobs.generate({ near: { at: { x: 0, z: 0 }, radius: 350, min: 10 }, count: 4 });
    expect(jobs.offers().map((o) => o.pickup.id)).toEqual(["b"]);
  });
});

describe("side-job streaks", () => {
  function runOne(jobs: ReturnType<typeof board>) {
    jobs.generate();
    const offer = jobs.offers()[0]!;
    jobs.accept(offer.id);
    arrive(jobs, offer.pickup);
    arrive(jobs, offer.drops[0]!);
    return jobs.receipt()!;
  }

  test("back-to-back fares raise the bonus; a slow return resets it", () => {
    const jobs = board();
    expect(runOne(jobs).streakBonus).toBe(0);
    const second = runOne(jobs);
    expect(second.streakBonus).toBe(Math.round(second.fare * 0.1));
    expect(second.streak).toBe(2);
    const third = runOne(jobs);
    expect(third.streakBonus).toBe(Math.round(third.fare * 0.2));
    jobs.tick(31, { position: null });
    const fourth = runOne(jobs);
    expect(fourth.streakBonus).toBe(0);
    expect(fourth.streak).toBe(1);
  });
});

describe("side-job races", () => {
  const RACE: SideJobKindDef = {
    id: "street",
    label: "Street race",
    routes: [{ id: "loop", label: "Harbor sprint", points: [SPOTS[0]!, SPOTS[1]!, SPOTS[3]!] }],
    fare: { base: 0, perMetre: 0 },
    deadline: { speed: 10, slack: 30 },
    wager: { stake: 100, payouts: [3, 1] },
    race: { rivals: 2, gateRadius: 10 },
  };

  test("a race runs its drops as checkpoints and pays the purse by place", () => {
    const jobs = board([RACE]);
    jobs.generate();
    const offer = jobs.offers()[0]!;
    expect(offer).toMatchObject({ label: "Harbor sprint", stake: 100, routeId: "loop" });
    jobs.accept(offer.id);
    const events = arrive(jobs, offer.pickup);
    const started = events.find((e) => e.type === "race-started");
    expect(started?.type === "race-started" ? started.rivals : []).toEqual([`${offer.id}:rival:0`, `${offer.id}:rival:1`]);
    const [r0, r1] = jobs.view()!.rivals;
    const idle = { [r0!]: [-500, 0, -500] as const, [r1!]: [-500, 0, -500] as const };
    jobs.tick(1, { position: { x: 300, z: 0 }, speed: 30, racers: idle });
    expect(jobs.view()?.targetRole).toBe("finish");
    expect(jobs.view()?.place).toBe(1);
    const done = jobs.tick(1, { position: { x: 300, z: 400 }, speed: 30, racers: idle });
    expect(done[0]?.type).toBe("paid");
    expect(jobs.receipt()).toMatchObject({ place: 1, purse: 300, total: 300 });
  });

  test("placing out of the money fails as placed", () => {
    const jobs = board([{ ...RACE, wager: { stake: 100, payouts: [3] } }]);
    jobs.generate();
    const offer = jobs.offers()[0]!;
    jobs.accept(offer.id);
    arrive(jobs, offer.pickup);
    const [r0, r1] = jobs.view()!.rivals;
    jobs.tick(1, { position: { x: 0, z: 0 }, speed: 30, racers: { [r0!]: [300, 0, 0], [r1!]: [-500, 0, -500] } });
    jobs.tick(1, { position: { x: 0, z: 0 }, speed: 30, racers: { [r0!]: [300, 0, 400], [r1!]: [-500, 0, -500] } });
    jobs.tick(1, { position: { x: 300, z: 0 }, speed: 30, racers: {} });
    jobs.tick(1, { position: { x: 300, z: 400 }, speed: 30, racers: {} });
    expect(jobs.receipt()).toMatchObject({ outcome: "failed", reason: "placed", place: 2, purse: 0 });
  });
});

describe("side-job determinism and snapshots", () => {
  test("the same seed and calls draw the same offers", () => {
    const draw = (seed: string) => {
      const jobs = board([{ ...TAXI, maxOffers: 3 }], seed);
      jobs.generate({ count: 3 });
      return jobs.offers().map((o) => `${o.pickup.id}>${o.drops[0]!.id}`);
    };
    expect(draw("x")).toEqual(draw("x"));
    const seeds = ["x", "y", "z", "w"].map(draw).map((d) => d.join());
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  test("snapshot/restore resumes a fare mid-route and the offer stream", () => {
    const jobs = board([{ ...TAXI, maxOffers: 3 }]);
    jobs.generate();
    const offer = jobs.offers()[0]!;
    jobs.accept(offer.id);
    arrive(jobs, offer.pickup);
    jobs.tick(3, { position: { x: 999, z: 999 }, speed: 10, facts: { crash: true } });
    const saved: SideJobsState = JSON.parse(JSON.stringify(jobs.snapshot()));

    const copy = board([{ ...TAXI, maxOffers: 3 }], "other-seed");
    copy.restore(saved);
    expect(copy.view()).toMatchObject({ phase: "en-route", comfort: 50, timeLeft: offer.seconds - 3 });
    jobs.generate();
    copy.generate();
    expect(copy.offers()).toEqual(jobs.offers());
    arrive(copy, offer.drops[0]!);
    expect(copy.receipt()?.tip).toBe(Math.round(offer.fare * 0.2 * 0.5));
  });

  test("a race restored mid-run returns to its start line", () => {
    const jobs = board([{ id: "street", label: "Race", routes: [{ id: "r", points: [SPOTS[0]!, SPOTS[1]!] }], fare: { base: 0, perMetre: 0 }, deadline: { speed: 10 }, race: { rivals: 1 } }]);
    jobs.generate();
    jobs.accept(jobs.offers()[0]!.id);
    arrive(jobs, SPOTS[0]!);
    expect(jobs.job()?.racing).toBe(true);
    jobs.restore(jobs.snapshot());
    expect(jobs.job()).toMatchObject({ phase: "pickup", racing: false, leg: 0 });
  });

  test("persistence loads at creation and saves on changes", () => {
    const writes: SideJobsState[] = [];
    const jobs = createSideJobs({ kinds: [TAXI], spots: SPOTS, persist: { save: (s) => writes.push(s) } });
    jobs.generate();
    jobs.accept(jobs.offers()[0]!.id);
    expect(writes).toHaveLength(2);
    jobs.tick(0.1, { position: { x: 9999, z: 9999 }, speed: 10 });
    expect(writes).toHaveLength(2);
    const loaded = createSideJobs({ kinds: [TAXI], spots: SPOTS, persist: { load: () => writes.at(-1)!, save: () => {} } });
    expect(loaded.job()?.phase).toBe("pickup");
  });

  test("retune changes a kind's numbers in play", () => {
    const jobs = board();
    jobs.retune("taxi", { fare: { base: 1000, perMetre: 0 } });
    jobs.generate();
    expect(jobs.offers()[0]!.fare).toBe(1000);
    expect(() => board([TAXI, TAXI])).toThrow(/declared twice/);
  });
});
