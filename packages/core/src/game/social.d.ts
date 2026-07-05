import type { GameEvents } from "./events";
export interface PresenceInfo {
    online: boolean;
    serverId?: string;
    zoneId?: string;
    instanceId?: string;
}
export interface SocialDeps {
    events: GameEvents;
    presence?: (userId: string) => PresenceInfo;
    now?: () => number;
}
export interface FriendEntry {
    userId: string;
    online: boolean;
}
export interface FriendsSnapshot {
    friends: string[];
    blocked: string[];
}
export interface Friends {
    canRequest(fromUserId: string, toUserId: string): {
        reason: string;
    } | null;
    request(fromUserId: string, toUserId: string): {
        requestId: string;
    } | {
        reason: string;
    };
    accept(userId: string, requestId: string): {
        reason: string;
    } | null;
    remove(userId: string, friendUserId: string): void;
    block(userId: string, targetUserId: string): void;
    list(userId: string): FriendEntry[];
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
export interface Party {
    register(config: PartyConfig): void;
    canInvite(fromUserId: string, toUserId: string): {
        reason: string;
    } | null;
    invite(fromUserId: string, toUserId: string): {
        inviteId: string;
    } | {
        reason: string;
    };
    accept(userId: string, inviteId: string): {
        reason: string;
    } | null;
    kick(leaderUserId: string, memberUserId: string): {
        reason: string;
    } | null;
    leave(userId: string): void;
    promote(leaderUserId: string, memberUserId: string): {
        reason: string;
    } | null;
    list(userId: string): PartyMemberEntry[];
    membersOf(userId: string): string[];
}
export interface Social {
    friends: Friends;
    party: Party;
    presence: {
        get(userId: string): PresenceInfo;
    };
}
export declare function createSocial(deps: SocialDeps): Social;
