import { describe, expect, test } from "bun:test";
import { resolveHitReaction } from "@jgengine/core/combat/hitReaction";
import { hitFeel } from "./use-handlers";

const input = { attackerPos: [0, 0, 0] as [number, number, number], targetPos: [0, 0, 5] as [number, number, number] };
const push = (crit: boolean, killed: boolean) => Math.hypot(...resolveHitReaction(hitFeel(crit, killed), input).impulse);

describe("hitFeel", () => {
  test("kills use the calibrated enemyKilled preset", () => {
    expect(hitFeel(false, true)).toBe("enemyKilled");
    expect(hitFeel(true, true)).toBe("enemyKilled");
  });

  test("plain hits only flinch: a small shove, no hitstop, no shake", () => {
    const reaction = resolveHitReaction(hitFeel(false, false), input);
    expect(reaction.hitstopMs).toBe(0);
    expect(reaction.shake).toBeNull();
    expect(reaction.trauma ?? 0).toBe(0);
    expect(push(false, false)).toBeGreaterThan(0);
  });

  test("crits shove harder than plain hits and add a light shake", () => {
    expect(push(true, false)).toBeGreaterThan(push(false, false));
    expect(resolveHitReaction(hitFeel(true, false), input).trauma ?? 0).toBeGreaterThan(0);
  });
});
