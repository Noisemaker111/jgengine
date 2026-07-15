import { describe, expect, test } from "bun:test";
import { applyImpulse, impactPresets, resolveHitReaction } from "@jgengine/core/combat/hitReaction";

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

describe("impactPresets", () => {
  test("named preset resolves hitstop and trauma without a hand-built config", () => {
    const reaction = resolveHitReaction("explosion", {
      attackerPos: [0, 0, 0],
      targetPos: [1, 0, 0],
    });
    expect(reaction.hitstopMs).toBe(impactPresets.explosion.hitstopMs);
    expect(reaction.trauma).toBeCloseTo(impactPresets.explosion.trauma);
    expect(reaction.timescale).toBe(impactPresets.explosion.timescale);
  });

  test("light events carry no hitstop or timescale", () => {
    const reaction = resolveHitReaction("pickup", {
      attackerPos: [0, 0, 0],
      targetPos: [0, 0, 0],
    });
    expect(reaction.hitstopMs).toBe(0);
    expect(reaction.timescale).toBeNull();
    expect(reaction.trauma).toBeCloseTo(impactPresets.pickup.trauma);
  });

  test("preset trauma scales with power and clamps at the 1.0 cap", () => {
    const reaction = resolveHitReaction("playerHit", {
      attackerPos: [0, 0, 0],
      targetPos: [1, 0, 0],
      power: 10,
    });
    expect(reaction.trauma).toBe(1);
  });

  test("raw config still overrides a preset call", () => {
    const reaction = resolveHitReaction(
      { hitstopMs: 12, knockback: 3, trauma: 0.5 },
      { attackerPos: [0, 0, 0], targetPos: [1, 0, 0] },
    );
    expect(reaction.hitstopMs).toBe(12);
    expect(reaction.trauma).toBeCloseTo(0.5);
  });

  test("a config with no trauma resolves trauma to null (back-compat)", () => {
    const reaction = resolveHitReaction(
      { hitstopMs: 20, knockback: 1 },
      { attackerPos: [0, 0, 0], targetPos: [1, 0, 0] },
    );
    expect(reaction.trauma).toBeNull();
  });
});
