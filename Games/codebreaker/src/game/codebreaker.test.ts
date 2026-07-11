import { describe, expect, test } from "bun:test";

import {
  CODE_LENGTH,
  MAX_ROWS,
  addPeg,
  canSubmit,
  clearActive,
  colorsFor,
  createRound,
  makeSecret,
  modeKey,
  removePeg,
  scoreGuess,
  submitGuess,
  type Options,
} from "./codebreaker";

describe("scoreGuess — feedback algorithm", () => {
  test("all exact → 4 black, 0 white", () => {
    expect(scoreGuess([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ black: 4, white: 0 });
  });

  test("zero matches → 0 black, 0 white", () => {
    expect(scoreGuess([0, 0, 1, 1], [2, 2, 3, 3])).toEqual({ black: 0, white: 0 });
  });

  test("no duplicates: full permutation → 0 black, 4 white", () => {
    expect(scoreGuess([0, 1, 2, 3], [3, 2, 1, 0])).toEqual({ black: 0, white: 4 });
  });

  test("no duplicates: mix of black and white", () => {
    // secret 0 1 2 3, guess 0 2 1 4 → pos0 exact(0); 2&1 present wrong spot; 4 absent
    expect(scoreGuess([0, 1, 2, 3], [0, 2, 1, 4])).toEqual({ black: 1, white: 2 });
  });

  test("duplicates in guess, single in secret → white capped at secret count", () => {
    // secret has one 5; guess has three 5s, none aligned → exactly 1 white
    expect(scoreGuess([5, 0, 1, 2], [3, 5, 5, 5])).toEqual({ black: 0, white: 1 });
  });

  test("duplicate in guess, one aligned → 1 black then the extra copies earn nothing", () => {
    // secret one 5 at pos0; guess 5 5 5 5 → pos0 exact; remaining secret has no 5 left
    expect(scoreGuess([5, 0, 1, 2], [5, 5, 5, 5])).toEqual({ black: 1, white: 0 });
  });

  test("duplicates in secret, single in guess", () => {
    // secret two 7s (pos0,1); guess one 7 at pos3 → 0 black, 1 white
    expect(scoreGuess([7, 7, 0, 1], [2, 3, 4, 7])).toEqual({ black: 0, white: 1 });
  });

  test("duplicates in both — Knuth-style tricky case", () => {
    // secret 1 2 2 2, guess 2 2 3 3 → pos1 exact (2); secret left {1,2,2}, guess left {2,3,3} → 1 white
    expect(scoreGuess([1, 2, 2, 2], [2, 2, 3, 3])).toEqual({ black: 1, white: 1 });
  });

  test("black + white never exceed code length", () => {
    const secret = [2, 2, 4, 4];
    const guess = [2, 4, 2, 4];
    const fb = scoreGuess(secret, guess);
    expect(fb.black + fb.white).toBeLessThanOrEqual(CODE_LENGTH);
    expect(fb).toEqual({ black: 2, white: 2 });
  });
});

describe("makeSecret — option modes", () => {
  test("deterministic per seed", () => {
    const opts: Options = { duplicates: true, hard: false };
    expect(makeSecret("seed-x", opts)).toEqual(makeSecret("seed-x", opts));
  });

  test("different seeds usually differ", () => {
    const opts: Options = { duplicates: true, hard: false };
    const a = makeSecret("seed-a", opts).join(",");
    const b = makeSecret("seed-b", opts).join(",");
    expect(a).not.toBe(b);
  });

  test("normal mode draws colors in [0,6)", () => {
    for (let i = 0; i < 40; i += 1) {
      const secret = makeSecret(`n-${i}`, { duplicates: true, hard: false });
      expect(secret).toHaveLength(CODE_LENGTH);
      for (const c of secret) expect(c >= 0 && c < 6).toBe(true);
    }
  });

  test("hard mode draws colors in [0,8)", () => {
    let sawSeven = false;
    for (let i = 0; i < 60; i += 1) {
      const secret = makeSecret(`h-${i}`, { duplicates: true, hard: true });
      for (const c of secret) {
        expect(c >= 0 && c < 8).toBe(true);
        if (c >= 6) sawSeven = true;
      }
    }
    expect(sawSeven).toBe(true);
  });

  test("no-duplicates mode never repeats a color", () => {
    for (let i = 0; i < 60; i += 1) {
      const secret = makeSecret(`u-${i}`, { duplicates: false, hard: false });
      expect(new Set(secret).size).toBe(CODE_LENGTH);
    }
  });

  test("colorsFor and modeKey map the four modes", () => {
    expect(colorsFor({ duplicates: true, hard: false })).toBe(6);
    expect(colorsFor({ duplicates: true, hard: true })).toBe(8);
    expect(modeKey({ duplicates: true, hard: false })).toBe("6-dup");
    expect(modeKey({ duplicates: false, hard: false })).toBe("6-uniq");
    expect(modeKey({ duplicates: true, hard: true })).toBe("8-dup");
    expect(modeKey({ duplicates: false, hard: true })).toBe("8-uniq");
  });
});

describe("peg editing guards", () => {
  const opts: Options = { duplicates: true, hard: false };

  test("addPeg appends up to CODE_LENGTH and rejects out-of-range colors", () => {
    let round = createRound("edit", opts);
    round = addPeg(round, 0);
    round = addPeg(round, 9); // rejected (>= colors)
    round = addPeg(round, -1); // rejected
    expect(round.active).toEqual([0]);
    round = addPeg(round, 1);
    round = addPeg(round, 2);
    round = addPeg(round, 3);
    round = addPeg(round, 4); // full — rejected
    expect(round.active).toEqual([0, 1, 2, 3]);
  });

  test("removePeg pops the last; clearActive empties", () => {
    let round = createRound("edit2", opts);
    round = addPeg(round, 1);
    round = addPeg(round, 2);
    round = removePeg(round);
    expect(round.active).toEqual([1]);
    round = clearActive(round);
    expect(round.active).toEqual([]);
  });
});

describe("win / loss flow", () => {
  const opts: Options = { duplicates: true, hard: false };

  function play(round: ReturnType<typeof createRound>, guess: readonly number[]) {
    let next = round;
    for (const c of guess) next = addPeg(next, c);
    return submitGuess(next);
  }

  test("submitGuess rejects an incomplete row", () => {
    let round = createRound("flow", opts);
    round = addPeg(round, 0);
    expect(canSubmit(round)).toBe(false);
    const after = submitGuess(round);
    expect(after.guesses).toHaveLength(0);
    expect(after.status).toBe("playing");
  });

  test("guessing the secret wins and reveals it", () => {
    const round = createRound("win-seed", opts);
    const solved = play(round, round.secret);
    expect(solved.status).toBe("won");
    expect(solved.revealed).toBe(true);
    expect(solved.guesses).toHaveLength(1);
    expect(solved.active).toEqual([]);
    expect(solved.guesses[0]?.feedback).toEqual({ black: 4, white: 0 });
  });

  test("ten wrong guesses lose and reveal the code", () => {
    const round = createRound("lose-seed", opts);
    // build a guess guaranteed different from the secret in position 0
    const wrong = [...round.secret];
    wrong[0] = (round.secret[0] + 1) % round.colors;
    let current = round;
    for (let i = 0; i < MAX_ROWS; i += 1) current = play(current, wrong);
    expect(current.guesses).toHaveLength(MAX_ROWS);
    expect(current.status).toBe("lost");
    expect(current.revealed).toBe(true);
  });

  test("a win on the final row still wins rather than losing", () => {
    const round = createRound("clutch", opts);
    const wrong = [...round.secret];
    wrong[0] = (round.secret[0] + 1) % round.colors;
    let current = round;
    for (let i = 0; i < MAX_ROWS - 1; i += 1) current = play(current, wrong);
    expect(current.status).toBe("playing");
    current = play(current, round.secret);
    expect(current.status).toBe("won");
    expect(current.guesses).toHaveLength(MAX_ROWS);
  });

  test("no edits are accepted after the game ends", () => {
    const round = createRound("frozen", opts);
    const solved = play(round, round.secret);
    const tampered = addPeg(solved, 0);
    expect(tampered).toBe(solved);
  });
});
