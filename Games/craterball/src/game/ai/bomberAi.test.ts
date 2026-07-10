import { describe, expect, test } from "bun:test";
import { decideAiAction, type AiConfig } from "./bomberAi";

const CONFIG: AiConfig = {
  defendRadius: 14,
  aimErrorRadius: 0,
  standOffset: 4,
  throwRange: 9,
  detonateRange: 7,
  maxArmedCharges: 2,
};

const noJitter = () => 0.5;

describe("craterball bomber AI", () => {
  test("defends when the ball threatens its own goal", () => {
    const decision = decideAiAction({ x: 10, z: 0 }, { x: 20, z: 1 }, 26, -26, 0, CONFIG, noJitter);
    expect(decision.mode).toBe("defend");
    expect(decision.moveTarget.x).toBeGreaterThan(10);
    expect(decision.moveTarget.x).toBeLessThan(26);
  });

  test("attacks when the ball is loose in the neutral zone", () => {
    const decision = decideAiAction({ x: 10, z: 0 }, { x: 0, z: 0 }, 26, -26, 0, CONFIG, noJitter);
    expect(decision.mode).toBe("attack");
  });

  test("attack stance stands on the far side of the ball from the opponent's goal", () => {
    const decision = decideAiAction({ x: 10, z: 0 }, { x: 0, z: 0 }, 26, -26, 0, CONFIG, noJitter);
    expect(decision.moveTarget.x).toBeGreaterThan(0);
  });

  test("throws only within range and under the armed-charge cap", () => {
    const farAway = decideAiAction({ x: -20, z: 0 }, { x: 20, z: 0 }, 26, -26, 0, CONFIG, noJitter);
    expect(farAway.shouldThrow).toBe(false);

    const inRange = decideAiAction({ x: 1, z: 0 }, { x: 0, z: 0 }, 26, -26, 0, CONFIG, noJitter);
    expect(inRange.shouldThrow).toBe(true);

    const bankFull = decideAiAction({ x: 1, z: 0 }, { x: 0, z: 0 }, 26, -26, 2, CONFIG, noJitter);
    expect(bankFull.shouldThrow).toBe(false);
  });

  test("only detonates once close enough to the ball to matter", () => {
    const tooFar = decideAiAction({ x: -20, z: 0 }, { x: 20, z: 0 }, 26, -26, 1, CONFIG, noJitter);
    expect(tooFar.shouldDetonate).toBe(false);

    const close = decideAiAction({ x: 1, z: 0 }, { x: 0, z: 0 }, 26, -26, 1, CONFIG, noJitter);
    expect(close.shouldDetonate).toBe(true);
  });

  test("never detonates with nothing armed", () => {
    const decision = decideAiAction({ x: 1, z: 0 }, { x: 0, z: 0 }, 26, -26, 0, CONFIG, noJitter);
    expect(decision.shouldDetonate).toBe(false);
  });

  test("aim error radius jitters the throw target deterministically for a fixed rng", () => {
    let calls = 0;
    const rng = () => {
      calls += 1;
      return calls % 2 === 0 ? 0.25 : 0.75;
    };
    const errorConfig: AiConfig = { ...CONFIG, aimErrorRadius: 2 };
    const a = decideAiAction({ x: 1, z: 0 }, { x: 0, z: 0 }, 26, -26, 0, errorConfig, rng);
    calls = 0;
    const b = decideAiAction({ x: 1, z: 0 }, { x: 0, z: 0 }, 26, -26, 0, errorConfig, rng);
    expect(a.throwAt).toEqual(b.throwAt);
  });
});
