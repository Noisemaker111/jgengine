import { describe, expect, test } from "bun:test";

import {
  canJoinPrivateServer,
  isAutoJoinCandidate,
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
