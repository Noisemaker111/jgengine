import { describe, expect, test } from "bun:test";

import { createMobBrain, type MobBrainDeps, type MobVec3 } from "@jgengine/core/ai/mobBrain";

const HOME: MobVec3 = [0, 0, 0];

function world(options: { mob?: MobVec3; players?: Record<string, MobVec3 | null>; rng?: () => number }) {
  const state = {
    mob: options.mob ?? HOME,
    players: options.players ?? {},
  };
  const deps: MobBrainDeps = {
    home: HOME,
    position: () => state.mob,
    targetPosition: (id) => state.players[id] ?? null,
    candidates: () => Object.keys(state.players),
    ...(options.rng === undefined ? {} : { rng: options.rng }),
  };
  return { state, deps };
}

const config = { aggroRadius: 10, attackRange: 2, leashDistance: 30, wander: false as const };

describe("mobBrain", () => {
  test("aggros the nearest candidate inside aggroRadius and chases it", () => {
    const { deps } = world({ players: { far: [50, 0, 0], near: [5, 0, 0] } });
    const brain = createMobBrain(config, deps);
    const step = brain.tick(0.1);
    expect(step.mode).toBe("chase");
    expect(step.targetId).toBe("near");
    expect(step.moveTo).toEqual([5, 0, 0]);
  });

  test("engages without moving once the target is in attack range", () => {
    const { deps } = world({ players: { p: [1.5, 0, 0] } });
    const brain = createMobBrain(config, deps);
    const step = brain.tick(0.1);
    expect(step.mode).toBe("engage");
    expect(step.inAttackRange).toBe(true);
    expect(step.moveTo).toBeNull();
  });

  test("ignores candidates outside aggroRadius and idles", () => {
    const { deps } = world({ players: { p: [11, 0, 0] } });
    const brain = createMobBrain(config, deps);
    expect(brain.tick(0.1).mode).toBe("idle");
  });

  test("leashes: drops threat, evades home fast, heals-hook fires once on arrival", () => {
    const { state, deps } = world({ players: { p: [5, 0, 0] } });
    const brain = createMobBrain(config, deps);
    brain.tick(0.1);
    state.mob = [31, 0, 0];
    const evadeStep = brain.tick(0.1);
    expect(evadeStep.mode).toBe("evade");
    expect(evadeStep.moveTo).toEqual(HOME);
    expect(evadeStep.speedScale).toBeCloseTo(1.4, 5);
    expect(brain.threat.size()).toBe(0);

    const stillEvading = brain.tick(0.1);
    expect(stillEvading.mode).toBe("evade");
    expect(stillEvading.arrivedHome).toBe(false);

    state.mob = [1, 0, 0];
    const arrived = brain.tick(0.1);
    expect(arrived.mode).toBe("idle");
    expect(arrived.arrivedHome).toBe(true);
    expect(brain.tick(0.1).arrivedHome).toBe(false);
  });

  test("while evading it cannot be re-aggroed", () => {
    const { state, deps } = world({ players: { p: [5, 0, 0] } });
    const brain = createMobBrain(config, deps);
    brain.tick(0.1);
    state.mob = [31, 0, 0];
    brain.tick(0.1);
    brain.addThreat("p", 100);
    expect(brain.tick(0.1).mode).toBe("evade");
  });

  test("despawned target is dropped and the next threat takes over", () => {
    const { state, deps } = world({ players: { a: [3, 0, 0], b: [4, 0, 0] } });
    const brain = createMobBrain(config, deps);
    brain.addThreat("a", 10);
    brain.addThreat("b", 5);
    expect(brain.tick(0.1).targetId).toBe("a");
    state.players["a"] = null;
    expect(brain.tick(0.1).targetId).toBe("b");
  });

  test("wanders around home on the configured interval and speed", () => {
    const rolls = [0, 1];
    let index = 0;
    const { deps } = world({ rng: () => rolls[index++ % rolls.length] });
    const brain = createMobBrain(
      { ...config, wander: { radius: 8, intervalSeconds: 2, speedScale: 0.5 } },
      deps,
    );
    expect(brain.tick(1).mode).toBe("idle");
    const step = brain.tick(1.1);
    expect(step.mode).toBe("wander");
    expect(step.speedScale).toBe(0.5);
    const [x, , z] = step.moveTo!;
    expect(Math.hypot(x, z)).toBeLessThanOrEqual(8 + 1e-9);
  });

  test("reset returns the brain to idle at home", () => {
    const { deps } = world({ players: { p: [5, 0, 0] } });
    const brain = createMobBrain(config, deps);
    brain.tick(0.1);
    expect(brain.mode()).toBe("chase");
    brain.reset();
    expect(brain.mode()).toBe("idle");
    expect(brain.threat.size()).toBe(0);
  });
});
