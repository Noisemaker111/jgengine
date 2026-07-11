import { describe, expect, test } from "bun:test";

import { SCORE_FLY, SCORE_FORWARD, SCORE_HOME } from "./constants";
import {
  crossesExtraLife,
  forwardHopScore,
  homeScore,
  timeBonus,
  timeFraction,
} from "./scoring";

describe("timer scoring", () => {
  test("remaining time converts at 10 per whole unit", () => {
    expect(timeBonus(30)).toBe(300);
    expect(timeBonus(15.7)).toBe(150);
    expect(timeBonus(0)).toBe(0);
    expect(timeBonus(-4)).toBe(0);
  });

  test("home score = base + time bonus + optional fly", () => {
    expect(homeScore(20, false)).toBe(SCORE_HOME + 200);
    expect(homeScore(20, true)).toBe(SCORE_HOME + 200 + SCORE_FLY);
    expect(homeScore(0, false)).toBe(SCORE_HOME);
  });

  test("time bar fraction is clamped 0..1", () => {
    expect(timeFraction(30)).toBe(1);
    expect(timeFraction(15)).toBeCloseTo(0.5);
    expect(timeFraction(-2)).toBe(0);
    expect(timeFraction(999)).toBe(1);
  });
});

describe("forward-hop scoring", () => {
  test("only a new furthest row scores", () => {
    expect(forwardHopScore(3, 2)).toBe(SCORE_FORWARD);
    expect(forwardHopScore(2, 3)).toBe(0);
    expect(forwardHopScore(2, 2)).toBe(0);
  });
});

describe("extra life threshold", () => {
  test("granted once when the score first crosses the threshold", () => {
    expect(crossesExtraLife(4990, 5010)).toBe(true);
    expect(crossesExtraLife(0, 4999)).toBe(false);
    expect(crossesExtraLife(5000, 6000)).toBe(false);
  });
});
