import { useMemo, useState } from "react";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { SessionListing } from "@jgengine/core/multiplayer/matchmaking";
import type { WorldInviteTarget } from "@jgengine/core/game/social";
import { createLocalVoiceTransport } from "@jgengine/core/multiplayer/voiceContract";
import { ChatPanel } from "@jgengine/react/chat";
import { usePlayer } from "@jgengine/react/hooks";
import {
  AddFriendButton,
  EmoteWheel,
  FriendRequestsList,
  FriendsList,
  FriendRow,
  InviteToWorldButton,
  JoinByCode,
  LeavePartyButton,
  PartyFrame,
  PartyInviteToast,
  QuickMatchButton,
  WorldBrowser,
  WorldInviteToast,
} from "@jgengine/react/social";
import { MicToggle, PushToTalkButton, useVoice, VoiceRoster } from "@jgengine/react/voice";

import type { PlayableGame } from "../registry";
import { demoGame } from "./demoGame";

const FRIEND_RIN = "rin";
const FRIEND_KIRA = "kira";
const STRANGER = "nova";
const HUB_SESSION: WorldInviteTarget = { serverId: "srv_hub", joinCode: "HUB001" };
const DEMO_EMOTES = ["wave", "dance", "laugh", "point"] as const;

export const DEMO_WORLD_LISTINGS: SessionListing[] = [
  {
    serverId: "srv_mesa",
    gameId: "social-hub",
    status: "running",
    visibility: "public",
    memberCount: 3,
    slotsPerServer: 8,
    label: "Mesa Flats",
    mode: "coop",
    updatedAt: 3,
  },
  {
    serverId: "srv_reef",
    gameId: "social-hub",
    status: "open",
    visibility: "public",
    memberCount: 7,
    slotsPerServer: 8,
    label: "Coral Reef",
    mode: "coop",
    updatedAt: 2,
  },
  {
    serverId: "srv_full",
    gameId: "social-hub",
    status: "running",
    visibility: "public",
    memberCount: 8,
    slotsPerServer: 8,
    label: "Packed House",
    mode: "pvp",
    updatedAt: 1,
  },
];

function acceptFriend(ctx: GameContext, fromUserId: string): void {
  const result = ctx.game.social.friends.request(fromUserId, ctx.player.userId);
  if ("requestId" in result) ctx.game.social.friends.accept(ctx.player.userId, result.requestId);
}

function joinParty(ctx: GameContext, memberUserId: string): void {
  const result = ctx.game.social.party.invite(ctx.player.userId, memberUserId);
  if ("inviteId" in result) ctx.game.social.party.accept(memberUserId, result.inviteId);
}

export function stageSocialHub(ctx: GameContext): void {
  const me = ctx.player.userId;
  ctx.scene.entity.spawn("hero", { id: FRIEND_RIN, position: [2, 0, 1], role: "player" });
  ctx.scene.entity.spawn("hero", { id: FRIEND_KIRA, position: [-2, 0, 2], role: "player" });

  acceptFriend(ctx, FRIEND_RIN);
  acceptFriend(ctx, FRIEND_KIRA);
  ctx.game.social.friends.request(STRANGER, me);

  ctx.game.social.party.register({ maxMembers: 4 });
  joinParty(ctx, FRIEND_RIN);
  joinParty(ctx, FRIEND_KIRA);

  ctx.game.social.worldInvites.invite(FRIEND_RIN, me, { serverId: "srv_mesa", joinCode: "MESA42" });

  ctx.game.chat.send(FRIEND_RIN, "global", "anyone up for the mesa run?");
  ctx.game.chat.send(FRIEND_KIRA, "global", "gearing up, two minutes");
  ctx.game.chat.send(FRIEND_KIRA, "party", "pull the slimes toward the rocks");
  ctx.game.chat.send(FRIEND_RIN, "proximity", "psst, over here");

  ctx.game.feed.bind("emote.played");
}

function PanelTitle({ label }: { label: string }) {
  return <p className="mb-1 text-[10px] uppercase tracking-widest text-white/40">{label}</p>;
}

function FriendsPanel() {
  return (
    <div className="pointer-events-auto w-56 rounded bg-black/60 p-2 text-xs">
      <PanelTitle label="Friends" />
      <FriendsList
        className="space-y-1"
        emptyState={<p className="text-white/40">No friends yet</p>}
        renderFriend={(friend) => (
          <FriendRow
            key={friend.userId}
            friend={friend}
            className="flex items-center gap-1.5"
            dotClassName="inline-block h-2 w-2 rounded-full bg-white/30 data-[online=true]:bg-emerald-400"
          >
            <InviteToWorldButton
              toUserId={friend.userId}
              target={HUB_SESSION}
              className="ml-auto rounded border border-white/20 px-1 py-0.5 text-[10px] text-white/70 hover:bg-white/10 disabled:opacity-40"
            >
              Invite
            </InviteToWorldButton>
          </FriendRow>
        )}
      />
      <PanelTitle label="Requests" />
      <FriendRequestsList
        className="space-y-1"
        rowClassName="flex items-center gap-1.5"
        acceptClassName="rounded border border-emerald-300/40 px-1 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-300/10"
        declineClassName="rounded border border-white/20 px-1 py-0.5 text-[10px] text-white/60 hover:bg-white/10"
        emptyState={<p className="text-white/40">None pending</p>}
      />
      <div className="mt-2">
        <AddFriendButton
          toUserId="wanderer"
          className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10 disabled:opacity-40"
        >
          Add “wanderer”
        </AddFriendButton>
      </div>
    </div>
  );
}

