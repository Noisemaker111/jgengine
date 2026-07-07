import { describe, expect, test } from "bun:test";
import { applyImpulse, resolveHitReaction } from "@jgengine/core/combat/hitReaction";

describe("hit reaction", () => {
  test("knockback pushes the target away from the attacker", () => {
    const reaction = resolveHitReaction(
      { hitstopMs: 80, knockback: 4 },
      { attackerPos: [0, 0, 0], targetPos: [3, 0, 0] },
    );
    expect(reaction.hitstopMs).toBe(80);
    expect(reaction.impulse[0]).toBeCloseTo(4);
    expect(reaction.impulse[2]).toBeCloseTo(0);
  });

  test("power scales impulse and shake amplitude", () => {
    const reaction = resolveHitReaction(
      { hitstopMs: 100, knockback: 2, shake: { amplitude: 0.5, decay: 3 } },
      { attackerPos: [0, 0, 0], targetPos: [0, 0, 10], power: 2 },
    );
    expect(reaction.impulse[2]).toBeCloseTo(4);
    expect(reaction.shake?.amplitude).toBeCloseTo(1);
    expect(reaction.shake?.decay).toBe(3);
  });

  test("coincident positions produce no planar impulse", () => {
    const reaction = resolveHitReaction(
      { hitstopMs: 50, knockback: 5, vertical: 2 },
      { attackerPos: [1, 0, 1], targetPos: [1, 0, 1] },
    );
    expect(reaction.impulse[0]).toBe(0);
    expect(reaction.impulse[2]).toBe(0);
    expect(reaction.impulse[1]).toBe(2);
    expect(reaction.shake).toBeNull();
  });

  test("applyImpulse offsets a position", () => {
    expect(applyImpulse([1, 2, 3], [1, 0, -1])).toEqual([2, 2, 2]);
  });
});
