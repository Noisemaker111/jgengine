import { useState, type FormEvent, type ReactNode } from "react";
import type {
  FriendEntry,
  FriendRequestEntry,
  PartyInviteEntry,
  PartyMemberEntry,
  WorldInvite,
  WorldInviteTarget,
} from "@jgengine/core/game/social";
import {
  normalizeJoinCode,
  quickMatch,
  type MatchFilter,
  type SessionListing,
} from "@jgengine/core/multiplayer/matchmaking";
import { useGameContext } from "./provider";
import {
  useFriendRequests,
  useFriends,
  useParty,
  usePartyInvites,
  usePresence,
  useWorldInvites,
} from "./hooks";

export function PresenceDot({ userId, className }: { userId: string; className?: string }) {
  const presence = usePresence(userId);
  return (
    <span
      className={className}
      data-presence-dot
      data-user={userId}
      data-online={presence.online}
      data-server={presence.serverId}
    />
  );
}

export function FriendRow({
  friend,
  className,
  dotClassName,
  children,
}: {
  friend: FriendEntry;
  className?: string;
  dotClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className} data-friend={friend.userId} data-online={friend.online}>
      <PresenceDot userId={friend.userId} className={dotClassName} />
      <span data-friend-name>{friend.userId}</span>
      {children}
    </div>
  );
}

export function FriendsList({
  className,
  rowClassName,
  dotClassName,
  emptyState,
  renderFriend,
}: {
  className?: string;
  rowClassName?: string;
  dotClassName?: string;
  emptyState?: ReactNode;
  renderFriend?: (friend: FriendEntry) => ReactNode;
}) {
  const friends = useFriends();
  return (
    <div className={className} data-friends-list>
      {friends.length === 0
        ? emptyState ?? null
        : friends.map((friend) =>
            renderFriend !== undefined ? (
              renderFriend(friend)
            ) : (
              <FriendRow
                key={friend.userId}
                friend={friend}
                className={rowClassName}
                dotClassName={dotClassName}
              />
            ),
          )}
    </div>
  );
}

export function AddFriendButton({
  toUserId,
  className,
  children,
  onRequested,
  onRejected,
}: {
  toUserId: string;
  className?: string;
  children?: ReactNode;
  onRequested?: (requestId: string) => void;
  onRejected?: (reason: string) => void;
}) {
  const ctx = useGameContext();
  const denied = ctx.game.social.friends.canRequest(ctx.player.userId, toUserId);
  return (
    <button
      type="button"
      className={className}
      data-add-friend={toUserId}
      disabled={denied !== null}
      title={denied?.reason}
      onClick={() => {
        const result = ctx.game.social.friends.request(ctx.player.userId, toUserId);
        if ("reason" in result) onRejected?.(result.reason);
        else onRequested?.(result.requestId);
      }}
    >
      {children ?? "Add friend"}
    </button>
  );
}

export function FriendRequestsList({
  className,
  rowClassName,
  acceptClassName,
  declineClassName,
  emptyState,
  renderRequest,
}: {
  className?: string;
  rowClassName?: string;
  acceptClassName?: string;
  declineClassName?: string;
  emptyState?: ReactNode;
  renderRequest?: (request: FriendRequestEntry) => ReactNode;
}) {
  const ctx = useGameContext();
  const requests = useFriendRequests();
  return (
    <div className={className} data-friend-requests>
      {requests.length === 0
        ? emptyState ?? null
        : requests.map((request) =>
            renderRequest !== undefined ? (
              renderRequest(request)
            ) : (
              <div key={request.requestId} className={rowClassName} data-friend-request={request.requestId}>
                <span data-request-from>{request.fromUserId}</span>
                <button
                  type="button"
                  className={acceptClassName}
                  data-accept
                  onClick={() => ctx.game.social.friends.accept(ctx.player.userId, request.requestId)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className={declineClassName}
                  data-decline
                  onClick={() => ctx.game.social.friends.decline(ctx.player.userId, request.requestId)}
                >
                  Decline
                </button>
              </div>
            ),
          )}
    </div>
  );
}

export function PartyMemberRow({
  member,
  className,
  dotClassName,
  children,
}: {
  member: PartyMemberEntry;
  className?: string;
  dotClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className} data-party-member={member.userId} data-role={member.role}>
      <PresenceDot userId={member.userId} className={dotClassName} />
      <span data-member-name>{member.userId}</span>
      {children}
    </div>
  );
}

