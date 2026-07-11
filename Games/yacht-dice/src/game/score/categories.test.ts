import { describe, expect, test } from "bun:test";

import { isYacht, scoreCategory, type Dice } from "./categories";

describe("upper section", () => {
  test("scores the sum of matching faces only", () => {
    const dice: Dice = [1, 1, 3, 4, 4];
    expect(scoreCategory("ones", dice)).toBe(2);
    expect(scoreCategory("twos", dice)).toBe(0);
    expect(scoreCategory("threes", dice)).toBe(3);
    expect(scoreCategory("fours", dice)).toBe(8);
  });

  test("each face totals independently", () => {
    expect(scoreCategory("fives", [5, 5, 5, 2, 1])).toBe(15);
    expect(scoreCategory("sixes", [6, 6, 6, 6, 6])).toBe(30);
    expect(scoreCategory("twos", [1, 3, 4, 5, 6])).toBe(0);
  });
});

describe("three / four of a kind", () => {
  test("score the sum of all dice when the count is met", () => {
    expect(scoreCategory("threeKind", [3, 3, 3, 4, 6])).toBe(19);
    expect(scoreCategory("fourKind", [2, 2, 2, 2, 5])).toBe(13);
  });

  test("score zero when the count is not met", () => {
    expect(scoreCategory("threeKind", [3, 3, 4, 5, 6])).toBe(0);
    expect(scoreCategory("fourKind", [2, 2, 2, 5, 6])).toBe(0);
  });

  test("a four-of-a-kind also counts as three-of-a-kind for the full sum", () => {
    const dice: Dice = [5, 5, 5, 5, 2];
    expect(scoreCategory("threeKind", dice)).toBe(22);
    expect(scoreCategory("fourKind", dice)).toBe(22);
  });

  test("a five-of-a-kind satisfies both, still summing all dice", () => {
    const dice: Dice = [4, 4, 4, 4, 4];
    expect(scoreCategory("threeKind", dice)).toBe(20);
    expect(scoreCategory("fourKind", dice)).toBe(20);
  });
});

describe("full house", () => {
  test("scores 25 for three-plus-two of distinct faces", () => {
    expect(scoreCategory("fullHouse", [3, 3, 3, 5, 5])).toBe(25);
    expect(scoreCategory("fullHouse", [6, 6, 2, 2, 2])).toBe(25);
  });

  test("rejects four-plus-one", () => {
    expect(scoreCategory("fullHouse", [3, 3, 3, 3, 5])).toBe(0);
  });

  test("full house vs yacht: five-of-a-kind is NOT a full house", () => {
    const dice: Dice = [2, 2, 2, 2, 2];
    expect(scoreCategory("fullHouse", dice)).toBe(0);
    expect(scoreCategory("yacht", dice)).toBe(50);
  });
});

describe("straights", () => {
  test("small straight (four consecutive) scores 30", () => {
    expect(scoreCategory("smallStraight", [1, 2, 3, 4, 6])).toBe(30);
    expect(scoreCategory("smallStraight", [3, 4, 5, 6, 1])).toBe(30);
  });

  test("large straight (five consecutive) scores 40", () => {
    expect(scoreCategory("largeStraight", [1, 2, 3, 4, 5])).toBe(40);
    expect(scoreCategory("largeStraight", [2, 3, 4, 5, 6])).toBe(40);
  });

  test("small straight tolerates duplicates", () => {
    expect(scoreCategory("smallStraight", [1, 2, 3, 4, 4])).toBe(30);
    expect(scoreCategory("smallStraight", [2, 3, 3, 4, 5])).toBe(30);
  });

  test("large straight rejects duplicates that break the run of five", () => {
    expect(scoreCategory("largeStraight", [1, 2, 3, 4, 4])).toBe(0);
    expect(scoreCategory("largeStraight", [1, 2, 3, 5, 6])).toBe(0);
  });

  test("a large straight also satisfies a small straight", () => {
    expect(scoreCategory("smallStraight", [2, 3, 4, 5, 6])).toBe(30);
  });

  test("non-straights score zero", () => {
    expect(scoreCategory("smallStraight", [1, 1, 2, 2, 3])).toBe(0);
    expect(scoreCategory("largeStraight", [1, 3, 4, 5, 6])).toBe(0);
  });
});

describe("yacht and chance", () => {
  test("yacht scores 50 for five alike, else 0", () => {
    expect(scoreCategory("yacht", [1, 1, 1, 1, 1])).toBe(50);
    expect(scoreCategory("yacht", [1, 1, 1, 1, 2])).toBe(0);
    expect(isYacht([6, 6, 6, 6, 6])).toBe(true);
    expect(isYacht([6, 6, 6, 6, 5])).toBe(false);
  });

  test("chance always sums every die", () => {
    expect(scoreCategory("chance", [1, 2, 3, 4, 5])).toBe(15);
    expect(scoreCategory("chance", [6, 6, 6, 6, 6])).toBe(30);
  });
});
