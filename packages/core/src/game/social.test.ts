import { describe, expect, test } from "bun:test";

import { createGameEvents } from "./events";
import { createSocial } from "./social";

function requestId(result: { requestId: string } | { reason: string }): string {
  if (!("requestId" in result)) throw new Error(result.reason);
  return result.requestId;
}

function inviteId(result: { inviteId: string } | { reason: string }): string {
  if (!("inviteId" in result)) throw new Error(result.reason);
  return result.inviteId;
}

describe("social friends", () => {
  test("request and accept flow makes both users friends", () => {
    const events = createGameEvents();
    const added: { userId: string; friendUserId: string }[] = [];
    events.on("social.friend.added", (event) => void added.push(event));
    const social = createSocial({ events, presence: (userId) => ({ online: userId === "bob" }) });

    expect(social.friends.canRequest("alice", "alice")).toEqual({ reason: "cannot friend yourself" });
    const id = requestId(social.friends.request("alice", "bob"));
    expect(social.friends.canRequest("bob", "alice")).toEqual({ reason: "request already pending" });
    expect(social.friends.accept("carol", id)).toEqual({ reason: "request is not addressed to this user" });
    expect(social.friends.accept("bob", id)).toBeNull();

    expect(social.friends.list("alice")).toEqual([{ userId: "bob", online: true }]);
    expect(social.friends.list("bob")).toEqual([{ userId: "alice", online: false }]);
    expect(social.friends.canRequest("alice", "bob")).toEqual({ reason: "already friends" });
    expect(added).toEqual([
      { userId: "bob", friendUserId: "alice" },
      { userId: "alice", friendUserId: "bob" },
    ]);
  });

  test("block prevents requests and severs friendship", () => {
    const social = createSocial({ events: createGameEvents() });
    const id = requestId(social.friends.request("alice", "bob"));
    social.friends.accept("bob", id);
    social.friends.block("bob", "alice");

    expect(social.friends.list("bob")).toEqual([]);
    expect(social.friends.canRequest("alice", "bob")).toEqual({ reason: "blocked" });
  });

  test("snapshot and hydrate round-trip friends and blocks", () => {
    const social = createSocial({ events: createGameEvents() });
    const id = requestId(social.friends.request("alice", "bob"));
    social.friends.accept("bob", id);
    social.friends.block("alice", "mallory");

    const restored = createSocial({ events: createGameEvents() });
    restored.friends.hydrate("alice", social.friends.snapshot("alice"));
    expect(restored.friends.list("alice")).toEqual([{ userId: "bob", online: false }]);
    expect(restored.friends.canRequest("alice", "mallory")).toEqual({ reason: "blocked" });
  });
});

describe("social party", () => {
  function createParty(nowRef?: { value: number }, inviteTtlMs?: number) {
    const events = createGameEvents();
    const joined: string[] = [];
    const left: string[] = [];
    events.on("social.party.joined", (event) => void joined.push(event.userId));
    events.on("social.party.left", (event) => void left.push(event.userId));
    const social = createSocial({ events, now: nowRef === undefined ? undefined : () => nowRef.value });
    social.party.register({ maxMembers: 3, inviteTtlMs });
    return { social, joined, left };
  }

  test("invite requires registration and rejects self, members, and full parties", () => {
    const events = createGameEvents();
    const unregistered = createSocial({ events });
    expect(unregistered.party.canInvite("alice", "bob")).toEqual({ reason: "party not configured" });

    const { social } = createParty();
    expect(social.party.canInvite("alice", "alice")).toEqual({ reason: "cannot invite yourself" });
    social.party.accept("bob", inviteId(social.party.invite("alice", "bob")));
    social.party.accept("carol", inviteId(social.party.invite("alice", "carol")));
    expect(social.party.canInvite("alice", "bob")).toEqual({ reason: "already in a party" });
    expect(social.party.canInvite("alice", "dave")).toEqual({ reason: "party full" });
  });

  test("leader leaving promotes the next member", () => {
    const { social, joined, left } = createParty();
    social.party.accept("bob", inviteId(social.party.invite("alice", "bob")));
    social.party.accept("carol", inviteId(social.party.invite("alice", "carol")));

    expect(social.party.list("alice")).toEqual([
      { userId: "alice", role: "leader" },
      { userId: "bob", role: "member" },
      { userId: "carol", role: "member" },
    ]);

    social.party.leave("alice");
    expect(social.party.list("bob")).toEqual([
      { userId: "bob", role: "leader" },
      { userId: "carol", role: "member" },
    ]);
    expect(social.party.membersOf("carol")).toEqual(["bob", "carol"]);
    expect(joined).toEqual(["alice", "bob", "carol"]);
    expect(left).toEqual(["alice"]);
  });

  test("kick and promote are leader-only", () => {
    const { social } = createParty();
    social.party.accept("bob", inviteId(social.party.invite("alice", "bob")));
    social.party.accept("carol", inviteId(social.party.invite("alice", "carol")));

    expect(social.party.kick("bob", "carol")).toEqual({ reason: "not the party leader" });
    expect(social.party.promote("alice", "carol")).toBeNull();
    expect(social.party.kick("carol", "bob")).toBeNull();
    expect(social.party.list("carol")).toEqual([
      { userId: "alice", role: "member" },
      { userId: "carol", role: "leader" },
    ]);
  });

  test("invites expire after the configured ttl", () => {
    const nowRef = { value: 0 };
    const { social } = createParty(nowRef, 1000);
    const id = inviteId(social.party.invite("alice", "bob"));
    nowRef.value = 2000;
    expect(social.party.accept("bob", id)).toEqual({ reason: "invite expired" });
    expect(social.party.list("bob")).toEqual([]);
  });
});

describe("social presence", () => {
  test("presence.get defaults to offline and delegates when provided", () => {
    const offline = createSocial({ events: createGameEvents() });
    expect(offline.presence.get("alice")).toEqual({ online: false });

    const online = createSocial({
      events: createGameEvents(),
      presence: () => ({ online: true, zoneId: "downtown" }),
    });
    expect(online.presence.get("alice")).toEqual({ online: true, zoneId: "downtown" });
  });
});
