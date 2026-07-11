import { describe, expect, test } from "bun:test";

import { flockSteer, stepFlock, type FlockAgent, type FlockConfig, type FlockStepAgent } from "@jgengine/core/ai/flock";

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
});
