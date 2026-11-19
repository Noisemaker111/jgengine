import type { ChatSync } from "@jgengine/core/chat/chatContract";
import { createConvexGameChatSync } from "@jgengine/convex/convexChatSync";
import type { ConvexGameClient } from "@jgengine/convex/createConvexGameTransport";
import { api } from "@llmville/backend/convex/_generated/api";

/** The shared world's chat on the engine's ChatSync, over the world's own Convex functions. */
export function worldChatSync(client: ConvexGameClient): ChatSync {
  return createConvexGameChatSync(client, {
    messages: api.multiplayer.worldChat.messages,
    sendMessage: api.multiplayer.worldChat.sendMessage,
  });
}
