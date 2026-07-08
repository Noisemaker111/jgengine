import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";

import type { ChatMessage } from "@jgengine/core/game/chat";
import type {
  ChatActions,
  ChatSendOutcome,
  ChatTransport,
} from "@jgengine/core/multiplayer/chatContract";

export interface ConvexChatFunctions {
  messages: FunctionReference<"query">;
  sendMessage: FunctionReference<"mutation">;
}

/**
 * Wires a game's Convex chat functions into the engine's ChatTransport
 * contract: one live query per subscribed channel (the channel's recent
 * history, newest last) and one send mutation. mapRow converts backend rows
 * into ChatMessage (defaults to structural passthrough); extraArgs is spread
 * into both calls for games that scope chat by server or world.
 */
export function createConvexChatTransport<TRawRow = ChatMessage>(
  functions: ConvexChatFunctions,
  options?: {
    mapRow?: (row: TRawRow) => ChatMessage;
    extraArgs?: Record<string, unknown>;
  },
): ChatTransport {
  const mapRow = options?.mapRow ?? ((row: TRawRow) => row as unknown as ChatMessage);
  const extraArgs = options?.extraArgs ?? {};

  function useMessages(channelId: string | "skip"): readonly ChatMessage[] | undefined {
    const raw = useQuery(
      functions.messages,
      channelId === "skip" ? "skip" : { ...extraArgs, channelId },
    ) as TRawRow[] | undefined;
    return useMemo(() => raw?.map(mapRow), [raw]);
  }

  function useActions(): ChatActions {
    const sendMessage = useMutation(functions.sendMessage);
    return useMemo<ChatActions>(
      () => ({
        async sendMessage(args) {
          const result = (await sendMessage({
            ...extraArgs,
            channelId: args.channelId,
            body: args.body,
          })) as ChatSendOutcome | null | undefined;
          return result ?? { ok: true };
        },
      }),
      [sendMessage],
    );
  }

  return { useMessages, useActions };
}