export function PartyFrame({
  className,
  rowClassName,
  dotClassName,
  emptyState,
  renderMember,
}: {
  className?: string;
  rowClassName?: string;
  dotClassName?: string;
  emptyState?: ReactNode;
  renderMember?: (member: PartyMemberEntry) => ReactNode;
}) {
  const members = useParty();
  return (
    <div className={className} data-party-frame data-party-size={members.length}>
      {members.length === 0
        ? emptyState ?? null
        : members.map((member) =>
            renderMember !== undefined ? (
              renderMember(member)
            ) : (
              <PartyMemberRow
                key={member.userId}
                member={member}
                className={rowClassName}
                dotClassName={dotClassName}
              />
            ),
          )}
    </div>
  );
}

export function PartyInviteToast({
  className,
  acceptClassName,
  declineClassName,
  renderInvite,
}: {
  className?: string;
  acceptClassName?: string;
  declineClassName?: string;
  renderInvite?: (invite: PartyInviteEntry) => ReactNode;
}) {
  const ctx = useGameContext();
  const invites = usePartyInvites();
  if (invites.length === 0) return null;
  return (
    <div className={className} data-party-invites>
      {invites.map((invite) =>
        renderInvite !== undefined ? (
          renderInvite(invite)
        ) : (
          <div key={invite.inviteId} data-party-invite={invite.inviteId}>
            <span data-invite-from>{invite.fromUserId}</span>
            <button
              type="button"
              className={acceptClassName}
              data-accept
              onClick={() => ctx.game.social.party.accept(ctx.player.userId, invite.inviteId)}
            >
              Join
            </button>
            <button
              type="button"
              className={declineClassName}
              data-decline
              onClick={() => ctx.game.social.party.decline(ctx.player.userId, invite.inviteId)}
            >
              Decline
            </button>
          </div>
        ),
      )}
    </div>
  );
}

export function LeavePartyButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const ctx = useGameContext();
  const members = useParty();
  if (members.length === 0) return null;
  return (
    <button
      type="button"
      className={className}
      data-leave-party
      onClick={() => ctx.game.social.party.leave(ctx.player.userId)}
    >
      {children ?? "Leave party"}
    </button>
  );
}

export function WorldInviteToast({
  className,
  acceptClassName,
  declineClassName,
  onAccepted,
  renderInvite,
}: {
  className?: string;
  acceptClassName?: string;
  declineClassName?: string;
  onAccepted: (target: WorldInviteTarget) => void;
  renderInvite?: (invite: WorldInvite) => ReactNode;
}) {
  const ctx = useGameContext();
  const invites = useWorldInvites();
  if (invites.length === 0) return null;
  return (
    <div className={className} data-world-invites>
      {invites.map((invite) =>
        renderInvite !== undefined ? (
          renderInvite(invite)
        ) : (
          <div key={invite.id} data-world-invite={invite.id}>
            <span data-invite-from>{invite.fromUserId}</span>
            <span data-invite-server>{invite.serverId}</span>
            <button
              type="button"
              className={acceptClassName}
              data-accept
              onClick={() => {
                const result = ctx.game.social.worldInvites.accept(ctx.player.userId, invite.id);
                if ("target" in result) onAccepted(result.target);
              }}
            >
              Join
            </button>
            <button
              type="button"
              className={declineClassName}
              data-decline
              onClick={() => ctx.game.social.worldInvites.decline(ctx.player.userId, invite.id)}
            >
              Decline
            </button>
          </div>
        ),
      )}
    </div>
  );
}

