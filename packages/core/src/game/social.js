const DEFAULT_INVITE_TTL_MS = 60_000;
export function createSocial(deps) {
    const now = deps.now ?? Date.now;
    const events = deps.events;
    const friendships = new Map();
    const blocked = new Map();
    const friendRequests = new Map();
    let requestCounter = 0;
    function requireSet(map, userId) {
        let set = map.get(userId);
        if (!set) {
            set = new Set();
            map.set(userId, set);
        }
        return set;
    }
    function pendingBetween(a, b) {
        for (const request of friendRequests.values()) {
            if ((request.from === a && request.to === b) || (request.from === b && request.to === a))
                return true;
        }
        return false;
    }
    function canRequest(fromUserId, toUserId) {
        if (fromUserId === toUserId)
            return { reason: "cannot friend yourself" };
        if (friendships.get(fromUserId)?.has(toUserId))
            return { reason: "already friends" };
        if (pendingBetween(fromUserId, toUserId))
            return { reason: "request already pending" };
        if (blocked.get(toUserId)?.has(fromUserId) || blocked.get(fromUserId)?.has(toUserId)) {
            return { reason: "blocked" };
        }
        return null;
    }
    const friends = {
        canRequest,
        request(fromUserId, toUserId) {
            const denied = canRequest(fromUserId, toUserId);
            if (denied !== null)
                return denied;
            requestCounter += 1;
            const requestId = `freq_${requestCounter}`;
            friendRequests.set(requestId, { from: fromUserId, to: toUserId });
            return { requestId };
        },
        accept(userId, requestId) {
            const request = friendRequests.get(requestId);
            if (request === undefined)
                return { reason: `unknown request "${requestId}"` };
            if (request.to !== userId)
                return { reason: "request is not addressed to this user" };
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
                const between = (request.from === userId && request.to === targetUserId) ||
                    (request.from === targetUserId && request.to === userId);
                if (between)
                    friendRequests.delete(requestId);
            }
        },
        list(userId) {
            return Array.from(friendships.get(userId) ?? [], (friendUserId) => ({
                userId: friendUserId,
                online: deps.presence?.(friendUserId).online ?? false,
            }));
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
    let partyConfig = null;
    const parties = new Map();
    const memberToParty = new Map();
    const partyInvites = new Map();
    let partyCounter = 0;
    let inviteCounter = 0;
    function partyOf(userId) {
        const partyId = memberToParty.get(userId);
        if (partyId === undefined)
            return null;
        return parties.get(partyId) ?? null;
    }
    function canInvite(fromUserId, toUserId) {
        if (partyConfig === null)
            return { reason: "party not configured" };
        if (fromUserId === toUserId)
            return { reason: "cannot invite yourself" };
        if (memberToParty.has(toUserId))
            return { reason: "already in a party" };
        const party = partyOf(fromUserId);
        if (party !== null && party.members.length >= partyConfig.maxMembers) {
            return { reason: "party full" };
        }
        return null;
    }
    function addMember(party, userId) {
        party.members.push(userId);
        memberToParty.set(userId, party.id);
        events.emit("social.party.joined", { userId, partyId: party.id });
    }
    function removeMember(party, userId) {
        party.members = party.members.filter((member) => member !== userId);
        memberToParty.delete(userId);
        events.emit("social.party.left", { userId, partyId: party.id });
        if (party.members.length === 0) {
            parties.delete(party.id);
            return;
        }
        if (party.leader === userId)
            party.leader = party.members[0];
    }
    const party = {
        register(config) {
            partyConfig = config;
        },
        canInvite,
        invite(fromUserId, toUserId) {
            const denied = canInvite(fromUserId, toUserId);
            if (denied !== null)
                return denied;
            inviteCounter += 1;
            const inviteId = `pinv_${inviteCounter}`;
            partyInvites.set(inviteId, { from: fromUserId, to: toUserId, createdAt: now() });
            return { inviteId };
        },
        accept(userId, inviteId) {
            if (partyConfig === null)
                return { reason: "party not configured" };
            const invite = partyInvites.get(inviteId);
            if (invite === undefined)
                return { reason: `unknown invite "${inviteId}"` };
            if (invite.to !== userId)
                return { reason: "invite is not addressed to this user" };
            const ttlMs = partyConfig.inviteTtlMs ?? DEFAULT_INVITE_TTL_MS;
            if (now() - invite.createdAt > ttlMs) {
                partyInvites.delete(inviteId);
                return { reason: "invite expired" };
            }
            if (memberToParty.has(userId))
                return { reason: "already in a party" };
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
            const created = { id: `party_${partyCounter}`, leader: invite.from, members: [] };
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
            if (current === null)
                return;
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
            if (current === null)
                return [];
            return current.members.map((member) => ({
                userId: member,
                role: member === current.leader ? "leader" : "member",
            }));
        },
        membersOf(userId) {
            return partyOf(userId)?.members.slice() ?? [];
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
    };
}
