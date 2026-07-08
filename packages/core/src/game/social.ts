import type { GameEventMap, GameEvents } from "./events";

export interface PresenceInfo {
  online: boolean;
  serverId?: string;
  zoneId?: string;
  instanceId?: string;
}

export interface EmoteEntityLookup {
  get(id: string): { position: readonly [number, number, number]; role: string } | null;
}

export interface EmoteSpatialLookup {
  inRadius(
    center: readonly [number, number, number],
    radius: number,
    filter?: (id: string) => boolean,
  ): readonly string[];
}

export interface EmotesDeps {
  entities: EmoteEntityLookup;
  spatial: EmoteSpatialLookup;
}

export interface SocialDeps {
  events: GameEvents;
  presence?: (userId: string) => PresenceInfo;
  now?: () => number;
  emotes?: EmotesDeps;
  worldInviteTtlMs?: number;
}

export interface FriendEntry {
  userId: string;
  online: boolean;
}

export interface FriendsSnapshot {
  friends: string[];
  blocked: string[];
}

export interface FriendRequestEntry {
  requestId: string;
  fromUserId: string;
}

export interface Friends {
  canRequest(fromUserId: string, toUserId: string): { reason: string } | null;
  request(fromUserId: string, toUserId: string): { requestId: string } | { reason: string };
  accept(userId: string, requestId: string): { reason: string } | null;
  decline(userId: string, requestId: string): void;
  remove(userId: string, friendUserId: string): void;
  block(userId: string, targetUserId: string): void;
  list(userId: string): FriendEntry[];
  requestsFor(userId: string): FriendRequestEntry[];
  snapshot(userId: string): FriendsSnapshot;
  hydrate(userId: string, data: FriendsSnapshot): void;
}

export type PartyRole = "leader" | "member";

export interface PartyMemberEntry {
  userId: string;
  role: PartyRole;
}

export interface PartyConfig {
  maxMembers: number;
  inviteTtlMs?: number;
}

export interface PartyInviteEntry {
  inviteId: string;
  fromUserId: string;
  createdAt: number;
}

export interface Party {
  register(config: PartyConfig): void;
  canInvite(fromUserId: string, toUserId: string): { reason: string } | null;
  invite(fromUserId: string, toUserId: string): { inviteId: string } | { reason: string };
  accept(userId: string, inviteId: string): { reason: string } | null;
  decline(userId: string, inviteId: string): void;
  kick(leaderUserId: string, memberUserId: string): { reason: string } | null;
  leave(userId: string): void;
  promote(leaderUserId: string, memberUserId: string): { reason: string } | null;
  list(userId: string): PartyMemberEntry[];
  membersOf(userId: string): string[];
  invitesFor(userId: string): PartyInviteEntry[];
}

export const DEFAULT_EMOTE_RADIUS = 20;

export interface EmoteBroadcastResult {
  from: string;
  emoteId: string;
  at: readonly [number, number, number];
  recipients: readonly string[];
}

export interface Emotes {
  play(fromUserId: string, emoteId: string, radius?: number): EmoteBroadcastResult | { reason: string };
}

export interface WorldInviteTarget {
  serverId: string;
  joinCode?: string;
}

export interface WorldInvite extends WorldInviteTarget {
  id: string;
  fromUserId: string;
  toUserId: string;
  createdAt: number;
}

export interface WorldInvites {
  canInvite(fromUserId: string, toUserId: string): { reason: string } | null;
  invite(
    fromUserId: string,
    toUserId: string,
    target: WorldInviteTarget,
  ): { inviteId: string } | { reason: string };
  accept(userId: string, inviteId: string): { target: WorldInviteTarget } | { reason: string };
  decline(userId: string, inviteId: string): void;
  listFor(userId: string): WorldInvite[];
}

export interface Social {
  friends: Friends;
  party: Party;
  presence: { get(userId: string): PresenceInfo };
  emotes: Emotes;
  worldInvites: WorldInvites;
}

interface FriendRequest {
  from: string;
  to: string;
}

interface PartyState {
  id: string;
  leader: string;
  members: string[];
}

interface PartyInvite {
  from: string;
  to: string;
  createdAt: number;
}

const DEFAULT_INVITE_TTL_MS = 60_000;

