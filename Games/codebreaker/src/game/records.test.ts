import { beforeEach, describe, expect, test } from "bun:test";

import { clearRecords, readRecords, recordLoss, recordWin } from "./records";

describe("records — streaks and monotonic bests", () => {
  beforeEach(() => {
    clearRecords();
  });

  test("a fresh book reports zeros and no fewest", () => {
    const r = readRecords();
    expect(r["6-dup"]).toEqual({ streak: 0, bestStreak: 0, fewest: null });
  });

  test("consecutive wins raise the current streak and best streak together", () => {
    expect(recordWin("6-dup", 5).streak).toBe(1);
    expect(recordWin("6-dup", 4).streak).toBe(2);
    const outcome = recordWin("6-dup", 6);
    expect(outcome.streak).toBe(3);
    expect(outcome.newBestStreak).toBe(true);
    const r = readRecords()["6-dup"];
    expect(r.streak).toBe(3);
    expect(r.bestStreak).toBe(3);
  });

  test("a loss resets the current streak but never the best streak", () => {
    recordWin("6-dup", 5);
    recordWin("6-dup", 5);
    recordLoss("6-dup");
    const r = readRecords()["6-dup"];
    expect(r.streak).toBe(0);
    expect(r.bestStreak).toBe(2);
  });

  test("fewest guesses only improves downward", () => {
    expect(recordWin("6-dup", 6).newFewest).toBe(true);
    expect(recordWin("6-dup", 8).newFewest).toBe(false);
    expect(recordWin("6-dup", 4).newFewest).toBe(true);
    expect(readRecords()["6-dup"].fewest).toBe(4);
  });

  test("modes are tracked independently", () => {
    recordWin("6-dup", 5);
    recordWin("8-uniq", 7);
    recordWin("8-uniq", 3);
    const r = readRecords();
    expect(r["6-dup"].streak).toBe(1);
    expect(r["6-dup"].fewest).toBe(5);
    expect(r["8-uniq"].streak).toBe(2);
    expect(r["8-uniq"].fewest).toBe(3);
    expect(r["6-uniq"]).toEqual({ streak: 0, bestStreak: 0, fewest: null });
  });
});
