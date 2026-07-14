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

  test("whole-social snapshot replicates party membership and pending invites to a mirror", () => {
    const { social } = createParty();
    social.party.accept("bob", inviteId(social.party.invite("alice", "bob")));
    const pending = inviteId(social.party.invite("alice", "carol"));

    const mirror = createSocial({ events: createGameEvents() });
    mirror.party.register({ maxMembers: 3 });
    mirror.hydrate(social.snapshot());

    expect(mirror.party.list("bob")).toEqual([
      { userId: "alice", role: "leader" },
      { userId: "bob", role: "member" },
    ]);
    expect(mirror.party.membersOf("alice")).toEqual(["alice", "bob"]);
    expect(mirror.party.invitesFor("carol")).toEqual([
      { inviteId: pending, fromUserId: "alice", createdAt: expect.any(Number) },
    ]);
  });

  test("invitesFor lists pending invites, prunes expired, and decline is addressee-only", () => {
    const nowRef = { value: 0 };
    const { social } = createParty(nowRef, 1000);
    const first = inviteId(social.party.invite("alice", "bob"));
    expect(social.party.invitesFor("bob")).toEqual([
      { inviteId: first, fromUserId: "alice", createdAt: 0 },
    ]);
    expect(social.party.invitesFor("carol")).toEqual([]);

    social.party.decline("carol", first);
    expect(social.party.invitesFor("bob")).toHaveLength(1);
    social.party.decline("bob", first);
    expect(social.party.invitesFor("bob")).toEqual([]);

    inviteId(social.party.invite("alice", "bob"));
    nowRef.value = 2000;
    expect(social.party.invitesFor("bob")).toEqual([]);
  });
});

describe("friend requests listing", () => {
  test("requestsFor lists incoming requests and decline is addressee-only", () => {
    const social = createSocial({ events: createGameEvents() });
    const id = requestId(social.friends.request("alice", "bob"));
    social.friends.request("bob", "carol");

    expect(social.friends.requestsFor("bob")).toEqual([{ requestId: id, fromUserId: "alice" }]);
    expect(social.friends.requestsFor("alice")).toEqual([]);

    social.friends.decline("carol", id);
    expect(social.friends.requestsFor("bob")).toHaveLength(1);
    social.friends.decline("bob", id);
    expect(social.friends.requestsFor("bob")).toEqual([]);
    expect(social.friends.canRequest("alice", "bob")).toBeNull();
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

describe("social emotes", () => {
  interface FakeEntity {
    position: readonly [number, number, number];
    role: string;
  }

  function createEmoteHarness(entries: Record<string, FakeEntity>) {
    return {
      entities: { get: (id: string) => entries[id] ?? null },
      spatial: {
        inRadius: (center: readonly [number, number, number], radius: number, filter?: (id: string) => boolean) =>
          Object.entries(entries)
            .filter(([id, entity]) => {
              if (filter !== undefined && !filter(id)) return false;
              const dx = entity.position[0] - center[0];
              const dz = entity.position[2] - center[2];
              return Math.sqrt(dx * dx + dz * dz) <= radius;
            })
            .map(([id]) => id),
      },
    };
  }

  test("play without emotes configured is rejected", () => {
    const social = createSocial({ events: createGameEvents() });
    expect(social.emotes.play("alice", "wave")).toEqual({ reason: "emotes not configured" });
  });

  test("play broadcasts to nearby player entities only, excluding self and non-players", () => {
    const events = createGameEvents();
    const played: { from: string; emoteId: string; recipients: readonly string[] }[] = [];
    events.on("emote.played", (event) => void played.push(event));

    const emotes = createEmoteHarness({
      alice: { position: [0, 0, 0], role: "player" },
      bob: { position: [5, 0, 0], role: "player" },
      carol: { position: [100, 0, 0], role: "player" },
      wolf: { position: [2, 0, 0], role: "npc" },
    });
    const social = createSocial({ events, emotes });

    const result = social.emotes.play("alice", "wave", 10);
    expect(result).toEqual({ from: "alice", emoteId: "wave", at: [0, 0, 0], recipients: ["bob"] });
    expect(played).toEqual([{ from: "alice", emoteId: "wave", at: [0, 0, 0], recipients: ["bob"] }]);
  });

  test("play rejects when the source entity is not spawned", () => {
    const emotes = createEmoteHarness({});
    const social = createSocial({ events: createGameEvents(), emotes });
    expect(social.emotes.play("ghost", "wave")).toEqual({ reason: 'entity "ghost" is not spawned' });
  });
});
