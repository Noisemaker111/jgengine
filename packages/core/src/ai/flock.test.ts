import { describe, expect, test } from "bun:test";

import { gateTimingMs } from "../../../../scripts/timing-budget";
import {
  flockSteer,
  stepFlock,
  type FlockAgent,
  type FlockConfig,
  type FlockStepAgent,
  type FlockVec3,
} from "@jgengine/core/ai/flock";

describe("flockSteer — separation", () => {
  test("pushes two close agents apart, away from the other agent", () => {
    const agent: FlockAgent = { position: [0, 0, 0], velocity: [0, 0, 0] };
    const other: FlockAgent = { position: [1, 0, 0], velocity: [0, 0, 0] };
    const config: FlockConfig = {
      maxSpeed: 5,
      separationRadius: 3,
      neighborRadius: 10,
      cohesionWeight: 0,
      alignmentWeight: 0,
    };
    const steer = flockSteer(agent, [agent, other], config);
    expect(steer[0]).toBeLessThan(0);
    expect(steer[1]).toBe(0);
    expect(steer[2]).toBe(0);
  });
});

describe("flockSteer — cohesion", () => {
  test("pulls a distant-but-in-neighborRadius agent toward the group", () => {
    const agent: FlockAgent = { position: [0, 0, 0], velocity: [0, 0, 0] };
    const other: FlockAgent = { position: [8, 0, 0], velocity: [0, 0, 0] };
    const config: FlockConfig = { maxSpeed: 5, separationRadius: 1, neighborRadius: 10, seekWeight: 0 };
    const steer = flockSteer(agent, [agent, other], config);
    expect(steer[0]).toBeGreaterThan(0);
  });
});

describe("flockSteer — seek", () => {
  test("steers toward the target when alone", () => {
    const agent: FlockAgent = { position: [0, 0, 0], velocity: [0, 0, 0] };
    const config: FlockConfig = { maxSpeed: 5, separationRadius: 1, neighborRadius: 10 };
    const steer = flockSteer(agent, [agent], config, [10, 0, 0]);
    expect(steer[0]).toBeGreaterThan(0);
    expect(steer[1]).toBe(0);
    expect(steer[2]).toBe(0);
  });
});

describe("flockSteer — straggler rescue", () => {
  test("a straggler beyond stragglerRadius gets a stronger centroid pull than a non-straggler", () => {
    const agent: FlockAgent = { position: [0, 0, 0], velocity: [0, 0, 0] };
    const neighbor: FlockAgent = { position: [10, 0, 0], velocity: [0, 0, 0] };
    const target: readonly [number, number, number] = [0, 0, 100];
    const baseConfig = {
      maxSpeed: 5,
      accel: 10,
      separationRadius: 0.01,
      neighborRadius: 50,
      alignmentWeight: 0,
      cohesionWeight: 1,
      seekWeight: 1,
    };

    const nonStragglerSteer = flockSteer(agent, [agent, neighbor], baseConfig, target);
    const stragglerSteer = flockSteer(
      agent,
      [agent, neighbor],
      { ...baseConfig, stragglerRadius: 5, stragglerBoost: 3 },
      target,
    );

    expect(stragglerSteer[0]).toBeGreaterThan(nonStragglerSteer[0]);
  });
});