function PartyPanel() {
  return (
    <div className="pointer-events-auto w-56 rounded bg-black/60 p-2 text-xs">
      <PanelTitle label="Party" />
      <PartyFrame
        className="space-y-1"
        rowClassName="flex items-center gap-1.5 data-[role=leader]:text-amber-300"
        dotClassName="inline-block h-2 w-2 rounded-full bg-white/30 data-[online=true]:bg-emerald-400"
        emptyState={<p className="text-white/40">Not in a party</p>}
      />
      <LeavePartyButton className="mt-2 rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10" />
    </div>
  );
}

function WorldsPanel({ onStatus }: { onStatus: (status: string) => void }) {
  return (
    <div className="pointer-events-auto w-64 rounded bg-black/60 p-2 text-xs">
      <PanelTitle label="Worlds" />
      <WorldBrowser
        listings={DEMO_WORLD_LISTINGS}
        onJoin={(listing) => onStatus(`Joining ${listing.label ?? listing.serverId}…`)}
        className="space-y-1"
        rowClassName="flex items-center gap-2"
        joinClassName="ml-auto rounded border border-sky-300/40 px-1.5 py-0.5 text-[10px] text-sky-300 hover:bg-sky-300/10 disabled:opacity-40"
      />
      <div className="mt-2 flex items-center gap-2">
        <JoinByCode
          onJoin={(code) => onStatus(`Joining by code ${code}…`)}
          className="flex flex-1 gap-1"
          inputClassName="w-full rounded border border-white/20 bg-black/40 px-1.5 py-0.5 text-[11px] text-white placeholder:text-white/30"
          buttonClassName="rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
        />
        <QuickMatchButton
          listings={DEMO_WORLD_LISTINGS}
          filter={{ mode: "coop" }}
          onJoin={(listing) => onStatus(`Quick match → ${listing.label ?? listing.serverId}`)}
          onNoMatch={() => onStatus("No open worlds")}
          className="rounded border border-amber-300/40 px-1.5 py-0.5 text-[10px] text-amber-300 hover:bg-amber-300/10"
        />
      </div>
    </div>
  );
}

function VoicePanel() {
  const player = usePlayer();
  const transport = useMemo(
    () => createLocalVoiceTransport({ userId: player.userId }).transport,
    [player.userId],
  );
  const voice = useVoice({ transport, channelId: "crew" });
  return (
    <div className="pointer-events-auto w-56 rounded bg-black/60 p-2 text-xs">
      <PanelTitle label="Voice — crew" />
      <VoiceRoster
        voice={voice}
        className="space-y-0.5"
        participantClassName="text-white/70 data-[speaking=true]:text-emerald-300"
      />
      <div className="mt-2 flex gap-1.5">
        <PushToTalkButton
          voice={voice}
          className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10 data-[transmitting=true]:border-emerald-300/60 data-[transmitting=true]:text-emerald-300"
        />
        <MicToggle
          voice={voice}
          className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10 data-[muted=true]:text-red-300"
        />
      </div>
    </div>
  );
}

function SocialHubUI() {
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-white">
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <FriendsPanel />
        <PartyPanel />
      </div>
      <div className="absolute right-4 top-4 flex flex-col gap-2">
        <WorldsPanel onStatus={setStatus} />
        <VoicePanel />
      </div>
      <div className="absolute left-1/2 top-4 -translate-x-1/2 space-y-1">
        <PartyInviteToast
          className="pointer-events-auto rounded bg-black/70 px-2 py-1 text-xs"
          acceptClassName="ml-2 rounded border border-emerald-300/40 px-1 py-0.5 text-[10px] text-emerald-300"
          declineClassName="ml-1 rounded border border-white/20 px-1 py-0.5 text-[10px] text-white/60"
        />
        <WorldInviteToast
          className="pointer-events-auto rounded bg-black/70 px-2 py-1 text-xs"
          acceptClassName="ml-2 rounded border border-sky-300/40 px-1 py-0.5 text-[10px] text-sky-300"
          declineClassName="ml-1 rounded border border-white/20 px-1 py-0.5 text-[10px] text-white/60"
          onAccepted={(target) => setStatus(`Joining ${target.serverId} (${target.joinCode ?? "no code"})…`)}
        />
        {status !== null && (
          <p className="rounded bg-black/70 px-2 py-1 text-center text-xs text-amber-200">{status}</p>
        )}
      </div>
      <div className="absolute bottom-4 right-4 w-80">
        <ChatPanel
          className="pointer-events-auto flex h-64 flex-col rounded bg-black/60 p-2 text-xs"
          tabsClassName="flex gap-1"
          tabClassName="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10"
          activeTabClassName="border-amber-300/60 text-amber-200"
          logClassName="mt-1 flex-1 space-y-0.5 overflow-y-auto"
          messageClassName="flex gap-1.5 [&>[data-chat-from]]:text-sky-300"
          inputClassName="mt-1 flex gap-1"
          inputFieldClassName="w-full rounded border border-white/20 bg-black/40 px-1.5 py-0.5 text-[11px] text-white placeholder:text-white/30"
          sendButtonClassName="rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
          placeholder="Say something…"
        />
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <EmoteWheel
          emotes={DEMO_EMOTES}
          className="pointer-events-auto flex gap-1.5 rounded bg-black/60 p-1.5"
          emoteClassName="rounded border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
          onPlayed={(emoteId) => setStatus(`You ${emoteId} at nearby players`)}
          onRejected={(reason) => setStatus(reason)}
        />
      </div>
    </div>
  );
}

export const socialHubGame: PlayableGame = {
  ...demoGame,
  loop: {
    ...demoGame.loop,
    onNewPlayer(ctx) {
      demoGame.loop.onNewPlayer?.(ctx);
      stageSocialHub(ctx);
    },
  },
  GameUI: SocialHubUI,
};
