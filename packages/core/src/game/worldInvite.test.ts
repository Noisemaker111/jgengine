import { describe, expect, test } from "bun:test";

import { createGameEvents } from "./events";
import { createSocial } from "./social";

function inviteId(result: { inviteId: string } | { reason: string }): string {
  if (!("inviteId" in result)) throw new Error(result.reason);
  return result.inviteId;
}

function createInvites(nowRef?: { value: number }, worldInviteTtlMs?: number) {
  const events = createGameEvents();
  const invited: string[] = [];
  const accepted: string[] = [];
  events.on("social.world.invited", (event) => void invited.push(event.toUserId));
  events.on("social.world.accepted", (event) => void accepted.push(event.userId));
  const social = createSocial({
    events,
    now: nowRef === undefined ? undefined : () => nowRef.value,
    ...(worldInviteTtlMs === undefined ? {} : { worldInviteTtlMs }),
  });
  return { social, invited, accepted };
}

describe("social worldInvites", () => {
  test("invite and accept returns the join target and emits events", () => {
    const { social, invited, accepted } = createInvites();
    const id = inviteId(
      social.worldInvites.invite("alice", "bob", { serverId: "srv_1", joinCode: "ABC123" }),
    );
    expect(invited).toEqual(["bob"]);
    expect(social.worldInvites.listFor("bob")).toHaveLength(1);

    expect(social.worldInvites.accept("carol", id)).toEqual({
      reason: "invite is not addressed to this user",
    });
    expect(social.worldInvites.accept("bob", id)).toEqual({
      target: { serverId: "srv_1", joinCode: "ABC123" },
    });
    expect(accepted).toEqual(["bob"]);
    expect(social.worldInvites.listFor("bob")).toEqual([]);
    expect(social.worldInvites.accept("bob", id)).toEqual({ reason: `unknown invite "${id}"` });
  });

  test("rejects self-invites, blocked users, and duplicate pending invites", () => {
    const { social } = createInvites();
    expect(social.worldInvites.canInvite("alice", "alice")).toEqual({
      reason: "cannot invite yourself",
    });

    social.friends.block("bob", "mallory");
    expect(social.worldInvites.invite("mallory", "bob", { serverId: "srv_1" })).toEqual({
      reason: "blocked",
    });
    expect(social.worldInvites.invite("bob", "mallory", { serverId: "srv_1" })).toEqual({
      reason: "blocked",
    });

    inviteId(social.worldInvites.invite("alice", "bob", { serverId: "srv_1" }));
    expect(social.worldInvites.invite("alice", "bob", { serverId: "srv_2" })).toEqual({
      reason: "invite already pending",
    });
  });

  test("invites expire after the ttl", () => {
    const nowRef = { value: 1_000 };
    const { social } = createInvites(nowRef, 5_000);
    const id = inviteId(social.worldInvites.invite("alice", "bob", { serverId: "srv_1" }));

    nowRef.value = 6_001;
    expect(social.worldInvites.listFor("bob")).toEqual([]);
    expect(social.worldInvites.accept("bob", id)).toEqual({ reason: `unknown invite "${id}"` });

    const second = inviteId(social.worldInvites.invite("alice", "bob", { serverId: "srv_1" }));
    nowRef.value = 11_002;
    expect(social.worldInvites.accept("bob", second)).toEqual({ reason: "invite expired" });
  });

  test("expiry frees the pending-invite slot for a fresh invite", () => {
    const nowRef = { value: 0 };
    const { social } = createInvites(nowRef, 5_000);
    inviteId(social.worldInvites.invite("alice", "bob", { serverId: "srv_1" }));
    nowRef.value = 5_001;
    const fresh = social.worldInvites.invite("alice", "bob", { serverId: "srv_1" });
    expect("inviteId" in fresh).toBe(true);
  });

  test("decline removes only invites addressed to the caller", () => {
    const { social } = createInvites();
    const id = inviteId(social.worldInvites.invite("alice", "bob", { serverId: "srv_1" }));
    social.worldInvites.decline("carol", id);
    expect(social.worldInvites.listFor("bob")).toHaveLength(1);
    social.worldInvites.decline("bob", id);
    expect(social.worldInvites.listFor("bob")).toEqual([]);
  });

  test("listFor only returns invites addressed to the user", () => {
    const { social } = createInvites();
    inviteId(social.worldInvites.invite("alice", "bob", { serverId: "srv_1" }));
    inviteId(social.worldInvites.invite("alice", "carol", { serverId: "srv_2" }));
    expect(social.worldInvites.listFor("bob").map((entry) => entry.serverId)).toEqual(["srv_1"]);
    expect(social.worldInvites.listFor("carol").map((entry) => entry.serverId)).toEqual(["srv_2"]);
    expect(social.worldInvites.listFor("alice")).toEqual([]);
  });
});
