import { describe, expect, test } from "bun:test";

import {
  browseSessions,
  findByJoinCode,
  generateJoinCode,
  matchesFilter,
  normalizeJoinCode,
  quickMatch,
  type SessionListing,
} from "./matchmaking";

function listing(overrides: Partial<SessionListing> & { serverId: string }): SessionListing {
  return {
    gameId: "g",
    status: "running",
    visibility: "public",
    memberCount: 1,
    slotsPerServer: 8,
    updatedAt: 0,
    ...overrides,
  };
}

const POOL: SessionListing[] = [
  listing({ serverId: "s1", mode: "ranked", memberCount: 6, tags: ["us"], label: "Ranked US", updatedAt: 10 }),
  listing({ serverId: "s2", mode: "casual", memberCount: 2, tags: ["eu"], label: "Chill EU", updatedAt: 20 }),
  listing({ serverId: "s3", mode: "ranked", memberCount: 8, slotsPerServer: 8, label: "Full lobby", updatedAt: 30 }),
  listing({ serverId: "s4", visibility: "private", joinCode: "abc-123", label: "Friends only", updatedAt: 40 }),
  listing({ serverId: "s5", status: "closed", label: "Ended", updatedAt: 50 }),
];

describe("browse / filter sessions", () => {
  test("browse hides private and closed sessions by default", () => {
    const ids = browseSessions(POOL).map((s) => s.serverId);
    expect(ids).not.toContain("s4");
    expect(ids).not.toContain("s5");
    expect(ids).toContain("s1");
  });

  test("filter by mode narrows the list", () => {
    const ids = browseSessions(POOL, { mode: "ranked" }).map((s) => s.serverId);
    expect(ids.sort()).toEqual(["s1", "s3"]);
  });

  test("notFull excludes a full lobby", () => {
    const ids = browseSessions(POOL, { notFull: true }).map((s) => s.serverId);
    expect(ids).not.toContain("s3");
  });

  test("tag filter requires all tags present", () => {
    expect(matchesFilter(POOL[0]!, { tags: ["us"] })).toBe(true);
    expect(matchesFilter(POOL[0]!, { tags: ["us", "eu"] })).toBe(false);
  });

  test("query does a case-insensitive label substring match", () => {
    const ids = browseSessions(POOL, { query: "chill" }).map((s) => s.serverId);
    expect(ids).toEqual(["s2"]);
  });

  test("limit caps the result count", () => {
    expect(browseSessions(POOL, {}, { limit: 1 }).length).toBe(1);
  });
});

describe("join by code", () => {
  test("normalizes casing, spaces and dashes are matched loosely", () => {
    expect(normalizeJoinCode("  ab c1 2 3 ")).toBe("ABC123");
    const found = findByJoinCode(POOL, "ABC123");
    expect(found?.serverId).toBe("s4");
  });

  test("a wrong code finds nothing", () => {
    expect(findByJoinCode(POOL, "zzz999")).toBeNull();
    expect(findByJoinCode(POOL, "")).toBeNull();
  });

  test("private session reachable by code even though it never appears in browse", () => {
    expect(browseSessions(POOL).find((s) => s.serverId === "s4")).toBeUndefined();
    expect(findByJoinCode(POOL, "abc-123")?.serverId).toBe("s4");
  });

  test("generateJoinCode is deterministic under a fixed random source and avoids ambiguous chars", () => {
    let n = 0;
    const seq = [0.1, 0.9, 0.5, 0.2, 0.7, 0.33];
    const rand = () => seq[n++ % seq.length]!;
    const code = generateJoinCode(rand, 6);
    expect(code.length).toBe(6);
    expect(code).not.toMatch(/[01OI]/);
  });
});

describe("quickMatch", () => {
  test("picks the fullest joinable public session to fill lobbies", () => {
    const pick = quickMatch(POOL, { mode: "ranked" });
    expect(pick?.serverId).toBe("s1");
  });

  test("returns null when nothing has room", () => {
    const full = [listing({ serverId: "x", memberCount: 8, slotsPerServer: 8 })];
    expect(quickMatch(full)).toBeNull();
  });

  test("excludes private lobbies from auto-match", () => {
    const privateOnly = [
      listing({ serverId: "priv", visibility: "private", joinCode: "ABC", memberCount: 1 }),
    ];
    expect(quickMatch(privateOnly)).toBeNull();
    expect(quickMatch(privateOnly, { includePrivate: true })?.serverId).toBe("priv");
  });
});
