import { describe, expect, test } from "bun:test";

import { canFlip, createMatch, flipCard, resolveMismatch, type MatchState } from "./machine";

const TWO_PAIRS = [0, 1, 0, 1];

function upTo(state: MatchState, ...indices: number[]): MatchState {
  let next = state;
  for (const index of indices) next = flipCard(next, index);
  return next;
}

describe("createMatch", () => {
  test("starts all cards face down in idle with zero moves", () => {
    const state = createMatch(TWO_PAIRS);
    expect(state.faces).toEqual(["down", "down", "down", "down"]);
    expect(state.phase).toBe("idle");
    expect(state.moves).toBe(0);
    expect(state.matchedPairs).toBe(0);
    expect(state.pairCount).toBe(2);
  });
});

describe("flipCard", () => {
  test("first flip raises one card and enters oneUp", () => {
    const state = flipCard(createMatch(TWO_PAIRS), 0);
    expect(state.faces[0]).toBe("up");
    expect(state.phase).toBe("oneUp");
    expect(state.firstUp).toBe(0);
    expect(state.moves).toBe(0);
  });

  test("flipping the raised card again is rejected", () => {
    const state = flipCard(createMatch(TWO_PAIRS), 0);
    expect(flipCard(state, 0)).toBe(state);
  });

  test("out-of-range flips are rejected", () => {
    const state = createMatch(TWO_PAIRS);
    expect(flipCard(state, -1)).toBe(state);
    expect(flipCard(state, 99)).toBe(state);
    expect(flipCard(state, 1.5)).toBe(state);
  });

  test("a matching second flip locks both cards and counts one move", () => {
    const state = upTo(createMatch(TWO_PAIRS), 0, 2);
    expect(state.faces[0]).toBe("matched");
    expect(state.faces[2]).toBe("matched");
    expect(state.matchedPairs).toBe(1);
    expect(state.moves).toBe(1);
    expect(state.phase).toBe("idle");
    expect(state.outcome).toBe("match");
  });

  test("a mismatched second flip enters resolving with both cards up", () => {
    const state = upTo(createMatch(TWO_PAIRS), 0, 1);
    expect(state.faces[0]).toBe("up");
    expect(state.faces[1]).toBe("up");
    expect(state.phase).toBe("resolving");
    expect(state.moves).toBe(1);
    expect(state.outcome).toBe("mismatch");
  });

  test("input is locked while a mismatch is resolving", () => {
    const state = upTo(createMatch(TWO_PAIRS), 0, 1);
    expect(canFlip(state, 2)).toBe(false);
    expect(flipCard(state, 2)).toBe(state);
  });

  test("matched cards can never be flipped again", () => {
    const state = upTo(createMatch(TWO_PAIRS), 0, 2);
    expect(canFlip(state, 0)).toBe(false);
    expect(flipCard(state, 0)).toBe(state);
  });

  test("moves count flip pairs, not individual flips", () => {
    const state = upTo(createMatch(TWO_PAIRS), 0, 1);
    const after = flipCard(resolveMismatch(state), 3);
    expect(after.moves).toBe(1);
  });

  test("each resolved pair bumps outcomeSeq for animation keying", () => {
    const mismatch = upTo(createMatch(TWO_PAIRS), 0, 1);
    expect(mismatch.outcomeSeq).toBe(1);
    const match = upTo(resolveMismatch(mismatch), 0, 2);
    expect(match.outcomeSeq).toBe(2);
  });

  test("clearing the final pair wins the board", () => {
    const state = upTo(createMatch(TWO_PAIRS), 0, 2, 1, 3);
    expect(state.phase).toBe("won");
    expect(state.matchedPairs).toBe(2);
    expect(state.moves).toBe(2);
    expect(canFlip(state, 0)).toBe(false);
  });
});

describe("resolveMismatch", () => {
  test("flips both mismatched cards back down and unlocks input", () => {
    const state = resolveMismatch(upTo(createMatch(TWO_PAIRS), 0, 1));
    expect(state.faces[0]).toBe("down");
    expect(state.faces[1]).toBe("down");
    expect(state.phase).toBe("idle");
    expect(state.firstUp).toBe(null);
    expect(state.secondUp).toBe(null);
    expect(canFlip(state, 0)).toBe(true);
  });

  test("does nothing outside the resolving phase", () => {
    const idle = createMatch(TWO_PAIRS);
    expect(resolveMismatch(idle)).toBe(idle);
    const oneUp = flipCard(idle, 0);
    expect(resolveMismatch(oneUp)).toBe(oneUp);
  });

  test("a full game with mismatches still reaches won", () => {
    let state = createMatch(TWO_PAIRS);
    state = upTo(state, 0, 1);
    state = resolveMismatch(state);
    state = upTo(state, 0, 2);
    state = upTo(state, 1, 3);
    expect(state.phase).toBe("won");
    expect(state.moves).toBe(3);
  });
});
