import { describe, expect, test } from "bun:test";

import {
  JG_MAX_MEMBERS_PER_SERVER,
  canJoinPrivateServer,
  isAutoJoinCandidate,
  selectJoinTarget,
  validateSlotsPerServer,
  isListablePublicly,
  isPrivateJoinBlocked,
  isServerFull,
  isServerMember,
  statusAfterLeave,
  withJoinedMember,
  withoutMember,
} from "./hostPolicy";

describe("isListablePublicly", () => {
  test("excludes private, includes public and undefined", () => {
    expect(isListablePublicly("private")).toBe(false);
    expect(isListablePublicly("public")).toBe(true);
    expect(isListablePublicly(undefined)).toBe(true);
  });
});

describe("canJoinPrivateServer", () => {
  test("rejects a non-member with no code or a wrong code", () => {
    expect(canJoinPrivateServer({ isMember: false, joinCode: "SECRET1", suppliedCode: undefined })).toBe(
      false,
    );
    expect(canJoinPrivateServer({ isMember: false, joinCode: "SECRET1", suppliedCode: "WRONG" })).toBe(
      false,
    );
    expect(canJoinPrivateServer({ isMember: false, joinCode: undefined, suppliedCode: undefined })).toBe(
      false,
    );
  });

  test("accepts a non-member presenting the matching (case-insensitive) code", () => {
    expect(canJoinPrivateServer({ isMember: false, joinCode: "SECRET1", suppliedCode: "secret1" })).toBe(
      true,
    );
  });

  test("always accepts an existing member, code or not", () => {
    expect(canJoinPrivateServer({ isMember: true, joinCode: "SECRET1", suppliedCode: undefined })).toBe(
      true,
    );
  });
});

