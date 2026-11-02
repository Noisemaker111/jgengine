import { createConvexChatTransport } from "@jgengine/convex/convexChatTransport";
import { api } from "@llmville/backend/convex/_generated/api";

/** The shared world's chat on the engine chat contract. Its members are hooks, so it is created once. */
export const worldChatTransport = createConvexChatTransport({
  messages: api.multiplayer.worldChat.messages,
  sendMessage: api.multiplayer.worldChat.sendMessage,
});
