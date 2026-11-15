import { describe, expect, test } from "bun:test";

import { createPointsSeries } from "./pointsSeries";

const CUP = createPointsSeries({ rounds: ["r1", "r2", "r3"], competitors: ["you", "june", "twins", "brick"], points: [10, 6, 4, 3] });

describe("points series", () => {
  test("places pay down the table; a did-not-finish and places past it pay nothing", () => {
    expect([1, 2, 3, 4, 5, 0, -1, 1.5].map(CUP.pointsFor)).toEqual([10, 6, 4, 3, 0, 0, 0, 0]);
  });

  test("standings add each round's points and rank the leader first", () => {
    let state = CUP.start();
    expect(CUP.nextRound(state)).toBe("r1");
    expect(CUP.roundNumber(state)).toBe(1);
    state = CUP.record(state, "r1", { you: 2, june: 1, twins: 3, brick: 4 });
    state = CUP.record(state, "r2", { you: 1, june: 4, twins: 2, brick: 3 });
    expect(CUP.nextRound(state)).toBe("r3");
    expect(CUP.roundNumber(state)).toBe(3);
    expect(CUP.standings(state).map((row) => [row.id, row.points, row.rank])).toEqual([
      ["you", 16, 1],
      ["june", 13, 2],
      ["twins", 10, 3],
      ["brick", 7, 4],
    ]);
    expect(CUP.complete(state)).toBe(false);
    expect(CUP.champion(state)).toBeNull();
  });

  test("ties break on wins, then countback, then the competitor order", () => {
    let state = CUP.start();
    // you and june tie on 16 with a win and a second each, so the competitor order puts you first;
    // twins and brick tie on 7 with no wins, and countback (a third each) falls to the order too.
    state = CUP.record(state, "r1", { you: 1, june: 2, twins: 3, brick: 4 });
    state = CUP.record(state, "r2", { you: 2, june: 1, twins: 4, brick: 3 });
    const rows = CUP.standings(state);
    expect(rows.map((row) => row.id)).toEqual(["you", "june", "twins", "brick"]);
    expect(rows[0]!.points).toBe(rows[1]!.points);
    const wins = CUP.record(CUP.start(), "r1", { you: 0, june: 0, twins: 0, brick: 1 });
    expect(CUP.standings(wins)[0]!.id).toBe("brick");
    const countback = createPointsSeries({ rounds: ["a", "b"], competitors: ["x", "y"], points: [5, 5, 5] });
    const state2 = countback.record(countback.record(countback.start(), "a", { x: 3, y: 2 }), "b", { x: 3, y: 3 });
    expect(countback.standings(state2).map((row) => row.id)).toEqual(["y", "x"]);
  });

  test("the last round crowns a champion; re-recording a round replaces it", () => {
    let state = CUP.start();
    state = CUP.record(state, "r1", { you: 4, june: 1, twins: 2, brick: 3 });
    state = CUP.record(state, "r2", { you: 4, june: 1, twins: 2, brick: 3 });
    state = CUP.record(state, "r3", { you: 4, june: 1, twins: 2, brick: 3 });
    expect(CUP.complete(state)).toBe(true);
    expect(CUP.champion(state)).toBe("june");
    expect(CUP.roundNumber(state)).toBe(3);
    state = CUP.record(state, "r3", { you: 1, june: 4, twins: 2, brick: 3 });
    expect(CUP.standings(state).find((row) => row.id === "you")).toMatchObject({ points: 16, wins: 1, best: 1, rounds: 3 });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  test("bad configs and unknown ids throw", () => {
    expect(() => createPointsSeries({ rounds: [], competitors: ["a"], points: [1] })).toThrow();
    expect(() => createPointsSeries({ rounds: ["a", "a"], competitors: ["a"], points: [1] })).toThrow();
    expect(() => CUP.record(CUP.start(), "r9", { you: 1 })).toThrow();
    expect(() => CUP.record(CUP.start(), "r1", { stranger: 1 })).toThrow();
  });
});
