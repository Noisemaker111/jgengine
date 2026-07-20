import { describe, expect, it } from "bun:test";

import { createLeaderboard } from "./leaderboard";
import { medalFor, rankLeaderboard, type RankableRow } from "./leaderboardRank";

const rows: RankableRow[] = [
  { userId: "a", value: 30, label: "Ada" },
  { userId: "b", value: 50, label: "Ben" },
  { userId: "c", value: 50, label: "Cid" },
  { userId: "d", value: 10, label: "Dot" },
];

describe("rankLeaderboard", () => {
  it("sorts by value descending by default", () => {
    const ranked = rankLeaderboard(rows);
    expect(ranked.map((entry) => entry.userId)).toEqual(["b", "c", "a", "d"]);
    expect(ranked.map((entry) => entry.value)).toEqual([50, 50, 30, 10]);
  });

  it("assigns standard (competition) ranks: 1,2,2,4", () => {
    const ranked = rankLeaderboard(rows, { tieMode: "standard" });
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1, 3, 4]);
  });

  it("assigns dense ranks: 1,1,2,3", () => {
    const ranked = rankLeaderboard(rows, { tieMode: "dense" });
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1, 2, 3]);
  });

  it("matches the classic 1,2,2,4 / 1,2,2,3 example with three distinct-then-tie scores", () => {
    const trio: RankableRow[] = [
      { userId: "w", value: 100 },
      { userId: "x", value: 90 },
      { userId: "y", value: 90 },
      { userId: "z", value: 80 },
    ];
    expect(rankLeaderboard(trio, { tieMode: "standard" }).map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(rankLeaderboard(trio, { tieMode: "dense" }).map((r) => r.rank)).toEqual([1, 2, 2, 3]);
  });

  it("flags tied rows via isTie", () => {
    const ranked = rankLeaderboard(rows);
    const byUser = Object.fromEntries(ranked.map((entry) => [entry.userId, entry.isTie]));
    expect(byUser).toEqual({ b: true, c: true, a: false, d: false });
  });

  it("marks the local entry via highlightUserId", () => {
    const ranked = rankLeaderboard(rows, { highlightUserId: "a" });
    expect(ranked.filter((entry) => entry.isLocal).map((entry) => entry.userId)).toEqual(["a"]);
  });

  it("does not mark any entry local when highlightUserId is absent", () => {
    expect(rankLeaderboard(rows).every((entry) => !entry.isLocal)).toBe(true);
  });

  it("applies limit last, after ranking", () => {
    const ranked = rankLeaderboard(rows, { limit: 2 });
    expect(ranked).toHaveLength(2);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1]);
  });

  it("supports ascending order", () => {
    const ranked = rankLeaderboard(rows, { order: "asc" });
    expect(ranked.map((entry) => entry.value)).toEqual([10, 30, 50, 50]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3, 3]);
  });

  it("is a stable sort — equal scores keep input order", () => {
    const ranked = rankLeaderboard(rows);
    // b comes before c in input; both value 50.
    expect(ranked.slice(0, 2).map((entry) => entry.userId)).toEqual(["b", "c"]);
  });

  it("carries label through and leaves it undefined when absent", () => {
    const ranked = rankLeaderboard([{ userId: "a", value: 1 }]);
    expect(ranked[0]?.label).toBeUndefined();
  });

  it("handles empty input", () => {
    expect(rankLeaderboard([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input: RankableRow[] = [...rows];
    const snapshot = JSON.stringify(input);
    rankLeaderboard(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("consumes LeaderboardRow[] straight from the leaderboard model", () => {
    const board = createLeaderboard();
    board.track({ stat: "kills", scope: "global" });
    board.increment("you", "kills", { scope: "global", by: 7 });
    board.increment("rival", "kills", { scope: "global", by: 12 });
    const ranked = rankLeaderboard(board.snapshot(), { highlightUserId: "you" });
    expect(ranked.map((entry) => entry.userId)).toEqual(["rival", "you"]);
    expect(ranked.find((entry) => entry.userId === "you")?.isLocal).toBe(true);
  });
});

describe("medalFor", () => {
  it("returns gold/silver/bronze for ranks 1-3", () => {
    expect(medalFor(1)).toBe("gold");
    expect(medalFor(2)).toBe("silver");
    expect(medalFor(3)).toBe("bronze");
  });

  it("returns null beyond the podium", () => {
    expect(medalFor(4)).toBeNull();
    expect(medalFor(0)).toBeNull();
    expect(medalFor(-1)).toBeNull();
  });
});
