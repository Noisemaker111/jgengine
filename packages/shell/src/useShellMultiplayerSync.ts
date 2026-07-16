import { useEffect, type Dispatch, type SetStateAction } from "react";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { isServerAuthoritative } from "@jgengine/core/runtime/adapter";
import type { PresencePoseRow } from "@jgengine/core/runtime/transport";

import { attachWorldSync } from "./worldSync";
import type { ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";

/** Joins the multiplayer server for the live context and wires presence, feed relay, and chat sync until teardown. */
export function useShellMultiplayerSync(
  ctx: GameContext | null,
  multiplayer: ShellMultiplayer | null,
  playable: PlayableGame,
  serverIdRef: { current: string | null },
  setRemotePlayers: Dispatch<SetStateAction<PresencePoseRow[]>>,
): void {
  useEffect(() => {
    if (ctx === null || multiplayer === null) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];

    void multiplayer.backend.transport
      .joinServer({ gameId: multiplayer.gameId })
      .then((joined) => {
        if (disposed) {
          void multiplayer.backend.transport.leaveServer({ serverId: joined.serverId });
          return;
        }
        serverIdRef.current = joined.serverId;

        if (isServerAuthoritative(playable.game.multiplayer) && multiplayer.backend.feeds !== undefined) {
          cleanups.push(attachWorldSync(multiplayer.backend.feeds, joined.serverId, ctx));
        }

        cleanups.push(
          multiplayer.backend.presenceSync.subscribe(joined.serverId, (rows) => {
            setRemotePlayers(rows.filter((row) => row.userId !== multiplayer.userId));
          }),
        );

        const seen = new Set<string>();
        let injecting = false;
        for (const action of multiplayer.feedActions) {
          cleanups.push(
            ctx.game.feed.subscribe(action, (entry) => {
              if (injecting) return;
              void multiplayer.backend
                .pushFeedEntry({
                  serverId: joined.serverId,
                  action,
                  entry: { at: entry.at, data: entry.data, from: multiplayer.userId },
                })
                .catch(() => undefined);
            }),
          );
          const remoteUnsub = multiplayer.backend.feeds?.subscribeFeed(
            { serverId: joined.serverId, action },
            (view) => {
              for (const raw of view.entries) {
                const remote = raw as { at?: number; data?: unknown; from?: string };
                if (typeof remote.from !== "string" || remote.from === multiplayer.userId) continue;
                const key = `${action}|${remote.from}|${remote.at ?? 0}`;
                if (seen.has(key)) continue;
                seen.add(key);
                injecting = true;
                ctx.game.feed.push(action, remote.data);
                injecting = false;
              }
            },
          );
          if (remoteUnsub !== undefined) cleanups.push(remoteUnsub);
        }

        const chatSync = multiplayer.backend.chatSyncFor?.(joined.serverId);
        if (chatSync !== undefined && ctx.game.chat !== undefined) {
          const chat = ctx.game.chat;
          const globalChannelIds = new Set(
            chat
              .channels()
              .filter((channel) => channel.kind === "global")
              .map((channel) => channel.id),
          );
          const seenRemoteChat = new Set<string>();
          cleanups.push(
            ctx.game.events.subscribe("chat.message", (event) => {
              if (event.fromUserId !== multiplayer.userId) return;
              if (!globalChannelIds.has(event.channelId)) return;
              void chatSync.send(event.channelId, event.body).catch(() => undefined);
            }),
          );
          for (const channelId of globalChannelIds) {
            cleanups.push(
              chatSync.subscribe(channelId, (messages) => {
                for (const message of messages) {
                  if (message.fromUserId === multiplayer.userId) continue;
                  if (seenRemoteChat.has(message.id)) continue;
                  seenRemoteChat.add(message.id);
                  chat.send(message.fromUserId, message.channelId, message.body);
                }
              }),
            );
          }
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      for (const cleanup of cleanups) cleanup();
      const serverId = serverIdRef.current;
      serverIdRef.current = null;
      setRemotePlayers([]);
      if (serverId !== null) {
        void multiplayer.backend.transport.leaveServer({ serverId }).catch(() => undefined);
      }
    };
  }, [ctx, multiplayer, playable]);
}
