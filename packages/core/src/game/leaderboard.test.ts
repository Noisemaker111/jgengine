import { describe, expect, test } from "bun:test";

import { createLeaderboard } from "./leaderboard";

describe("leaderboard", () => {
  test("increment on an untracked stat/scope pair is rejected", () => {
    const leaderboard = createLeaderboard();
    expect(leaderboard.increment("alice", "kills", { scope: "global" })).toEqual({
      status: "rejected",
      reason: "not-tracked",
    });
  });

  test("increment accumulates for a tracked stat/scope pair", () => {
    const leaderboard = createLeaderboard();
    leaderboard.track({ stat: "kills", scope: "global" });

    leaderboard.increment("alice", "kills", { scope: "global" });
    const result = leaderboard.increment("alice", "kills", { scope: "global", by: 3 });

    expect(result).toEqual({ status: "ok", value: 4 });
  });

  test("track accepts a currency alias and normalizes it to a stat id", () => {
    const leaderboard = createLeaderboard();
    leaderboard.track({ currency: "coins", scope: "profile" });

    const result = leaderboard.increment("alice", "coins", { scope: "profile", by: 10 });

    expect(result).toEqual({ status: "ok", value: 10 });
  });

  test("scopes accumulate independently for the same stat", () => {
    const leaderboard = createLeaderboard();
    leaderboard.track({ stat: "kills", scope: "global" });
    leaderboard.track({ stat: "kills", scope: "server" });

    leaderboard.increment("alice", "kills", { scope: "global" });
    leaderboard.increment("alice", "kills", { scope: "server", serverId: "s1" });

    expect(leaderboard.getTop("kills", { scope: "global" })).toEqual([{ userId: "alice", value: 1 }]);
    expect(leaderboard.getTop("kills", { scope: "server", serverId: "s1" })).toEqual([{ userId: "alice", value: 1 }]);
  });

  test("getTop sorts descending and respects limit", () => {
    const leaderboard = createLeaderboard();
    leaderboard.track({ stat: "kills", scope: "global" });
    leaderboard.increment("alice", "kills", { scope: "global", by: 5 });
    leaderboard.increment("bob", "kills", { scope: "global", by: 9 });
    leaderboard.increment("carol", "kills", { scope: "global", by: 2 });

    expect(leaderboard.getTop("kills", { scope: "global", limit: 2 })).toEqual([
      { userId: "bob", value: 9 },
      { userId: "alice", value: 5 },
    ]);
  });

  test("getProfile only returns profile-scoped stats for that user", () => {
    const leaderboard = createLeaderboard();
    leaderboard.track({ stat: "kills", scope: "profile" });
    leaderboard.track({ stat: "kills", scope: "global" });
    leaderboard.increment("alice", "kills", { scope: "profile", by: 7 });
    leaderboard.increment("alice", "kills", { scope: "global", by: 20 });

    expect(leaderboard.getProfile("alice")).toEqual({ kills: 7 });
  });

  test("increment notifies the sink on each successful update", () => {
    const rows: unknown[] = [];
    const leaderboard = createLeaderboard({ onIncrement: (row) => rows.push(row) });
    leaderboard.track({ stat: "kills", scope: "global" });

    leaderboard.increment("alice", "kills", { scope: "global" });

    expect(rows).toEqual([{ stat: "kills", scope: "global", serverId: undefined, userId: "alice", value: 1 }]);
  });

  test("snapshot and hydrate round-trip leaderboard rows", () => {
    const leaderboard = createLeaderboard();
    leaderboard.track({ stat: "kills", scope: "global" });
    leaderboard.increment("alice", "kills", { scope: "global", by: 3 });
    const snapshot = leaderboard.snapshot();

    const restored = createLeaderboard();
    restored.hydrate(snapshot);

    expect(restored.getTop("kills", { scope: "global" })).toEqual([{ userId: "alice", value: 3 }]);
  });
});
