import { describe, expect, test } from "bun:test";

import {
  advanceInterestGate,
  createInterestCensus,
  createInterestGateState,
  interestPhase,
  type InterestGateState,
  type InterestSchedulerConfig,
} from "@jgengine/core/ai/interestScheduler";

describe("interest scheduler sleep/wake", () => {
  test("wakes when proximity crosses wakeRadius and sleeps past sleepRadius (hysteresis)", () => {
    const config: InterestSchedulerConfig = { wakeRadius: 20, sleepRadius: 30 };
    const state = createInterestGateState(config);
    expect(state.state).toBe("dormant");

    // Between wake and sleep radius while dormant → stays dormant (hysteresis band).
    let step = advanceInterestGate(state, config, 0.1, { proximity: 25 });
    expect(step.state).toBe("dormant");
    expect(step.active).toBe(false);

    // Inside wakeRadius → wakes and runs immediately.
    step = advanceInterestGate(state, config, 0.1, { proximity: 18 });
    expect(step.state).toBe("active");
    expect(step.woke).toBe(true);
    expect(step.active).toBe(true);

    // Back into the band while active → stays active (does not sleep until past sleepRadius).
    step = advanceInterestGate(state, config, 0.1, { proximity: 25 });
    expect(step.state).toBe("active");

    // Past sleepRadius → sleeps and skips work.
    step = advanceInterestGate(state, config, 0.1, { proximity: 31 });
    expect(step.state).toBe("dormant");
    expect(step.slept).toBe(true);
    expect(step.active).toBe(false);
  });

  test("dormant agents skip expensive ticks (active stays false while far)", () => {
    const config: InterestSchedulerConfig = { wakeRadius: 10 };
    const state = createInterestGateState(config);
    let activeCount = 0;
    for (let i = 0; i < 100; i += 1) {
      if (advanceInterestGate(state, config, 0.1, { proximity: 500 }).active) activeCount += 1;
    }
    expect(activeCount).toBe(0);
    expect(state.state).toBe("dormant");
  });

  test("explicit wake signal forces active regardless of proximity, held by stayAwakeSeconds", () => {
    const config: InterestSchedulerConfig = { wakeRadius: 10, stayAwakeSeconds: 1 };
    const state = createInterestGateState(config);

    // Damage/event wakes a far agent.
    let step = advanceInterestGate(state, config, 0.1, { proximity: 999, wake: true });
    expect(step.state).toBe("active");
    expect(step.active).toBe(true);

    // Stays awake for the hold window even though it is far.
    step = advanceInterestGate(state, config, 0.5, { proximity: 999 });
    expect(step.state).toBe("active");

    // This tick drains the remaining hold (0.4s) to zero — still counted as awake.
    step = advanceInterestGate(state, config, 1.0, { proximity: 999 });
    expect(step.state).toBe("active");

    // The first tick after the hold is fully spent with no proximity interest → sleeps.
    step = advanceInterestGate(state, config, 0.1, { proximity: 999 });
    expect(step.state).toBe("dormant");
  });

  test("null proximity holds current state", () => {
    const config: InterestSchedulerConfig = { wakeRadius: 10 };
    const state = createInterestGateState(config);
    state.state = "active";
    expect(advanceInterestGate(state, config, 0.1, { proximity: null }).state).toBe("active");
  });
});

describe("interest scheduler cadence", () => {
  test("activeInterval throttles active ticks", () => {
    const config: InterestSchedulerConfig = { wakeRadius: 100, activeInterval: 1 };
    const state = createInterestGateState(config);
    // First tick wakes and fires immediately.
    expect(advanceInterestGate(state, config, 0.25, { proximity: 5 }).active).toBe(true);
    // Then throttled: no fire until a full second has accrued.
    let fires = 0;
    for (let i = 0; i < 4; i += 1) {
      if (advanceInterestGate(state, config, 0.25, { proximity: 5 }).active) fires += 1;
    }
    expect(fires).toBe(1); // exactly one fire after ~1s of accrual
  });

  test("distance tiers pick coarser cadence for farther agents", () => {
    const config: InterestSchedulerConfig = {
      wakeRadius: 100,
      tiers: [
        { within: 10, interval: 0 }, // close: every tick
        { within: 100, interval: 1 }, // far-but-awake: once a second
      ],
    };
    const near = createInterestGateState(config);
    const far = createInterestGateState(config);
    let nearFires = 0;
    let farFires = 0;
    // prime both awake
    advanceInterestGate(near, config, 0.1, { proximity: 5 });
    advanceInterestGate(far, config, 0.1, { proximity: 80 });
    for (let i = 0; i < 10; i += 1) {
      if (advanceInterestGate(near, config, 0.2, { proximity: 5 }).active) nearFires += 1;
      if (advanceInterestGate(far, config, 0.2, { proximity: 80 }).active) farFires += 1;
    }
    expect(nearFires).toBe(10); // interval 0 → every tick
    expect(farFires).toBeLessThan(nearFires); // throttled by the 1s tier
  });

  test("deterministic staggering spreads first-fire across sibling gates", () => {
    const config: InterestSchedulerConfig = { wakeRadius: 100, activeInterval: 1 };
    const a = createInterestGateState(config, interestPhase("mob-a"));
    const b = createInterestGateState(config, interestPhase("mob-b"));
    // Different phases → different initial clocks → they do not fire in lockstep.
    expect(a.phase).not.toBe(b.phase);
    expect(a.clock).not.toBe(b.clock);
    // interestPhase is stable and in [0,1).
    expect(interestPhase("mob-a")).toBe(interestPhase("mob-a"));
    expect(a.phase).toBeGreaterThanOrEqual(0);
    expect(a.phase).toBeLessThan(1);
  });
});

describe("interest scheduler serialization", () => {
  test("gate state round-trips through JSON and continues identically", () => {
    const config: InterestSchedulerConfig = { wakeRadius: 20, sleepRadius: 30, activeInterval: 0.5 };
    const live = createInterestGateState(config, 0.3);
    const twin = createInterestGateState(config, 0.3);

    const inputs = [
      { proximity: 15 },
      { proximity: 15 },
      { proximity: 40 },
      { proximity: 5, wake: true },
      { proximity: 5 },
    ];
    for (const input of inputs) {
      advanceInterestGate(live, config, 0.2, input);
      // Round-trip the twin every tick.
      const serialized: InterestGateState = JSON.parse(JSON.stringify(twin));
      Object.assign(twin, serialized);
      advanceInterestGate(twin, config, 0.2, input);
      expect(twin).toEqual(live);
    }
  });
});

describe("interest census metrics", () => {
  test("tallies active vs dormant without a separate scan", () => {
    const config: InterestSchedulerConfig = { wakeRadius: 10 };
    const gates: InterestGateState[] = [];
    for (let i = 0; i < 5; i += 1) gates.push(createInterestGateState(config));
    // Wake the first two.
    advanceInterestGate(gates[0]!, config, 0.1, { proximity: 2 });
    advanceInterestGate(gates[1]!, config, 0.1, { proximity: 2 });
    for (let i = 2; i < 5; i += 1) advanceInterestGate(gates[i]!, config, 0.1, { proximity: 500 });

    const census = createInterestCensus();
    for (const gate of gates) census.record(gate);
    expect(census.snapshot()).toEqual({ active: 2, dormant: 3, total: 5 });

    census.reset();
    expect(census.snapshot()).toEqual({ active: 0, dormant: 0, total: 0 });
  });
});
