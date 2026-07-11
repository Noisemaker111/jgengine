import { describe, expect, test } from "bun:test";

import { generateDeal } from "./mahjong/deal";
import {
  applyHint,
  applyPick,
  applyReshuffle,
  applyUndo,
  freeMatchPairs,
  isStuck,
  newSession,
  remainingPairs,
  remainingTiles,
  RESHUFFLES,
  tileStates,
} from "./session";

describe("session reducer", () => {
  test("newSession deals a full 144-tile board", () => {
    const session = newSession("session-1", "seed");
    expect(remainingTiles(session)).toBe(144);
    expect(remainingPairs(session)).toBe(72);
    expect(session.reshufflesLeft).toBe(RESHUFFLES);
    expect(session.status).toBe("playing");
    expect(session.history.length).toBe(0);
    expect(freeMatchPairs(session)).toBeGreaterThan(0);
    expect(isStuck(session)).toBe(false);
  });

  test("selecting then matching a free pair removes both, and undo restores them", () => {
    const seed = "session-2";
    const { solution } = generateDeal(seed);
    const [a, b] = solution[0];
    let session = newSession(seed, "seed");

    session = applyPick(session, a);
    expect(session.selected).toBe(a);

    session = applyPick(session, b);
    expect(session.selected).toBeNull();
    expect(session.faces[a]).toBeNull();
    expect(session.faces[b]).toBeNull();
    expect(session.history.length).toBe(1);
    expect(session.moves).toBe(1);

    const undone = applyUndo(session);
    expect(undone.faces[a]).not.toBeNull();
    expect(undone.faces[b]).not.toBeNull();
    expect(undone.history.length).toBe(0);
    expect(undone.moves).toBe(0);
  });

  test("clearing the whole board wins and records a finish time", () => {
    const seed = "session-win";
    const { solution } = generateDeal(seed);
    let session = newSession(seed, "seed");
    for (const [a, b] of solution) {
      session = applyPick(session, a);
      session = applyPick(session, b);
    }
    expect(session.status).toBe("won");
    expect(remainingTiles(session)).toBe(0);
    expect(session.finishedMs).not.toBeNull();
    expect((session.finishedMs ?? -1) >= 0).toBe(true);
  });

  test("hint surfaces a matching free pair and counts", () => {
    const session = applyHint(newSession("session-hint", "seed"));
    expect(session.hint).not.toBeNull();
    expect(session.hintsUsed).toBe(1);
    const states = tileStates(session);
    const hint = session.hint as [number, number];
    expect(states[hint[0]]).toBe("hinted");
  });

  test("reshuffle consumes a charge and keeps the same tiles on the board", () => {
    const session = newSession("session-rs", "seed");
    const before = remainingTiles(session);
    const shuffled = applyReshuffle(session);
    expect(shuffled.reshufflesLeft).toBe(RESHUFFLES - 1);
    expect(remainingTiles(shuffled)).toBe(before);
    expect(freeMatchPairs(shuffled)).toBeGreaterThan(0);
  });

  test("blocked tiles cannot be selected", () => {
    const session = newSession("session-block", "seed");
    const states = tileStates(session);
    const blocked = states.findIndex((s) => s === "blocked");
    expect(blocked).toBeGreaterThanOrEqual(0);
    const after = applyPick(session, blocked);
    expect(after.selected).toBeNull();
  });
});