describe("membership / capacity", () => {
  test("isServerMember mirrors roster inclusion", () => {
    expect(isServerMember(["alice", "bob"], "alice")).toBe(true);
    expect(isServerMember(["alice", "bob"], "carol")).toBe(false);
  });

  test("isServerFull ignores existing members and blocks non-members at capacity", () => {
    expect(isServerFull(["a", "b"], 2, "a")).toBe(false);
    expect(isServerFull(["a", "b"], 2, "c")).toBe(true);
    expect(isServerFull(["a"], 2, "c")).toBe(false);
  });

  test("withJoinedMember is idempotent and appends new members", () => {
    expect(withJoinedMember(["a"], "a")).toEqual(["a"]);
    expect(withJoinedMember(["a"], "b")).toEqual(["a", "b"]);
  });

  test("withoutMember preserves order of remaining members", () => {
    expect(withoutMember(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(withoutMember(["a"], "z")).toEqual(["a"]);
  });

  test("statusAfterLeave reopens empty rooms", () => {
    expect(statusAfterLeave(0, "running")).toBe("open");
    expect(statusAfterLeave(1, "running")).toBe("running");
    expect(statusAfterLeave(0, "closed")).toBe("open");
  });
});

describe("isPrivateJoinBlocked", () => {
  test("never blocks public or undefined visibility", () => {
    expect(
      isPrivateJoinBlocked({
        visibility: "public",
        memberUserIds: [],
        userId: "bob",
        joinCode: "SECRET1",
        suppliedCode: undefined,
      }),
    ).toBe(false);
    expect(
      isPrivateJoinBlocked({
        visibility: undefined,
        memberUserIds: [],
        userId: "bob",
        joinCode: "SECRET1",
        suppliedCode: undefined,
      }),
    ).toBe(false);
  });

  test("blocks non-members without a matching code on private servers", () => {
    expect(
      isPrivateJoinBlocked({
        visibility: "private",
        memberUserIds: ["alice"],
        userId: "bob",
        joinCode: "SECRET1",
        suppliedCode: undefined,
      }),
    ).toBe(true);
    expect(
      isPrivateJoinBlocked({
        visibility: "private",
        memberUserIds: ["alice"],
        userId: "bob",
        joinCode: "SECRET1",
        suppliedCode: "SECRET1",
      }),
    ).toBe(false);
    expect(
      isPrivateJoinBlocked({
        visibility: "private",
        memberUserIds: ["alice"],
        userId: "alice",
        joinCode: "SECRET1",
        suppliedCode: undefined,
      }),
    ).toBe(false);
  });
});

describe("isAutoJoinCandidate", () => {
  test("accepts existing members even on full or private rooms", () => {
    expect(
      isAutoJoinCandidate({
        memberUserIds: ["alice"],
        slotsPerServer: 1,
        visibility: "private",
        userId: "alice",
      }),
    ).toBe(true);
  });

  test("rejects full public rooms and private non-member rooms", () => {
    expect(
      isAutoJoinCandidate({
        memberUserIds: ["alice"],
        slotsPerServer: 1,
        visibility: "public",
        userId: "bob",
      }),
    ).toBe(false);
    expect(
      isAutoJoinCandidate({
        memberUserIds: [],
        slotsPerServer: 4,
        visibility: "private",
        userId: "bob",
      }),
    ).toBe(false);
  });

  test("accepts public rooms with free capacity", () => {
    expect(
      isAutoJoinCandidate({
        memberUserIds: ["alice"],
        slotsPerServer: 4,
        visibility: "public",
        userId: "bob",
      }),
    ).toBe(true);
  });
});

describe("slotsPerServer ceiling", () => {
  test("accepts a capacity one document can hold and rejects anything past it", () => {
    expect(validateSlotsPerServer(1).ok).toBe(true);
    expect(validateSlotsPerServer(JG_MAX_MEMBERS_PER_SERVER).ok).toBe(true);

    const tooMany = validateSlotsPerServer(10_000);
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.reason).toContain("JG_MAX_MEMBERS_PER_SERVER");
  });

  test("rejects a non-positive or fractional capacity", () => {
    expect(validateSlotsPerServer(0).ok).toBe(false);
    expect(validateSlotsPerServer(-4).ok).toBe(false);
    expect(validateSlotsPerServer(2.5).ok).toBe(false);
  });
});

describe("selectJoinTarget", () => {
  const room = (overrides: Partial<Parameters<typeof selectJoinTarget>[0][number]> = {}) => ({
    memberUserIds: [] as string[],
    slotsPerServer: 2,
    visibility: "public" as const,
    createdAt: 0,
    ...overrides,
  });

  test("auto fills a room with space and creates one when none has any", () => {
    expect(selectJoinTarget([room()], { userId: "alice" })).toEqual({ kind: "join", row: room() });
    expect(selectJoinTarget([room({ memberUserIds: ["a", "b"] })], { userId: "alice" })).toEqual({
      kind: "create",
    });
  });

  test("singleton refuses at capacity instead of quietly starting a second world", () => {
    const full = room({ memberUserIds: ["a", "b"], createdAt: 1 });
    expect(selectJoinTarget([full], { userId: "alice", mode: "singleton" })).toEqual({
      kind: "refuse",
      reason: "Server is full",
    });
  });

  test("singleton always targets the oldest world, never a newer shard", () => {
    const oldest = room({ createdAt: 1, memberUserIds: ["a"] });
    const newer = room({ createdAt: 9 });
    const target = selectJoinTarget([newer, oldest], { userId: "alice", mode: "singleton" });
    expect(target).toEqual({ kind: "join", row: oldest });
  });

  test("an existing member rejoins their own room under either mode", () => {
    const mine = room({ memberUserIds: ["alice", "b"], createdAt: 9 });
    for (const mode of ["auto", "singleton"] as const) {
      expect(selectJoinTarget([room({ createdAt: 1 }), mine], { userId: "alice", mode })).toEqual({
        kind: "join",
        row: mine,
      });
    }
  });

  test("singleton creates the world when none exists yet", () => {
    expect(selectJoinTarget([], { userId: "alice", mode: "singleton" })).toEqual({ kind: "create" });
  });
});