export function createSocial(deps: SocialDeps): Social {
  const now = deps.now ?? Date.now;
  const events = deps.events;

  const friendships = new Map<string, Set<string>>();
  const blocked = new Map<string, Set<string>>();
  const friendRequests = new Map<string, FriendRequest>();
  let requestCounter = 0;

  function requireSet(map: Map<string, Set<string>>, userId: string): Set<string> {
    let set = map.get(userId);
    if (!set) {
      set = new Set();
      map.set(userId, set);
    }
    return set;
  }

  function pendingBetween(a: string, b: string): boolean {
    for (const request of friendRequests.values()) {
      if ((request.from === a && request.to === b) || (request.from === b && request.to === a)) return true;
    }
    return false;
  }

  function canRequest(fromUserId: string, toUserId: string): { reason: string } | null {
    if (fromUserId === toUserId) return { reason: "cannot friend yourself" };
    if (friendships.get(fromUserId)?.has(toUserId)) return { reason: "already friends" };
    if (pendingBetween(fromUserId, toUserId)) return { reason: "request already pending" };
    if (blocked.get(toUserId)?.has(fromUserId) || blocked.get(fromUserId)?.has(toUserId)) {
      return { reason: "blocked" };
    }
    return null;
  }

  const friends: Friends = {
    canRequest,
    request(fromUserId, toUserId) {
      const denied = canRequest(fromUserId, toUserId);
      if (denied !== null) return denied;
      requestCounter += 1;
      const requestId = `freq_${requestCounter}`;
      friendRequests.set(requestId, { from: fromUserId, to: toUserId });
      return { requestId };
    },
    accept(userId, requestId) {
      const request = friendRequests.get(requestId);
      if (request === undefined) return { reason: `unknown request "${requestId}"` };
      if (request.to !== userId) return { reason: "request is not addressed to this user" };
      friendRequests.delete(requestId);
      requireSet(friendships, request.from).add(request.to);
      requireSet(friendships, request.to).add(request.from);
      events.emit("social.friend.added", { userId: request.to, friendUserId: request.from });
      events.emit("social.friend.added", { userId: request.from, friendUserId: request.to });
      return null;
    },
    remove(userId, friendUserId) {
      friendships.get(userId)?.delete(friendUserId);
      friendships.get(friendUserId)?.delete(userId);
    },
    block(userId, targetUserId) {
      requireSet(blocked, userId).add(targetUserId);
      friends.remove(userId, targetUserId);
      for (const [requestId, request] of friendRequests) {
        const between =
          (request.from === userId && request.to === targetUserId) ||
          (request.from === targetUserId && request.to === userId);
        if (between) friendRequests.delete(requestId);
      }
    },
    decline(userId, requestId) {
      const request = friendRequests.get(requestId);
      if (request !== undefined && request.to === userId) friendRequests.delete(requestId);
    },
    list(userId) {
      return Array.from(friendships.get(userId) ?? [], (friendUserId) => ({
        userId: friendUserId,
        online: deps.presence?.(friendUserId).online ?? false,
      }));
    },
    requestsFor(userId) {
      const entries: FriendRequestEntry[] = [];
      for (const [requestId, request] of friendRequests) {
        if (request.to === userId) entries.push({ requestId, fromUserId: request.from });
      }
      return entries;
    },
    snapshot(userId) {
      return {
        friends: Array.from(friendships.get(userId) ?? []),
        blocked: Array.from(blocked.get(userId) ?? []),
      };
    },
    hydrate(userId, data) {
      friendships.set(userId, new Set(data.friends));
      blocked.set(userId, new Set(data.blocked));
    },
  };

  let partyConfig: PartyConfig | null = null;
  const parties = new Map<string, PartyState>();
  const memberToParty = new Map<string, string>();
  const partyInvites = new Map<string, PartyInvite>();
  let partyCounter = 0;
  let inviteCounter = 0;

  function partyOf(userId: string): PartyState | null {
    const partyId = memberToParty.get(userId);
    if (partyId === undefined) return null;
    return parties.get(partyId) ?? null;
  }

  function canInvite(fromUserId: string, toUserId: string): { reason: string } | null {
    if (partyConfig === null) return { reason: "party not configured" };
    if (fromUserId === toUserId) return { reason: "cannot invite yourself" };
    if (memberToParty.has(toUserId)) return { reason: "already in a party" };
    const party = partyOf(fromUserId);
    if (party !== null && party.members.length >= partyConfig.maxMembers) {
      return { reason: "party full" };
    }
    return null;
  }

  function addMember(party: PartyState, userId: string): void {
    party.members.push(userId);
    memberToParty.set(userId, party.id);
    events.emit("social.party.joined", { userId, partyId: party.id });
  }

  function removeMember(party: PartyState, userId: string): void {
    party.members = party.members.filter((member) => member !== userId);
    memberToParty.delete(userId);
    events.emit("social.party.left", { userId, partyId: party.id });
    if (party.members.length === 0) {
      parties.delete(party.id);
      return;
    }
    if (party.leader === userId) party.leader = party.members[0]!;
  }

  const party: Party = {
    register(config) {
      partyConfig = config;
    },
    canInvite,
    invite(fromUserId, toUserId) {
      const denied = canInvite(fromUserId, toUserId);
      if (denied !== null) return denied;
      inviteCounter += 1;
      const inviteId = `pinv_${inviteCounter}`;
      partyInvites.set(inviteId, { from: fromUserId, to: toUserId, createdAt: now() });
      return { inviteId };
    },
    accept(userId, inviteId) {
      if (partyConfig === null) return { reason: "party not configured" };
      const invite = partyInvites.get(inviteId);
      if (invite === undefined) return { reason: `unknown invite "${inviteId}"` };
      if (invite.to !== userId) return { reason: "invite is not addressed to this user" };
      const ttlMs = partyConfig.inviteTtlMs ?? DEFAULT_INVITE_TTL_MS;
      if (now() - invite.createdAt > ttlMs) {
        partyInvites.delete(inviteId);
        return { reason: "invite expired" };
      }
      if (memberToParty.has(userId)) return { reason: "already in a party" };
      const existing = partyOf(invite.from);
      if (existing !== null && existing.members.length >= partyConfig.maxMembers) {
        return { reason: "party full" };
      }
      partyInvites.delete(inviteId);
      if (existing !== null) {
        addMember(existing, userId);
        return null;
      }
      partyCounter += 1;
      const created: PartyState = { id: `party_${partyCounter}`, leader: invite.from, members: [] };
      parties.set(created.id, created);
      addMember(created, invite.from);
      addMember(created, userId);
      return null;
    },
    kick(leaderUserId, memberUserId) {
      const leaderParty = partyOf(leaderUserId);
      if (leaderParty === null || leaderParty.leader !== leaderUserId) {
        return { reason: "not the party leader" };
      }
      if (!leaderParty.members.includes(memberUserId) || memberUserId === leaderUserId) {
        return { reason: "not a member of this party" };
      }
      removeMember(leaderParty, memberUserId);
      return null;
    },
    leave(userId) {
      const current = partyOf(userId);
      if (current === null) return;
      removeMember(current, userId);
    },
    promote(leaderUserId, memberUserId) {
      const leaderParty = partyOf(leaderUserId);
      if (leaderParty === null || leaderParty.leader !== leaderUserId) {
        return { reason: "not the party leader" };
      }
      if (!leaderParty.members.includes(memberUserId)) {
        return { reason: "not a member of this party" };
      }
      leaderParty.leader = memberUserId;
      return null;
    },
    list(userId) {
      const current = partyOf(userId);
      if (current === null) return [];
      return current.members.map((member) => ({
        userId: member,
        role: member === current.leader ? "leader" : "member",
      }));
    },
    decline(userId, inviteId) {
      const invite = partyInvites.get(inviteId);
      if (invite !== undefined && invite.to === userId) partyInvites.delete(inviteId);
    },
    membersOf(userId) {
      return partyOf(userId)?.members.slice() ?? [];
    },
    invitesFor(userId) {
      const ttlMs = partyConfig?.inviteTtlMs ?? DEFAULT_INVITE_TTL_MS;
      const cutoff = now() - ttlMs;
      const entries: PartyInviteEntry[] = [];
      for (const [inviteId, invite] of partyInvites) {
        if (invite.createdAt < cutoff) {
          partyInvites.delete(inviteId);
          continue;
        }
        if (invite.to === userId) {
          entries.push({ inviteId, fromUserId: invite.from, createdAt: invite.createdAt });
        }
      }
      return entries;
    },
  };

  const worldInviteTtlMs = deps.worldInviteTtlMs ?? DEFAULT_INVITE_TTL_MS;
  const worldInviteEntries = new Map<string, WorldInvite>();
  let worldInviteCounter = 0;

  function pruneWorldInvites(): void {
    const cutoff = now() - worldInviteTtlMs;
    for (const [id, entry] of worldInviteEntries) {
      if (entry.createdAt < cutoff) worldInviteEntries.delete(id);
    }
  }

  function canWorldInvite(fromUserId: string, toUserId: string): { reason: string } | null {
    if (fromUserId === toUserId) return { reason: "cannot invite yourself" };
    if (blocked.get(toUserId)?.has(fromUserId) || blocked.get(fromUserId)?.has(toUserId)) {
      return { reason: "blocked" };
    }
    pruneWorldInvites();
    for (const entry of worldInviteEntries.values()) {
      if (entry.fromUserId === fromUserId && entry.toUserId === toUserId) {
        return { reason: "invite already pending" };
      }
    }
    return null;
  }

  const worldInvites: WorldInvites = {
    canInvite: canWorldInvite,
    invite(fromUserId, toUserId, target) {
      const denied = canWorldInvite(fromUserId, toUserId);
      if (denied !== null) return denied;
      worldInviteCounter += 1;
      const inviteId = `winv_${worldInviteCounter}`;
      const entry: WorldInvite = {
        id: inviteId,
        fromUserId,
        toUserId,
        serverId: target.serverId,
        createdAt: now(),
      };
      if (target.joinCode !== undefined) entry.joinCode = target.joinCode;
      worldInviteEntries.set(inviteId, entry);
      const invited: GameEventMap["social.world.invited"] = {
        inviteId,
        fromUserId,
        toUserId,
        serverId: target.serverId,
      };
      if (target.joinCode !== undefined) invited.joinCode = target.joinCode;
      events.emit("social.world.invited", invited);
      return { inviteId };
    },
    accept(userId, inviteId) {
      const entry = worldInviteEntries.get(inviteId);
      if (entry === undefined) return { reason: `unknown invite "${inviteId}"` };
      if (entry.toUserId !== userId) return { reason: "invite is not addressed to this user" };
      if (now() - entry.createdAt > worldInviteTtlMs) {
        worldInviteEntries.delete(inviteId);
        return { reason: "invite expired" };
      }
      worldInviteEntries.delete(inviteId);
      const target: WorldInviteTarget = { serverId: entry.serverId };
      if (entry.joinCode !== undefined) target.joinCode = entry.joinCode;
      const accepted: GameEventMap["social.world.accepted"] = {
        inviteId,
        userId,
        fromUserId: entry.fromUserId,
        serverId: entry.serverId,
      };
      if (entry.joinCode !== undefined) accepted.joinCode = entry.joinCode;
      events.emit("social.world.accepted", accepted);
      return { target };
    },
    decline(userId, inviteId) {
      const entry = worldInviteEntries.get(inviteId);
      if (entry !== undefined && entry.toUserId === userId) worldInviteEntries.delete(inviteId);
    },
    listFor(userId) {
      pruneWorldInvites();
      return Array.from(worldInviteEntries.values()).filter((entry) => entry.toUserId === userId);
    },
  };

  const emotes: Emotes = {
    play(fromUserId, emoteId, radius) {
      const emoteDeps = deps.emotes;
      if (emoteDeps === undefined) return { reason: "emotes not configured" };
      const origin = emoteDeps.entities.get(fromUserId);
      if (origin === null) return { reason: `entity "${fromUserId}" is not spawned` };
      const recipients = emoteDeps.spatial.inRadius(
        origin.position,
        radius ?? DEFAULT_EMOTE_RADIUS,
        (id) => id !== fromUserId && emoteDeps.entities.get(id)?.role === "player",
      );
      const result: EmoteBroadcastResult = { from: fromUserId, emoteId, at: origin.position, recipients };
      events.emit("emote.played", result);
      return result;
    },
  };

  return {
    friends,
    party,
    presence: {
      get(userId) {
        return deps.presence?.(userId) ?? { online: false };
      },
    },
    emotes,
    worldInvites,
  };
}
