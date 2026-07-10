import { describe, expect, test } from "bun:test";
import { buildForks, FORKS, GATES, HAZARD_TOTAL, SEED } from "./catalog";

describe("stormline course catalog", () => {
  test("has 6 gates and 5 forks", () => {
    expect(GATES.length).toBe(6);
    expect(FORKS.length).toBe(5);
  });

  test("gates are strictly increasing in progress", () => {
    for (let i = 1; i < GATES.length; i += 1) {
      expect(GATES[i]!.progress).toBeGreaterThan(GATES[i - 1]!.progress);
    }
  });

  test("last gate is the shelter checkpoint", () => {
    expect(GATES[GATES.length - 1]!.name).toBe("Shelter Bluff");
  });

  test("meets the 12+ lightning strike zone content budget", () => {
    expect(HAZARD_TOTAL).toBeGreaterThanOrEqual(12);
  });

  test("every fork has a distinct fast-spur hazard layout", () => {
    const signatures = FORKS.map((fork) => fork.hazards.map((h) => `${h.progress.toFixed(1)}:${h.windupMs}`).join("|"));
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  test("fork geometry sits between the correct gates", () => {
    for (let i = 0; i < FORKS.length; i += 1) {
      const fork = FORKS[i]!;
      const gate = GATES[i]!;
      const nextGate = GATES[i + 1]!;
      expect(fork.forkProgress).toBeGreaterThan(gate.progress);
      expect(fork.gateProgress).toBe(nextGate.progress);
      for (const hazard of fork.hazards) {
        expect(hazard.progress).toBeGreaterThan(fork.forkProgress);
        expect(hazard.progress).toBeLessThan(fork.gateProgress);
      }
    }
  });

  test("is deterministic for a fixed seed", () => {
    const a = buildForks(SEED);
    const b = buildForks(SEED);
    expect(a).toEqual(b);
  });

  test("differs for a different seed", () => {
    const a = buildForks(SEED);
    const b = buildForks("a-different-seed");
    expect(a).not.toEqual(b);
  });
});