describe("stepFlock", () => {
  test("integrates velocity into position and clamps speed to maxSpeed", () => {
    const agents: FlockStepAgent[] = [
      { position: [0, 0, 0], velocity: [0, 0, 0] },
      { position: [0.5, 0, 0], velocity: [0, 0, 0] },
    ];
    const config: FlockConfig = {
      maxSpeed: 2,
      accel: 1000,
      separationRadius: 3,
      neighborRadius: 10,
      cohesionWeight: 0,
      alignmentWeight: 0,
    };
    const dt = 1 / 60;
    stepFlock(agents, config, dt);

    const agent0 = agents[0]!;
    const speed = Math.hypot(agent0.velocity[0], agent0.velocity[1], agent0.velocity[2]);
    expect(speed).toBeCloseTo(2, 5);
    expect(agent0.position[0]).toBeCloseTo(agent0.velocity[0] * dt, 5);
  });

  test("matches naive all-pairs steering on a small clustered flock", () => {
    const config: FlockConfig = {
      maxSpeed: 4,
      accel: 8,
      separationRadius: 2,
      neighborRadius: 6,
      seekWeight: 0.5,
    };
    const seed: FlockStepAgent[] = [
      { position: [0, 0, 0], velocity: [1, 0, 0] },
      { position: [1, 0, 0.5], velocity: [0.5, 0, 0.2] },
      { position: [-0.5, 0, 1], velocity: [0, 0, -0.5] },
      { position: [0.2, 0, -0.8], velocity: [-0.2, 0, 0.4] },
    ];
    const gridded = seed.map((agent) => ({
      position: [...agent.position] as [number, number, number],
      velocity: [...agent.velocity] as [number, number, number],
    }));
    const naive = seed.map((agent) => ({
      position: [...agent.position] as [number, number, number],
      velocity: [...agent.velocity] as [number, number, number],
    }));
    const target: FlockVec3 = [5, 0, 0];
    const dt = 1 / 30;
    stepFlock(gridded, config, dt, target);
    const steers = naive.map((agent) => flockSteer(agent, naive, config, target));
    for (let i = 0; i < naive.length; i += 1) {
      const agent = naive[i]!;
      const steer = steers[i]!;
      let vx = agent.velocity[0] + steer[0] * dt;
      let vy = agent.velocity[1] + steer[1] * dt;
      let vz = agent.velocity[2] + steer[2] * dt;
      const speed = Math.hypot(vx, vy, vz);
      if (speed > config.maxSpeed) {
        const clamp = config.maxSpeed / speed;
        vx *= clamp;
        vy *= clamp;
        vz *= clamp;
      }
      agent.velocity = [vx, vy, vz];
      agent.position = [
        agent.position[0] + vx * dt,
        agent.position[1] + vy * dt,
        agent.position[2] + vz * dt,
      ];
    }
    for (let i = 0; i < seed.length; i += 1) {
      expect(gridded[i]!.position[0]).toBeCloseTo(naive[i]!.position[0], 8);
      expect(gridded[i]!.position[1]).toBeCloseTo(naive[i]!.position[1], 8);
      expect(gridded[i]!.position[2]).toBeCloseTo(naive[i]!.position[2], 8);
      expect(gridded[i]!.velocity[0]).toBeCloseTo(naive[i]!.velocity[0], 8);
      expect(gridded[i]!.velocity[1]).toBeCloseTo(naive[i]!.velocity[1], 8);
      expect(gridded[i]!.velocity[2]).toBeCloseTo(naive[i]!.velocity[2], 8);
    }
  });

  test("two independent flocks do not share grid state", () => {
    const config: FlockConfig = {
      maxSpeed: 4,
      separationRadius: 1.5,
      neighborRadius: 4,
      cohesionWeight: 1,
      alignmentWeight: 1,
    };
    const left: FlockStepAgent[] = [
      { position: [0, 0, 0], velocity: [1, 0, 0] },
      { position: [1, 0, 0], velocity: [1, 0, 0] },
    ];
    const right: FlockStepAgent[] = [
      { position: [1000, 0, 1000], velocity: [-1, 0, 0] },
      { position: [1001, 0, 1000], velocity: [-1, 0, 0] },
    ];
    const leftBefore = left.map((a) => [...a.position] as [number, number, number]);
    const rightBefore = right.map((a) => [...a.position] as [number, number, number]);
    // Interleave steps — the old module-global grid would corrupt one world with the other.
    stepFlock(left, config, 1 / 60);
    stepFlock(right, config, 1 / 60);
    stepFlock(left, config, 1 / 60);
    stepFlock(right, config, 1 / 60);
    for (let i = 0; i < left.length; i += 1) {
      expect(left[i]!.position[0]).not.toBe(leftBefore[i]![0]);
      expect(left[i]!.position[0]).toBeLessThan(50);
      expect(right[i]!.position[0]).not.toBe(rightBefore[i]![0]);
      expect(right[i]!.position[0]).toBeGreaterThan(900);
    }
  });

  test("sparse large flock stays sub-quadratic", () => {
    const config: FlockConfig = {
      maxSpeed: 3,
      separationRadius: 1,
      neighborRadius: 4,
      cohesionWeight: 1,
      alignmentWeight: 1,
    };
    const agents: FlockStepAgent[] = [];
    const side = 45;
    for (let z = 0; z < side; z += 1) {
      for (let x = 0; x < side; x += 1) {
        agents.push({
          position: [x * 20, 0, z * 20],
          velocity: [0.1, 0, 0.1],
        });
      }
    }
    expect(agents.length).toBe(side * side);
    const pristine = structuredClone(agents);
    const samples: number[] = [];
    let stepped = agents;
    // Repeated passes keep a window to read when the process is throttled.
    for (let pass = 0; pass < 5; pass += 1) {
      stepped = structuredClone(pristine);
      const t0 = performance.now();
      for (let step = 0; step < 8; step += 1) {
        stepFlock(stepped, config, 1 / 60);
      }
      samples.push(performance.now() - t0);
    }
    // Fastest pass 7.8 ms idle (this machine, 2026-10-22); the budget is a
    // sub-quadratic guard, not a frame budget.
    gateTimingMs("flock step, 2025 agents", samples, 16);
    expect(Number.isFinite(stepped[0]!.position[0])).toBe(true);
  });
});

test("external acceleration composes before velocity clamp and rejects malformed vectors atomically", async () => {
  const { stepFlock: step } = await import("./flock");
  const agents = [{ position: [0, 0, 0] as FlockVec3, velocity: [0, 0, 0] as FlockVec3 }];
  const config = { maxSpeed: 2, separationRadius: 1, neighborRadius: 4, seekWeight: 0 };
  step(agents, config, 0.1, undefined, () => [100, 0, 0]);
  expect(agents[0]!.velocity).toEqual([2, 0, 0]);
  expect(agents[0]!.position).toEqual([0.2, 0, 0]);
  const saved = structuredClone(agents);
  expect(() => step(agents, config, 0.1, undefined, () => [NaN, 0, 0])).toThrow();
  expect(agents).toEqual(saved);
});
