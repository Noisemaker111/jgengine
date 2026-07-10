import { describe, expect, test } from "bun:test";
import { CREATURE_COUNT } from "../constants";
import { aliveCount, createInitialRunState } from "./store";

describe("restart-reset purity", () => {
  test("two fresh runs are deep-equal but do not share references", () => {
    const first = createInitialRunState("restless");
    const second = createInitialRunState("restless");
    expect(first).toEqual(second);
    expect(first.creatures).not.toBe(second.creatures);
    expect(first.whistle).not.toBe(second.whistle);

    first.creatures["creature-00"]!.alive = false;
    expect(second.creatures["creature-00"]!.alive).toBe(true);
  });

  test("a fresh run starts on the start screen with the full herd alive", () => {
    const run = createInitialRunState("feral");
    expect(run.phase).toBe("start");
    expect(run.tier).toBe("feral");
    expect(aliveCount(run)).toBe(CREATURE_COUNT);
    expect(run.toasts.length).toBe(0);
    expect(run.medal).toBeNull();
  });
});