export function InviteToWorldButton({
  toUserId,
  target,
  className,
  children,
  onInvited,
  onRejected,
}: {
  toUserId: string;
  target: WorldInviteTarget;
  className?: string;
  children?: ReactNode;
  onInvited?: (inviteId: string) => void;
  onRejected?: (reason: string) => void;
}) {
  const ctx = useGameContext();
  const denied = ctx.game.social.worldInvites.canInvite(ctx.player.userId, toUserId);
  return (
    <button
      type="button"
      className={className}
      data-invite-to-world={toUserId}
      disabled={denied !== null}
      title={denied?.reason}
      onClick={() => {
        const result = ctx.game.social.worldInvites.invite(ctx.player.userId, toUserId, target);
        if ("reason" in result) onRejected?.(result.reason);
        else onInvited?.(result.inviteId);
      }}
    >
      {children ?? "Invite to world"}
    </button>
  );
}

export function WorldBrowser({
  listings,
  onJoin,
  className,
  rowClassName,
  joinClassName,
  emptyState,
  renderListing,
}: {
  listings: readonly SessionListing[];
  onJoin: (listing: SessionListing) => void;
  className?: string;
  rowClassName?: string;
  joinClassName?: string;
  emptyState?: ReactNode;
  renderListing?: (listing: SessionListing) => ReactNode;
}) {
  return (
    <div className={className} data-world-browser>
      {listings.length === 0
        ? emptyState ?? null
        : listings.map((listing) =>
            renderListing !== undefined ? (
              renderListing(listing)
            ) : (
              <div
                key={listing.serverId}
                className={rowClassName}
                data-world={listing.serverId}
                data-mode={listing.mode}
                data-full={listing.memberCount >= listing.slotsPerServer}
              >
                <span data-world-label>{listing.label ?? listing.serverId}</span>
                <span data-world-count>
                  {listing.memberCount}/{listing.slotsPerServer}
                </span>
                <button
                  type="button"
                  className={joinClassName}
                  data-join
                  disabled={listing.memberCount >= listing.slotsPerServer}
                  onClick={() => onJoin(listing)}
                >
                  Join
                </button>
              </div>
            ),
          )}
    </div>
  );
}

export function JoinByCode({
  onJoin,
  className,
  inputClassName,
  buttonClassName,
  placeholder,
  children,
}: {
  onJoin: (code: string) => void;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  placeholder?: string;
  children?: ReactNode;
}) {
  const [code, setCode] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeJoinCode(code);
    if (normalized.length === 0) return;
    onJoin(normalized);
    setCode("");
  }
  return (
    <form className={className} data-join-by-code onSubmit={submit}>
      <input
        className={inputClassName}
        type="text"
        value={code}
        placeholder={placeholder ?? "Join code"}
        onChange={(event) => setCode(event.target.value)}
      />
      <button type="submit" className={buttonClassName} data-join>
        {children ?? "Join"}
      </button>
    </form>
  );
}

export function QuickMatchButton({
  listings,
  onJoin,
  onNoMatch,
  filter,
  className,
  children,
}: {
  listings: readonly SessionListing[];
  onJoin: (listing: SessionListing) => void;
  onNoMatch?: () => void;
  filter?: MatchFilter;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      data-quick-match
      onClick={() => {
        const match = quickMatch(listings, filter);
        if (match === null) onNoMatch?.();
        else onJoin(match);
      }}
    >
      {children ?? "Quick match"}
    </button>
  );
}

export function EmoteWheel({
  emotes,
  radius,
  open = true,
  className,
  emoteClassName,
  onPlayed,
  onRejected,
  renderEmote,
}: {
  emotes: readonly string[];
  radius?: number;
  open?: boolean;
  className?: string;
  emoteClassName?: string;
  onPlayed?: (emoteId: string) => void;
  onRejected?: (reason: string) => void;
  renderEmote?: (emoteId: string) => ReactNode;
}) {
  const ctx = useGameContext();
  if (!open) return null;
  return (
    <div className={className} role="menu" data-emote-wheel data-emote-count={emotes.length}>
      {emotes.map((emoteId, index) => (
        <button
          key={emoteId}
          type="button"
          role="menuitem"
          className={emoteClassName}
          data-emote={emoteId}
          data-emote-index={index}
          onClick={() => {
            const result = ctx.game.social.emotes.play(ctx.player.userId, emoteId, radius);
            if ("reason" in result) onRejected?.(result.reason);
            else onPlayed?.(emoteId);
          }}
        >
          {renderEmote !== undefined ? renderEmote(emoteId) : emoteId}
        </button>
      ))}
    </div>
  );
}
