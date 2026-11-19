import type { FunctionReference } from "convex/server";

import type { ChatMessage } from "@jgengine/core/chat/chat";
import type { ChatSendOutcome, ChatSync } from "@jgengine/core/chat/chatContract";

import { watchConvexQuery, type ConvexGameClient } from "./createConvexGameTransport";

/** The two Convex functions a game owns for its own chat: a channel's recent messages, and send. */
export interface ConvexChatFunctions {
  messages: FunctionReference<"query">;
  sendMessage: FunctionReference<"mutation">;
}

/**
 * A game's own Convex chat functions on the engine's {@link ChatSync}: one live query per subscribed
 * channel (its recent history, newest last) and one send mutation, through the client's `watchQuery`
 * and `mutation`. No UI hooks, so any runtime can hold it. `mapRow` turns backend rows into
 * {@link ChatMessage} (rows pass through when they already are); `extraArgs` goes into both calls for
 * a game that scopes chat by server or world.
 *
 * @capability convex-chat a game's own Convex chat functions as a ChatSync with live channel history and send
 */
export function createConvexGameChatSync<TRawRow = ChatMessage>(
  client: ConvexGameClient,
  functions: ConvexChatFunctions,
  options?: { mapRow?: (row: TRawRow) => ChatMessage; extraArgs?: Record<string, unknown> },
): ChatSync {
  const mapRow = options?.mapRow ?? ((row: TRawRow) => row as unknown as ChatMessage); // type-escape: rows already shaped as ChatMessage pass through
  const extraArgs = options?.extraArgs ?? {};
  return {
    subscribe(channelId, onChange) {
      return watchConvexQuery(client, functions.messages, { ...extraArgs, channelId }, (rows: TRawRow[]) => rows.map(mapRow), onChange);
    },
    async send(channelId, body) {
      const outcome = (await client.mutation(functions.sendMessage, { ...extraArgs, channelId, body })) as ChatSendOutcome | null | undefined;
      return outcome ?? { ok: true };
    },
  };
}
